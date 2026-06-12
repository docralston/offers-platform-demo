/**
 * Toyota scraper: Playwright browser flow, set ZIP 18901, load offers page,
 * intercept XHR/fetch, collect payloads. No HTML scraping; capture network only.
 */

import fs from 'fs';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import {
  TOYOTA_ZIP,
  BUYATOYOTA_OFFERS_URL,
  NAVIGATION_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  CAPTURE_SETTLE_MS,
} from './constants';
import type { CapturedResponse } from './types';

export interface ScraperResult {
  ok: boolean;
  url: string;
  responses: CapturedResponse[];
  screenshotPath?: string;
  error?: string;
  debug?: {
    zipAttempted: boolean;
    zipUiAttempted: boolean;
    zipEvidence?: {
      cookiesZip?: Array<{ name: string; value: string }>;
      localStorageZip?: Record<string, string>;
    };
  };
}

/** URL patterns that might contain offers/incentives data (structural; avoid bundle-specific paths). */
const OFFER_URL_PATTERNS = [
  /offer/i,
  /incentive/i,
  /program/i,
  /deal/i,
  /promotion/i,
  /api\//i,
  /graphql/i,
  /\.json/i,
];

function matchesOfferUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const pathAndSearch = u.pathname + u.search;
    return OFFER_URL_PATTERNS.some((p) => p.test(pathAndSearch));
  } catch {
    return false;
  }
}

/**
 * Set ZIP to 18901 and confirm it took effect.
 * Tries cookie and localStorage; document exact keys when discovered from live site.
 */
export async function ensureZip18901(page: Page): Promise<boolean> {
  const zip = TOYOTA_ZIP;

  // Try common cookie names
  await page.context().addCookies([
    { name: 'zipCode', value: zip, domain: '.buyatoyota.com', path: '/' },
    { name: 'zip', value: zip, domain: '.buyatoyota.com', path: '/' },
    { name: 'regionZip', value: zip, domain: '.buyatoyota.com', path: '/' },
  ]);

  // Try localStorage (often used by SPAs for region)
  const set = await page.evaluate(
    (z) => {
      try {
        const keys = ['zipCode', 'zip', 'regionZip', 'dealerZip', 'locationZip'];
        keys.forEach((k) => {
          if (typeof localStorage !== 'undefined') localStorage.setItem(k, z);
        });
        return (localStorage.getItem('zipCode') ?? localStorage.getItem('zip')) === z;
      } catch {
        return false;
      }
    },
    zip
  );

  if (set) return true;

  // Confirm via read-back
  const read = await page.evaluate(() => {
    try {
      return (
        (typeof localStorage !== 'undefined' &&
          (localStorage.getItem('zipCode') ?? localStorage.getItem('zip'))) ??
        null
      );
    } catch {
      return null;
    }
  });

  return read === zip;
}

/**
 * Best-effort ZIP set via UI (fallback when cookies/localStorage aren't enough).
 * This is NOT HTML scraping; it's deterministic UI automation to unlock zip-gated requests.
 */
async function ensureZipViaUi(page: Page): Promise<boolean> {
  const zip = TOYOTA_ZIP;
  try {
    const roleZip = page.getByRole('textbox', { name: /zip/i });
    const input = (await roleZip.count())
      ? roleZip.first()
      : page
          .locator(
            'input[placeholder*=\"ZIP\" i], input[aria-label*=\"ZIP\" i], input[name*=\"zip\" i], input[inputmode=\"numeric\"], input[type=\"tel\"]'
          )
          .first();

    if (!(await input.count())) return false;

    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click({ timeout: 2000 }).catch(() => {});
    await input.fill(zip, { timeout: 2000 }).catch(() => {});
    await input.press('Enter').catch(() => {});

    // Common buttons to confirm ZIP
    const btn = page
      .getByRole('button', { name: /go|update|apply|submit|search/i })
      .first();
    if (await btn.count()) {
      await btn.click({ timeout: 2000 }).catch(() => {});
    }

    await page.waitForTimeout(1500);
    return true;
  } catch {
    // ignore
  }
  return false;
}

async function captureBody(
  response: import('playwright').Response,
  options?: { maxTextChars?: number }
): Promise<unknown | null> {
  const maxTextChars = options?.maxTextChars ?? 10_000;
  try {
    // Try JSON first
    const j = await response.json().catch(() => null);
    if (j != null) return j;
    // Fallback to text that might still be JSON
    const txt = await response.text().catch(() => '');
    const t = (txt ?? '').trim();
    if (!t) return null;
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t);
      } catch {
        // keep limited text for debugging
        return { _text: t.slice(0, maxTextChars) };
      }
    }
    // keep limited text for debugging
    return { _text: t.slice(0, maxTextChars) };
  } catch {
    return null;
  }
}

/**
 * Run the Toyota offers scrape: launch browser, set ZIP 18901, load offers page,
 * capture all relevant XHR/fetch responses, return raw payload.
 */
export async function runToyotaScraper(options?: {
  artifactsDir?: string;
  headless?: boolean;
  channel?: 'chrome' | 'chromium';
  /** Optional persistent browser profile directory to emulate a real session (WAF/cookies). */
  userDataDir?: string;
  /** Optional Playwright storage state file (cookies + localStorage). */
  storageStatePath?: string;
}): Promise<ScraperResult> {
  const artifactsDir = options?.artifactsDir; // when undefined (e.g. preview), no artifact files are written
  const headless = options?.headless ?? true;
  const userDataDir = options?.userDataDir
    ? path.isAbsolute(options.userDataDir)
      ? options.userDataDir
      : path.join(process.cwd(), options.userDataDir)
    : undefined;
  const storageStatePath = options?.storageStatePath
    ? path.isAbsolute(options.storageStatePath)
      ? options.storageStatePath
      : path.join(process.cwd(), options.storageStatePath)
    : undefined;
  const responses: CapturedResponse[] = [];
  let browser: Browser | null = null;

  try {
    // Prefer storageState over userDataDir (storageState is more reliable for CI and avoids profile contention).
    // Only use persistent context if explicitly requested (e.g., TOYOTA_USE_PERSISTENT_CONTEXT=1) or if no storageState is available.
    const usePersistentContext =
      userDataDir &&
      !storageStatePath &&
      process.env.TOYOTA_USE_PERSISTENT_CONTEXT === '1';

    if (userDataDir && usePersistentContext) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    // Use a persistent context only when explicitly requested (avoids profile contention in CI).
    const context = usePersistentContext
      ? await chromium.launchPersistentContext(userDataDir!, {
          headless,
          channel: options?.channel,
          // Reduce automation signals (best-effort).
          ignoreDefaultArgs: ['--enable-automation'],
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
          ],
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 720 },
          locale: 'en-US',
          timezoneId: 'America/New_York',
        })
      : await (async () => {
          browser = await chromium.launch({
            headless,
            channel: options?.channel,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
              '--disable-infobars',
            ],
          });
          return browser.newContext({
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'en-US',
            timezoneId: 'America/New_York',
            storageState: storageStatePath && fs.existsSync(storageStatePath) ? storageStatePath : undefined,
          });
        })();

    if (!browser) browser = context.browser();

    context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    // Reduce basic automation signals (best-effort).
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      } catch {}
    });
    
    // Fix for tsx __name error: define __name helper that Playwright expects
    // Use pure JavaScript string to avoid any TypeScript transpilation issues
    await context.addInitScript(`
      (function() {
        try {
          if (typeof window !== 'undefined' && !window.__name) {
            window.__name = function(func) { return func; };
          }
        } catch (e) {
          // ignore
        }
      })();
    `);
    // In-page network hook: captures fetch/XHR even if responses are satisfied by caches/service workers.
    // Applied at the context level so it runs in all frames.
    await context.addInitScript(() => {
      const g: any = window as any;
      if (g.__toyotaNetworkLog) return;
      g.__toyotaNetworkLog = [];

      const push = (entry: any) => {
        try {
          g.__toyotaNetworkLog.push(entry);
          if (g.__toyotaNetworkLog.length > 500) g.__toyotaNetworkLog.shift();
        } catch {
          // ignore
        }
      };

      // Hook fetch
      try {
        const origFetch = window.fetch.bind(window);
        window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
          const url = typeof input === 'string' ? input : (input && typeof (input as any).url === 'string' ? (input as any).url : undefined);
          const method = init?.method || 'GET';
          const start = Date.now();
          try {
            // Playwright strict Tuple type workaround (fixed: use correct arguments and avoid referencing 'args')
            const res = await origFetch(input, init);
            const clone = res.clone();
            let text = '';
            try {
              text = await clone.text();
            } catch {}
            push({
              kind: 'fetch',
              url,
              method,
              status: res.status,
              elapsedMs: Date.now() - start,
              text: text ? text.slice(0, 200_000) : '',
            });
            return res;
          } catch (e: any) {
            push({
              kind: 'fetch',
              url,
              method,
              status: null,
              elapsedMs: Date.now() - start,
              error: String(e?.message || e),
            });
            throw e;
          }
        };
      } catch {}

      // Hook XHR
      try {
        const XHR = XMLHttpRequest.prototype as any;
        const origOpen = XHR.open;
        const origSend = XHR.send;
        XHR.open = function (method: string, url: string, ...rest: any[]) {
          const xhr = this as XMLHttpRequest & { __toyota?: { method: string; url: string; start: number } };
          xhr.__toyota = { method, url, start: Date.now() };
          return origOpen.call(xhr, method, url, ...rest);
        };
        XHR.send = function (...rest: any[]) {
          const self = this as XMLHttpRequest & { __toyota?: { method: string; url: string; start: number } };
          const meta = self.__toyota || { method: 'GET', url: '', start: Date.now() };
          const onLoadEnd = () => {
            try {
              const txt = typeof self.responseText === 'string' ? self.responseText : '';
              push({
                kind: 'xhr',
                url: meta.url,
                method: meta.method,
                status: self.status,
                elapsedMs: Date.now() - meta.start,
                text: txt ? txt.slice(0, 200_000) : '',
              });
            } catch {}
          };
          self.addEventListener('loadend', onLoadEnd);
          return origSend.apply(this, rest);
        };
      } catch {}
    });

    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_LOAD_TIMEOUT_MS);

    // Capture responses for XHR/fetch (do not rely on URL patterns; UI bundles change often).
    page.on('response', async (response) => {
      try {
        const req = response.request();
        const rt = req.resourceType();
        const url = response.url();

        if (rt === 'xhr' || rt === 'fetch') {
          const body = await captureBody(response, { maxTextChars: 50_000 });
          if (body == null) return;
          responses.push({ url, status: response.status(), body });
          return;
        }

        // Capture the main document response (may include embedded JSON state that drives the SPA).
        if (rt === 'document' && url.startsWith(BUYATOYOTA_OFFERS_URL)) {
          const body = await captureBody(response, { maxTextChars: 1_000_000 });
          if (body == null) return;
          responses.push({ url, status: response.status(), body });
          return;
        }

        // Script bundles may contain embedded data or reveal API endpoints; capture Toyota bundles only (truncated).
        if (
          rt === 'script' &&
          (url.includes('nexus.toyota.com/toyotanational/t-bat-prod/code/') ||
            url.includes('www.buyatoyota.com/_next/') ||
            url.includes('www.buyatoyota.com/centralatlantic/'))
        ) {
          const body = await captureBody(response, { maxTextChars: 200_000 });
          if (body == null) return;
          responses.push({ url, status: response.status(), body });
        }
      } catch {
        // ignore
      }
    });

    // Load offers page with WAF/interstitial retry logic
    const navResult = await navigateWithWafRetries(page, BUYATOYOTA_OFFERS_URL, {
      maxRetries: 3,
      ...(artifactsDir && { artifactsDir }),
    });

    if (!navResult.success) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      return {
        ok: false,
        url: BUYATOYOTA_OFFERS_URL,
        responses,
        screenshotPath: navResult.screenshotPath,
        error:
          `BuyAToyota navigation failed: ${navResult.error} (headless=${headless}, userDataDir=${userDataDir ?? 'none'}, storageStatePath=${storageStatePath ?? 'none'})`,
      };
    }

    const zipOk = await ensureZip18901(page);
    if (!zipOk) await ensureZip18901(page);

    const zipUiOk = await ensureZipViaUi(page);

    const zipEvidence = await collectZipEvidence(page).catch(() => undefined);

    // Reload so any zip-dependent requests fire with 18901
    await page.reload({ waitUntil: 'networkidle', timeout: PAGE_LOAD_TIMEOUT_MS });

    // Wait for client-side hydration to complete (offers may be loaded via JS)
    // Wait for offers to actually appear on the page
    try {
      // Wait for any offer-like content to appear
      await page.waitForFunction(
        () => {
          const bodyText = document.body?.textContent || '';
          // Check if page has loaded offer content (not just loading/empty)
          return bodyText.length > 500 && (
            /\$\d+/.test(bodyText) || // Has dollar amounts
            /\d+%/.test(bodyText) || // Has percentages
            /lease|finance|payment|apr/i.test(bodyText) // Has offer terms
          );
        },
        { timeout: 15000 }
      ).catch(() => {});
    } catch {
      // ignore
    }
    
    // Additional wait for dynamic content
    await page.waitForTimeout(3000);

    // Scroll to trigger lazy-loaded offers (many SPAs load content on scroll)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    // Wait for network idle after scrolling (ensures lazy-loaded content finishes loading)
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Allow XHR/fetch to settle (increased wait time for lazy-loaded content)
    await new Promise((r) => setTimeout(r, CAPTURE_SETTLE_MS * 3));

    // Pull in-page network log (fetch/XHR) and store as a captured response for extraction.
    try {
      const log = await page.evaluate(() => (window as any).__toyotaNetworkLog ?? []);
      if (Array.isArray(log) && log.length > 0) {
        responses.push({
          url: 'page://network-log',
          status: 200,
          body: { entries: log },
        });
      }
    } catch {
      // ignore
    }

    // Extract __NEXT_DATA__ directly from the DOM (it's in a script tag, not window object)
    // This is critical because the HTML response gets truncated at 1MB
    // Wait for it to appear since it might be added dynamically
    try {
      await page.waitForSelector('script#__NEXT_DATA__', { timeout: 10000 }).catch(() => {});
      const nextDataScript = await page.evaluate(() => {
        const script = document.querySelector('script#__NEXT_DATA__');
        if (script && script.textContent) {
          try {
            return JSON.parse(script.textContent);
          } catch {
            return null;
          }
        }
        return null;
      });
      if (nextDataScript) {
        responses.push({
          url: 'dom://__NEXT_DATA__',
          status: 200,
          body: nextDataScript,
        });
      }
    } catch {
      // ignore
    }

    // Extract offers directly from rendered DOM elements as fallback
    // This is the most reliable method when API calls aren't captured
    let domExtractionAttempted = false;
    try {
      // Wait for offers to actually appear on the page with a more specific check
      try {
        await page.waitForFunction(
          () => {
            // Check for offer cards or offer-related content
            const articles = document.querySelectorAll('article');
            const offerElements = document.querySelectorAll('[class*="offer"], [data-testid*="offer"]');
            const bodyText = document.body?.textContent || '';
            return (
              articles.length > 5 ||
              offerElements.length > 5 ||
              (bodyText.length > 1000 && (/\$\d+/.test(bodyText) || /\d+%/.test(bodyText)))
            );
          },
          { timeout: 20000 }
        );
      } catch {
        // Timeout is OK - we'll still try to extract
      }

      // Additional wait for dynamic content to fully render
      await page.waitForTimeout(5000);
      domExtractionAttempted = true;

      const domResult = await page.evaluate(() => {
        // Pure JavaScript - no TypeScript syntax to avoid helper injection
        const offers = [];
        const seen = new Set();
        const today = new Date();
        const startDateStr = today.toISOString().split('T')[0];
        
        // Parse expiration date from various formats
        function parseExpDate(text: string) {
          // Try "Exp. MM/DD/YY" format
          let expMatch = text.match(/Exp\.\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
          if (expMatch) {
            const month = parseInt(expMatch[1]);
            const day = parseInt(expMatch[2]);
            let year = parseInt(expMatch[3]);
            if (year < 100) year += 2000;
            return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
          }
          // Try "Expires MM/DD/YY" format
          expMatch = text.match(/Expires\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
          if (expMatch) {
            const month = parseInt(expMatch[1]);
            const day = parseInt(expMatch[2]);
            let year = parseInt(expMatch[3]);
            if (year < 100) year += 2000;
            return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
          }
          return null;
        }
        
        // Prefer exact structure: offer-card-inner is the root that contains header, content div (with offer-tt-typeWrapper + two <p>s), footer
        let offerCards: Element[] = Array.from(document.querySelectorAll('[class*="offer-card-inner"]'));
        if (offerCards.length === 0) {
          const selectors = [
            'article[class*="offer"]',
            '[class*="offer-card"]',
            '[class*="offerCard"]',
            '[data-testid*="offer"]',
            'article',
            '[role="article"]',
            '[class*="card"]',
          ];
          for (const sel of selectors) {
            const found = Array.from(document.querySelectorAll(sel));
            if (found.length > 0) {
              offerCards = found;
              break;
            }
          }
        }
        
        // If still no cards found, look for any element with offer-like content
        if (offerCards.length === 0) {
          const allElements = Array.from(document.querySelectorAll('*'));
          const candidates: Element[] = [];
          for (const el of allElements) {
            const text = el.textContent || '';
            // Look for elements with year + model + price/APR
            if (
              text.length > 30 &&
              (/\d{4}\s+[A-Z]/.test(text) || /\$\d+/.test(text) || /\d+%/.test(text)) &&
              (/lease|finance|payment|apr|toyota/i.test(text) || /\$\d+/.test(text))
            ) {
              // Check if it's not nested inside another candidate
              let isNested = false;
              for (const candidate of candidates) {
                if (candidate.contains(el)) {
                  isNested = true;
                  break;
                }
              }
              if (!isNested) {
                candidates.push(el);
              }
            }
          }
          offerCards = candidates;
        }
        
        // Get card text excluding offer-card-header (e.g. "Hybrids and", "Crossovers and")
        function getCardTextWithoutHeader(card: Element) {
          const clone = card.cloneNode(true) as Element;
          const headers = clone.querySelectorAll ? clone.querySelectorAll('[class*="offer-card-header"]') : [];
          for (let i = 0; i < headers.length; i++) headers[i].remove();
          return (clone.textContent || '').trim();
        }
        // Full card text (no header removal) for spec-line search - spec may live in header area
        function getFullCardText(card: Element) {
          return (card.textContent || '').trim();
        }
        
        // Spec line lives in the *Lease* block: div with offer-tt-typeWrapper containing "Lease", then <p>s. The spec line <p> is the one containing (code) e.g. "(6953) 4WD Wagon XLE L4 8AT-F".
        // (The 2nd direct <p> can be "Lease Offer" / "Lease Cash Offer"; the actual spec line is often the 3rd <p>. So we scan direct <p>s for one matching \(\d+\).)
        function getSpecLineFromOfferCardStructure(card: Element) {
          const typeWrappers = card.querySelectorAll ? card.querySelectorAll('[class*="offer-tt-typeWrapper"]') : [];
          for (let i = 0; i < typeWrappers.length; i++) {
            const typeWrapper = typeWrappers[i];
            const wrapperText = (typeWrapper.textContent || '').trim();
            if (!/lease/i.test(wrapperText)) continue;
            if (!typeWrapper.parentElement) continue;
            const contentDiv = typeWrapper.parentElement;
            const directPs = Array.from(contentDiv.children).filter(function(c) { return c.tagName === 'P'; });
            for (let j = 0; j < directPs.length; j++) {
              const specText = (directPs[j].textContent || '').trim();
              if (specText && /\(\d+\)/.test(specText)) return specText;
            }
          }
          // Fallback: any <p> in the card that looks like a spec line (starts with (code))
          const allPs = card.querySelectorAll ? card.querySelectorAll('p') : [];
          for (let i = 0; i < allPs.length; i++) {
            const t = (allPs[i].textContent || '').trim();
            if (/^\(\d+\)/.test(t) && t.length > 5) return t;
          }
          return null;
        }
        
        // Debug: what did we see for spec-line extraction? (serializable for artifact file)
        function getSpecLineDebug(card: Element, cardIndex: number) {
          const cardClassName = (card.getAttribute && card.getAttribute('class')) || '';
          const hasOfferCardInner = cardClassName.indexOf('offer-card-inner') >= 0;
          const typeWrappers = card.querySelectorAll ? card.querySelectorAll('[class*="offer-tt-typeWrapper"]') : [];
          let contentDivDirectPsLength = null;
          let specLineFromTypeWrapper = null;
          let leaseTypeWrapperFound = false;
          for (let i = 0; i < typeWrappers.length; i++) {
            const tw = typeWrappers[i];
            if (/lease/i.test((tw.textContent || '').trim())) {
              leaseTypeWrapperFound = true;
              if (tw.parentElement) {
                const contentDiv = tw.parentElement;
                const directPs = Array.from(contentDiv.children).filter(function(c) { return c.tagName === 'P'; });
                contentDivDirectPsLength = directPs.length;
                for (let j = 0; j < directPs.length; j++) {
                  const t = (directPs[j].textContent || '').trim();
                  if (t && /\(\d+\)/.test(t)) {
                    specLineFromTypeWrapper = t;
                    break;
                  }
                }
              }
              break;
            }
          }
          const typeWrapperFound = typeWrappers.length > 0;
          let specLineFromFallbackP = null;
          const allPs = card.querySelectorAll ? card.querySelectorAll('p') : [];
          for (let i = 0; i < allPs.length; i++) {
            const t = (allPs[i].textContent || '').trim();
            if (/^\(\d+\)/.test(t) && t.length > 5) {
              specLineFromFallbackP = t;
              break;
            }
          }
          const specLineReturned = getSpecLineFromOfferCardStructure(card);
          const fullText = (card.textContent || '').trim();
          const isLeaseCard = /\$\s*\d[\d,]*\s*\/\s*mo|due\s+at\s+signing/i.test(fullText);
          return {
            cardIndex,
            cardClassName,
            hasOfferCardInner,
            typeWrapperFound: typeWrapperFound,
            leaseTypeWrapperFound,
            contentDivDirectPsLength,
            specLineFromTypeWrapper,
            specLineFromFallbackP,
            specLineReturned,
            isLeaseCard,
            pCount: allPs.length,
          };
        }
        
        // Rebate/special offers we don't support yet; header fragments that are not model names
        const SKIP_MODELS = ['college', 'military', 'hybrids and', 'crossovers and'];
        function isInvalidModel(m: string) {
          if (!m || m.length < 2) return true;
          const lower = m.toLowerCase().trim();
          if (SKIP_MODELS.indexOf(lower) >= 0) return true;
          if (lower.endsWith(' and')) return true;
          return false;
        }
        
        function normalizeModel(model: string, cardText: string) {
          const t = (cardText || '').toLowerCase();
          const m = model.trim();
          if (m === 'Land') return 'Land Cruiser';
          if (m === 'Grand') return t.indexOf('grand highlander hybrid') >= 0 ? 'Grand Highlander Hybrid' : 'Grand Highlander';
          if (m === 'GR') {
            if (t.indexOf('supra') >= 0) return 'GR Supra';
            if (t.indexOf('corolla') >= 0) return 'GR Corolla';
            return 'GR';
          }
          // Expand base model to full model+trim when card text indicates variant
          if (m === 'Prius' && (t.indexOf('plug-in') >= 0 || t.indexOf('plug in') >= 0)) return 'Prius Plug-in Hybrid';
          if (m === 'Tundra' && t.indexOf('i-force') >= 0) return 'Tundra i-FORCE MAX';
          if (m === 'Corolla' && t.indexOf('hatchback') >= 0) return 'Corolla Hatchback';
          return m;
        }
        
        // Parse lease trim (grade only) and model code from spec line e.g. "(2557) 2WD 4Dr. Sedan XSE Hybrid CVT" or "4432 4WD 5Dr. Wagon LE"
        // Returns { trim: "XSE", modelCode: 2557 } or null
        function parseTrimAndModelCodeFromSpecLine(specLine: string) {
          if (!specLine || typeof specLine !== 'string') return null;
          const trimGrades = ['XSE', 'XLE', 'LE', 'SE', 'L', 'Limited', 'Platinum', 'SR5', 'SR', 'TRD Off-Road', 'TRD Sport', 'TRD', 'Premium', 'Nightshade'];
          let modelCode: number | null = null;
          const parenMatch = specLine.match(/\((\d+)\)/);
          if (parenMatch) {
            const n = parseInt(parenMatch[1], 10);
            if (!Number.isNaN(n)) modelCode = n;
          }
          if (modelCode == null) {
            const fourDigit = specLine.match(/\b([1-9]\d{3})\b/);
            if (fourDigit) {
              const n = parseInt(fourDigit[1], 10);
              if (n >= 1000 && n <= 9999 && (n < 2000 || n > 2100)) modelCode = n;
            }
          }
          if (modelCode == null) return null;
          for (const grade of trimGrades) {
            const re = new RegExp('\\b' + grade.replace(/\s/g, '\\s+') + '\\b', 'i');
            if (re.test(specLine)) return { trim: grade, modelCode: modelCode };
          }
          return null;
        }
        
        // Normalize fullwidth/special parentheses to ASCII so (code) regex matches
        function normalizeParens(s: string) {
          if (!s || typeof s !== 'string') return s;
          return s.replace(/\uFF08/g, '(').replace(/\uFF09/g, ')');
        }
        
        function runSpecExtractionOnText(fromText: string) {
          const normalized = normalizeParens(fromText);
          const specLinePattern = /2WD|4WD|4Dr|5Dr|Sedan|SUV|Wagon|Hybrid|CVT|Dr\.|CrewMax|Crew\s*Max|Double\s*Cab|Cab|Bed/i;
          // Try any (code) fragment first - lease spec can be short e.g. "(4432) LE L4 8AT" without 2WD/Wagon
          const allParenFragments = normalized.match(/\(\d+\)[^(\n]{2,150}/g);
          if (allParenFragments) {
            for (let fi = 0; fi < allParenFragments.length; fi++) {
              const parsed = parseTrimAndModelCodeFromSpecLine(allParenFragments[fi]);
              if (parsed) return parsed;
            }
          }
          const specInText = normalized.match(/\(\d+\)[^(\n]{10,120}/);
          if (specInText && specLinePattern.test(specInText[0])) {
            const parsed = parseTrimAndModelCodeFromSpecLine(specInText[0]);
            if (parsed) return parsed;
          }
          const codeRe = /\(\d+\)/g;
          let codeMatch;
          while ((codeMatch = codeRe.exec(normalized)) !== null) {
            const chunk = normalized.slice(codeMatch.index, codeMatch.index + 150);
            const parsed = parseTrimAndModelCodeFromSpecLine(chunk);
            if (parsed) return parsed;
          }
          const fourDigitRe = /\b([1-9]\d{3})\b/g;
          let fourMatch;
          while ((fourMatch = fourDigitRe.exec(normalized)) !== null) {
            const n = parseInt(fourMatch[1], 10);
            if (n >= 2000 && n <= 2100) continue;
            const chunk = normalized.slice(fourMatch.index, fourMatch.index + 120);
            const parsed = parseTrimAndModelCodeFromSpecLine(chunk);
            if (parsed) return parsed;
          }
          return null;
        }
        
        const specLineDebug = [];
        const maxDebugCards = 100;
        const leaseCardDomSnapshots = [];
        const maxLeaseDomSnapshots = 3;
        function serializeElementForSnapshot(el: Element, depth: number): Record<string, unknown> {
          if (depth > 5) return { _: '…' };
          const tag = el.tagName ? el.tagName.toLowerCase() : '';
          const cls = (el.getAttribute && el.getAttribute('class')) || '';
          let text = (el.textContent || '').trim();
          if (text.length > 300) text = text.slice(0, 300) + '…';
          const childNodes = el.children && el.children.length ? Array.from(el.children) : [];
          const children = childNodes.length ? childNodes.map(function(c) { return serializeElementForSnapshot(c as Element, depth + 1); }) : undefined;
          const out: Record<string, unknown> = { tag, class: cls };
          if (text) out.text = text;
          if (children && children.length) out.children = children;
          return out;
        }
        for (const card of offerCards) {
          const text = getCardTextWithoutHeader(card);
          const fullCardText = getFullCardText(card);
          // Spec line (trim/modelCode) exists only on lease cards; finance cards don't have it
          const isLeaseCard = /\$\s*\d[\d,]*\s*\/\s*mo|due\s+at\s+signing/i.test(fullCardText);
          if (specLineDebug.length < maxDebugCards) {
            specLineDebug.push(getSpecLineDebug(card, specLineDebug.length));
          }
          if (isLeaseCard && leaseCardDomSnapshots.length < maxLeaseDomSnapshots) {
            leaseCardDomSnapshots.push(serializeElementForSnapshot(card, 0));
          }
          
          // Trim and model code from spec line — only on lease cards; search entire card (full text including header)
          let trimStr = null;
          let modelCodeNum = null;
          if (isLeaseCard) {
            // Known DOM: offer-card-inner > 2nd child div > 2nd <p> is the spec line
            const specLineFromDom = getSpecLineFromOfferCardStructure(card);
            if (specLineFromDom) {
              const parsed = parseTrimAndModelCodeFromSpecLine(normalizeParens(specLineFromDom));
              if (parsed) {
                trimStr = parsed.trim;
                modelCodeNum = parsed.modelCode;
              }
            }
            if (trimStr == null || modelCodeNum == null) {
            const specLinePattern = /2WD|4WD|4Dr|5Dr|Sedan|SUV|Wagon|Hybrid|CVT|Dr\.|CrewMax|Crew\s*Max|Double\s*Cab|Cab|Bed/i;
            const paragraphs = card.querySelectorAll ? card.querySelectorAll('p') : [];
            for (let i = 0; i < paragraphs.length; i++) {
              const pText = normalizeParens((paragraphs[i].textContent || '').trim());
              if (/^\(\d+\)/.test(pText) && specLinePattern.test(pText)) {
                const parsed = parseTrimAndModelCodeFromSpecLine(pText);
                if (parsed) {
                  trimStr = parsed.trim;
                  modelCodeNum = parsed.modelCode;
                  break;
                }
              }
            }
            if (trimStr == null || modelCodeNum == null) {
              for (let i = 0; i < paragraphs.length; i++) {
                const pText = normalizeParens((paragraphs[i].textContent || '').trim());
                if (/\(\d+\)/.test(pText) && specLinePattern.test(pText)) {
                  const parsed = parseTrimAndModelCodeFromSpecLine(pText);
                  if (parsed) {
                    if (trimStr == null) trimStr = parsed.trim;
                    if (modelCodeNum == null) modelCodeNum = parsed.modelCode;
                    break;
                  }
                }
              }
            }
            // Search entire card (full text) for spec line — header area may contain it
            if (trimStr == null || modelCodeNum == null) {
              const parsed = runSpecExtractionOnText(fullCardText);
              if (parsed) {
                if (trimStr == null) trimStr = parsed.trim;
                if (modelCodeNum == null) modelCodeNum = parsed.modelCode;
              }
            }
            // Spec line may live in parent (one parent = one vehicle with spec + lease + finance blocks)
            if ((trimStr == null || modelCodeNum == null) && card.parentElement) {
              const parentText = (card.parentElement.textContent || '').trim();
              const parsed = runSpecExtractionOnText(parentText);
              if (parsed) {
                if (trimStr == null) trimStr = parsed.trim;
                if (modelCodeNum == null) modelCodeNum = parsed.modelCode;
              }
            }
            if ((trimStr == null || modelCodeNum == null) && card.parentElement?.parentElement) {
              const grandparentText = (card.parentElement.parentElement.textContent || '').trim();
              const parsed = runSpecExtractionOnText(grandparentText);
              if (parsed) {
                if (trimStr == null) trimStr = parsed.trim;
                if (modelCodeNum == null) modelCodeNum = parsed.modelCode;
              }
            }
            if ((trimStr == null || modelCodeNum == null) && card.previousElementSibling) {
              const prevText = (card.previousElementSibling.textContent || '').trim();
              const parsed = runSpecExtractionOnText(prevText);
              if (parsed) {
                if (trimStr == null) trimStr = parsed.trim;
                if (modelCodeNum == null) modelCodeNum = parsed.modelCode;
              }
            }
            }
          }
          
          // Skip if doesn't look like an offer card
          if (text.length < 30) continue;
          if (!(/\$\d+/.test(text) || /\d+%/.test(text) || /lease|finance|payment|apr/i.test(text))) continue;
          
          // Extract expiration date (optional - don't skip if not found)
          const endDateStr = parseExpDate(text);
          
          // Extract model and year - use greedy capture so we get full model+trim
          // (e.g. "Prius Plug-in Hybrid", "Tundra i-FORCE MAX", "Corolla Hatchback")
          let modelYearMatch = text.match(/(\d{4})\s+([A-Za-z0-9][A-Za-z0-9\s\-]{1,})/);
          if (!modelYearMatch) {
            // Try without year - just model name (greedy to include trim)
            const modelOnlyMatch = text.match(/([A-Za-z0-9][A-Za-z0-9\s\-]{3,})(?=\s|$|APR|Lease|Cash|Offer)/);
            if (modelOnlyMatch) {
              // Create a match-like array structure: [fullMatch, group1, group2, ...]
              // For this case: [fullMatch, year, model]
              const currentYear = new Date().getFullYear();
              modelYearMatch = [
                modelOnlyMatch[0], // Full match
                currentYear.toString(), // Year (group 1)
                modelOnlyMatch[1] || '' // Model (group 2)
              ];
            }
          }
          if (!modelYearMatch) continue;
          const year = modelYearMatch[1] ? parseInt(modelYearMatch[1]) : new Date().getFullYear();
          let model = (modelYearMatch[2] || modelYearMatch[1] || '').trim();
          
          // Clean up model name - remove common suffixes and stop at APR/Offer/etc
          model = model.replace(/\s*(?:Customer\s*)?(APR|Lease|Cash|Offer|at\s+\d+).*$/i, '').trim();
          model = model.replace(/\s*Customer\s*$/i, '').trim();
          model = model.replace(/\s+(Hybrid|Plug-in|i-FORCE MAX|MAX)$/i, ' $1').trim();
          // Remove any trailing numbers that aren't part of the model name
          model = model.replace(/\s+\d+\s*$/, '').trim();
          if (!model || model.length < 2) continue;
          
          if (isInvalidModel(model)) continue;
          model = normalizeModel(model, text);
          
          // Extract offer details
          const data: {
            year: number;
            model: string;
            trim?: string;
            modelCode?: number;
            startDate: string;
            endDate?: string;
            monthlyPayment?: number;
            termMonths?: number;
            apr?: number;
            aprRate?: number;
            aprTermMonths?: number;
            dueAtSigning?: number;
            customerCash?: number;
            msrp?: number;
            offerDetailUrl?: string;
          } = {
            year: year,
            model: model,
            startDate: startDateStr,
          };
          
          if (trimStr) {
            data.trim = trimStr;
          }
          if (modelCodeNum != null) {
            data.modelCode = modelCodeNum;
          }
          if (endDateStr) {
            data.endDate = endDateStr;
          }
          // Capture "View Offer" link for both lease and finance cards so detail pages
          // can backfill missing APR/term or lease-specific disclaimer fields.
          if (card.querySelector) {
            const footer = card.querySelector('[class*="offer-card-footer"]');
            const link = footer ? footer.querySelector('a') : null;
            const href = link && link.getAttribute('href');
            if (href && href.indexOf('offer-detail') !== -1) {
              data.offerDetailUrl = href.startsWith('http') ? href : (window.location.origin + (href.startsWith('/') ? href : '/' + href));
            }
          }
          
          // Extract payment/APR (handle spacing: "$ 319 / mo" or "$319/mo")
          const paymentMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})*)\s*\/\s*mo/i);
          const aprMatch = text.match(/(\d+\.?\d*)%\s*APR/i);
          
          // Extract all term mentions to find the right one (handle "mos", "mos.", "months", "Months")
          const termMatches = Array.from(text.matchAll(/(\d+)\s*(?:mos?\.?|months?)/gi));
          
          if (paymentMatch) {
            data.monthlyPayment = parseInt(paymentMatch[1].replace(/,/g, ''));
            // For lease offers, find term closest to the payment
            if (termMatches.length > 0) {
              const paymentIndex = paymentMatch.index || 0;
              const closestTerm = termMatches.find(function(m) {
                const mIndex = m.index || 0;
                return Math.abs(mIndex - paymentIndex) < 150;
              });
              if (closestTerm) {
                data.termMonths = parseInt(closestTerm[1]);
              }
            }
          }
          
          if (aprMatch) {
            data.apr = parseFloat(aprMatch[1]);
            data.aprRate = parseFloat(aprMatch[1]);
            // For APR offers, find term closest to the APR percentage
            // First try "for X Months" pattern which is common for APR offers
            const aprForTermMatch = text.match(/for\s+(\d+)\s+months?/i);
            if (aprForTermMatch && !paymentMatch) {
              data.aprTermMonths = parseInt(aprForTermMatch[1]);
            } else if (termMatches.length > 0 && !paymentMatch) {
              const aprIndex = aprMatch.index || 0;
              const closestTerm = termMatches.find(function(m) {
                const mIndex = m.index || 0;
                return Math.abs(mIndex - aprIndex) < 200;
              });
              if (closestTerm) {
                data.aprTermMonths = parseInt(closestTerm[1]);
              }
            }
          }
          
          // Extract due at signing from lease block (e.g. offer-dt-details: $379/mo, 36 mos, $3,999 due at signing)
          if (paymentMatch) {
            const dueMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})*)\s+due\s+at\s+signing/i);
            if (dueMatch) {
              const paymentIndex = paymentMatch.index || 0;
              const dueIndex = dueMatch.index || 0;
              if (Math.abs(dueIndex - paymentIndex) < 300) {
                data.dueAtSigning = parseInt(dueMatch[1].replace(/,/g, ''));
              }
            }
            // Also look inside the lease-details block (class offer-dt-details) if not found in full card text
            if (data.dueAtSigning == null && card.querySelectorAll) {
              const leaseBlocks = card.querySelectorAll('[class*="offer-dt-details"]');
              for (let i = 0; i < leaseBlocks.length; i++) {
                const blockText = (leaseBlocks[i].textContent || '').trim();
                const blockDue = blockText.match(/\$\s*(\d{1,3}(?:,\d{3})*)\s+due\s+at\s+signing/i);
                if (blockDue) {
                  data.dueAtSigning = parseInt(blockDue[1].replace(/,/g, ''));
                  break;
                }
              }
            }
            // Fallback: find "due at signing" in card text and capture nearest preceding $ amount (within 200 chars)
            if (data.dueAtSigning == null) {
              const dueIdx = text.search(/due\s+at\s+signing/i);
              if (dueIdx >= 0) {
                const before = text.slice(Math.max(0, dueIdx - 200), dueIdx);
                const dollarMatches = before.match(/\$\s*(\d{1,3}(?:,\d{3})*)/g);
                if (dollarMatches && dollarMatches.length > 0) {
                  const lastMatch = dollarMatches[dollarMatches.length - 1];
                  const numMatch = lastMatch.match(/\$?\s*(\d{1,3}(?:,\d{3})*)/);
                  if (numMatch) {
                    data.dueAtSigning = parseInt(numMatch[1].replace(/,/g, ''));
                  }
                }
              }
            }
          }
          
          // Extract cash amounts
          const cashMatch = text.match(/\$(\d{1,3}(?:,\d{3})*)\s*(?:Customer\s*)?Cash/i);
          if (cashMatch) {
            data.customerCash = parseInt(cashMatch[1].replace(/,/g, ''));
          }
          
          // Extract MSRP if present
          const msrpMatch = text.match(/MSRP[:\s]*\$(\d{1,3}(?:,\d{3})*)/i);
          if (msrpMatch) {
            data.msrp = parseInt(msrpMatch[1].replace(/,/g, ''));
          }
          
          // Create unique key to avoid duplicates.
          // Use nullish checks so 0% APR is preserved (0 is a valid finance rate).
          const offerValue =
            data.apr ??
            data.aprRate ??
            data.monthlyPayment ??
            'cash';
          const leaseTermValue = data.termMonths ?? '';
          const aprTermValue = data.aprTermMonths ?? '';
          const key = `${year}-${model}-${offerValue}-${leaseTermValue}-${aprTermValue}`;
          if (seen.has(key)) continue;
          seen.add(key);
          
          // Add if we have model (year and endDate are optional now)
          if (data.model) {
            offers.push(data);
          }
        }
        return { offers: offers, specLineDebug: specLineDebug, leaseCardDomSnapshots: leaseCardDomSnapshots };
      });
      const domOffers = Array.isArray(domResult?.offers) ? domResult.offers : [];
      const specLineDebug = domResult?.specLineDebug;
      const leaseCardDomSnapshots = domResult?.leaseCardDomSnapshots;
      if (artifactsDir && specLineDebug && specLineDebug.length > 0) {
        try {
          fs.writeFileSync(
            path.join(artifactsDir, 'toyota-dom-debug-' + timestamp() + '.json'),
            JSON.stringify(specLineDebug, null, 2),
            'utf-8'
          );
        } catch (e) {
          console.error('Failed to write Toyota DOM debug artifact:', e);
        }
      }
      if (artifactsDir && leaseCardDomSnapshots && leaseCardDomSnapshots.length > 0) {
        try {
          fs.writeFileSync(
            path.join(artifactsDir, 'toyota-lease-card-dom-' + timestamp() + '.json'),
            JSON.stringify(leaseCardDomSnapshots, null, 2),
            'utf-8'
          );
        } catch (e) {
          console.error('Failed to write Toyota lease card DOM snapshot:', e);
        }
      }
      // Open each lease offer "View Offer" (offer-detail) URL in a new tab, scrape specline/disclaimer, then close tab.
      const detailUrls = [
        ...new Set(
          (domOffers as Array<{
            offerDetailUrl?: string;
            monthlyPayment?: number;
            apr?: number;
            aprRate?: number;
            aprTermMonths?: number;
            endDate?: string;
          }>)
            .filter((o) => {
              const hasLeasePayment = o.monthlyPayment != null;
              if (hasLeasePayment) {
                // Existing behavior for lease: detail pages provide richer disclaimer/spec context.
                return !!o.offerDetailUrl;
              }
              // Finance fallback is only needed when key fields are missing.
              return !!o.offerDetailUrl && (
                o.apr == null ||
                o.aprRate == null ||
                o.aprTermMonths == null ||
                !o.endDate
              );
            })
            .map((o) => o.offerDetailUrl)
            .filter((u): u is string => !!u)
        ),
      ];
      type DetailPageData = {
        disclaimer: string;
        modelCode?: number;
        trim?: string;
        aprRate?: number;
        aprTermMonths?: number;
        endDate?: string;
      };
      const detailDataByUrl = new Map<string, DetailPageData>();
      for (const detailUrl of detailUrls) {
        const detailPage = await context.newPage();
        try {
          await detailPage.goto(detailUrl, {
            waitUntil: 'domcontentloaded',
            timeout: PAGE_LOAD_TIMEOUT_MS,
          });
          await detailPage.waitForTimeout(2500);
          const extracted = await detailPage.evaluate(() => {
            const bodyText = document.body ? document.body.innerText : '';
            let leaseExampleBasis = '';
            let dueAtSigningDetails = '';
            let modelCode: number | null = null;
            let trim: string | null = null;
            let aprRate: number | null = null;
            let aprTermMonths: number | null = null;
            let endDate: string | null = null;
            // "Lease example based on 2025 RAV4 4WD 5Dr. Wagon LE L4 8AT Model 4432 with Total SRP of $33,134, net capitalized cost of $28,972, and a lease end purchase amount of $21,868."
            const leaseIdx = bodyText.indexOf('Lease example based on');
            if (leaseIdx >= 0) {
              const after = bodyText.slice(leaseIdx, leaseIdx + 600);
              const endMarker = /lease end purchase amount of \$[\d,]+\./i.exec(after);
              if (endMarker && endMarker.index != null && endMarker[0]) {
                leaseExampleBasis = after.slice(0, endMarker.index + endMarker[0].length).trim();
              } else {
                const lastPeriod = after.lastIndexOf('.');
                leaseExampleBasis = (lastPeriod >= 0 ? after.slice(0, lastPeriod + 1) : after).trim();
              }
              const specText = leaseExampleBasis || after.slice(0, 350);
              const modelCodeMatch = specText.match(/Model\s+(\d{4})\b/i) || specText.match(/\((\d{4})\)/);
              if (modelCodeMatch) {
                const n = parseInt(modelCodeMatch[1], 10);
                if (n >= 1000 && n <= 9999) modelCode = n;
              }
              const trimGrades = ['Limited', 'Platinum', 'Nightshade', 'TRD Off-Road', 'TRD Sport', 'XSE', 'XLE', 'LE', 'SE', 'SR5', 'SR', 'L', 'Premium', 'TRD'];
              for (const grade of trimGrades) {
                const re = new RegExp('\\b' + grade.replace(/\s/g, '\\s+') + '\\b', 'i');
                if (re.test(specText)) {
                  trim = grade;
                  break;
                }
              }
            }

            // Finance detail fallback, e.g. "0% APR for 72 Months".
            // This is used when card parsing misses APR term data.
            const aprTermPatterns = [
              /(\d+\.?\d*)%\s*APR\s*(?:for|up\s+to)?\s*(\d+)\s*(?:months?|mos)\b/i,
              /APR:\s*[\s\S]{0,220}?(\d+\.?\d*)%\s*APR[\s\S]{0,120}?\b(\d+)\s*(?:months?|mos)\b/i,
            ];
            for (const re of aprTermPatterns) {
              const m = bodyText.match(re);
              if (m && m[1] && m[2]) {
                const rate = parseFloat(m[1]);
                const term = parseInt(m[2], 10);
                if (!Number.isNaN(rate) && !Number.isNaN(term)) {
                  aprRate = rate;
                  aprTermMonths = term;
                  break;
                }
              }
            }

            // Capture expiration from detail page when available: "Exp. 05/04/26".
            const exp = bodyText.match(/Exp\.\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
            if (exp && exp[1] && exp[2] && exp[3]) {
              const mm = exp[1].padStart(2, '0');
              const dd = exp[2].padStart(2, '0');
              const yyRaw = exp[3];
              const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
              endDate = `${yyyy}-${mm}-${dd}`;
            }

            let financeSummary = '';
            const financeSummaryMatch = bodyText.match(
              /Qualified buyers can finance a new[\s\S]{0,220}?\d+\.?\d*%\s*APR[\s\S]{0,120}?\d+\s*(?:Months?|mos)\.?/i
            );
            if (financeSummaryMatch && financeSummaryMatch[0]) {
              financeSummary = financeSummaryMatch[0].replace(/\s+/g, ' ').trim();
            }
            // "$3,999 Due At Signing includes ... and $750 Acquisition Fee." (stop at Acquisition Fee., not the next paragraph)
            const dueMatch = bodyText.match(/\$[\d,]+ Due At Signing includes/i);
            if (dueMatch && dueMatch.index != null) {
              const after = bodyText.slice(dueMatch.index, dueMatch.index + 550);
              const feeEnd = after.match(/Acquisition Fee\./i);
              const endIdx = feeEnd && feeEnd.index != null && feeEnd[0] ? feeEnd.index + feeEnd[0].length : undefined;
              dueAtSigningDetails = endIdx != null ? after.slice(0, endIdx).trim() : after.trim();
            }
            // Prefer lease disclaimer when present; otherwise fallback to finance summary text.
            const disclaimer = [leaseExampleBasis, dueAtSigningDetails].filter(Boolean).join(' ') || financeSummary;
            return {
              disclaimer,
              modelCode: modelCode ?? undefined,
              trim: trim ?? undefined,
              aprRate: aprRate ?? undefined,
              aprTermMonths: aprTermMonths ?? undefined,
              endDate: endDate ?? undefined,
            };
          });
          detailDataByUrl.set(detailUrl, {
            disclaimer: extracted.disclaimer || '',
            modelCode: extracted.modelCode,
            trim: extracted.trim,
            aprRate: extracted.aprRate,
            aprTermMonths: extracted.aprTermMonths,
            endDate: extracted.endDate,
          });
        } catch (e) {
          // non-fatal: leave disclaimer empty for this offer
        } finally {
          await detailPage.close();
        }
      }
      for (const offer of domOffers as Array<Record<string, unknown>>) {
        const url = offer.offerDetailUrl as string | undefined;
        if (url && detailDataByUrl.has(url)) {
          const data = detailDataByUrl.get(url)!;
          offer.disclaimer = data.disclaimer ?? offer.disclaimer;
          if (data.modelCode != null) offer.modelCode = data.modelCode;
          if (data.trim != null) offer.trim = data.trim;
          if ((offer.apr == null || offer.aprRate == null) && data.aprRate != null) {
            if (offer.apr == null) offer.apr = data.aprRate;
            if (offer.aprRate == null) offer.aprRate = data.aprRate;
          }
          if (offer.aprTermMonths == null && data.aprTermMonths != null) {
            offer.aprTermMonths = data.aprTermMonths;
          }
          if (!offer.endDate && data.endDate) {
            offer.endDate = data.endDate;
          }
        }
        delete offer.offerDetailUrl;
      }
      if (domOffers && domOffers.length > 0) {
        responses.push({
          url: 'dom://rendered-offers',
          status: 200,
          body: { offers: domOffers },
        });
      } else {
        // Fallback: extract from page text content if DOM selectors didn't work
        try {
          const textOffers = await page.evaluate(() => {
            // Pure JavaScript - no TypeScript syntax
            const offers = [];
            const seen = new Set();
            const today = new Date();
            const startDateStr = today.toISOString().split('T')[0];
            const bodyText = (document.body && document.body.textContent) || '';
            const SKIP = ['college', 'military', 'hybrids and', 'crossovers and'];
            function invalidModel(m: string) {
              if (!m || m.length < 2) return true;
              const l = m.toLowerCase().trim();
              if (SKIP.indexOf(l) >= 0 || l.endsWith(' and')) return true;
              return false;
            }
            function normModel(m: string) { return m.trim() === 'Land' ? 'Land Cruiser' : m.trim(); }
            
            // Extract offers from text using regex patterns
            // Look for patterns like "2025 Model Name" followed by APR
            const aprMatches = Array.from(bodyText.matchAll(/(\d+\.?\d*)%\s*APR/gi));
            
            for (const aprMatch of aprMatches.slice(0, 200)) {
              const apr = parseFloat(aprMatch[1]);
              const aprIndex = aprMatch.index || 0;
              const start = Math.max(0, aprIndex - 300);
              const end = Math.min(bodyText.length, aprIndex + aprMatch[0].length + 300);
              const context = bodyText.substring(start, end);
              
              // Look for year + model in context
              const modelYearMatch = context.match(/(\d{4})\s+([A-Za-z0-9][A-Za-z0-9\s\-]{1,})/);
              if (modelYearMatch) {
                const year = parseInt(modelYearMatch[1]);
                let model = modelYearMatch[2].trim();
                
                // Clean up model name - remove common suffixes and stop at APR/Offer/etc
                model = model.replace(/\s*(?:Customer\s*)?(APR|Lease|Cash|Offer|at\s+\d+).*$/i, '').trim();
                model = model.replace(/\s*Customer\s*$/i, '').trim();
                model = model.replace(/\s+(Hybrid|Plug-in|i-FORCE MAX|MAX)$/i, ' $1').trim();
                // Remove any trailing numbers that aren't part of the model name
                model = model.replace(/\s+\d+\s*$/, '').trim();
                if (!model || model.length < 2) continue;
                if (invalidModel(model)) continue;
                model = normModel(model);
                
                const key = year + '-' + model + '-' + apr;
                if (seen.has(key)) continue;
                seen.add(key);
                
                // Extract payment if present
                const paymentMatch = context.match(/\$(\d{1,3}(?:,\d{3})*)\s*\/\s*mo/i);
                const termMatch = context.match(/(\d+)\s*mos?/i);
                
                const data: {
                  year: number;
                  model: string;
                  make: string;
                  apr: number;
                  aprRate: number;
                  startDate: string;
                  monthlyPayment?: number;
                  termMonths?: number;
                } = {
                  year: year,
                  model: model,
                  make: 'Toyota',
                  apr: apr,
                  aprRate: apr,
                  startDate: startDateStr,
                };
                
                if (paymentMatch) {
                  data.monthlyPayment = parseInt(paymentMatch[1].replace(/,/g, ''));
                }
                if (termMatch) {
                  data.termMonths = parseInt(termMatch[1]);
                }
                
                offers.push(data);
              }
            }
            
            return offers;
          });
          
        if (textOffers && textOffers.length > 0) {
          responses.push({
            url: 'dom://rendered-offers',
            status: 200,
            body: { offers: textOffers },
          });
        }
        } catch (e2) {
          // Ignore fallback errors too
        }
      }
    } catch (e) {
      // Log error but don't fail - this is a fallback
      console.error('DOM extraction error:', e);
    }

    // ALWAYS try text-based extraction as final fallback, even if DOM extraction failed
    // This ensures we extract offers even if DOM selectors don't work
    if (!domExtractionAttempted || responses.filter(r => r.url === 'dom://rendered-offers').length === 0) {
      try {
        const textOffers = await page.evaluate(() => {
          type TextOffer = {
            year: number;
            model: string;
            make: string;
            apr: number;
            aprRate: number;
            startDate: string;
            monthlyPayment?: number;
            termMonths?: number;
            dueAtSigning?: number;
            aprTermMonths?: number;
          };
          const offers: TextOffer[] = [];
          const seen = new Set<string>();
          const today = new Date();
          const startDateStr = today.toISOString().split('T')[0];
          const bodyText = (document.body && document.body.textContent) || '';
          const SKIP = ['college', 'military', 'hybrids and', 'crossovers and'];
          function invalidModel(m: string) {
            if (!m || m.length < 2) return true;
            const l = m.toLowerCase().trim();
            if (SKIP.indexOf(l) >= 0 || l.endsWith(' and')) return true;
            return false;
          }
          function normModel(m: string) { return m.trim() === 'Land' ? 'Land Cruiser' : m.trim(); }
          
          if (!bodyText || bodyText.length < 100) {
            return offers;
          }
          
          // Extract offers from text using regex patterns
          // Look for patterns like "2025 Model Name" followed by APR
          const aprMatches = Array.from(bodyText.matchAll(/(\d+\.?\d*)%\s*APR/gi));
          
          for (const aprMatch of aprMatches.slice(0, 200)) {
            try {
              const apr = parseFloat(aprMatch[1]);
              if (isNaN(apr)) continue;
              
              // Use larger context window to capture terms and due at signing that might be further away
              const aprIndex = aprMatch.index || 0;
              const start = Math.max(0, aprIndex - 500);
              const end = Math.min(bodyText.length, aprIndex + aprMatch[0].length + 500);
              const context = bodyText.substring(start, end);
              
              // Look for year + model in context (greedy capture to include trim: Prius Plug-in Hybrid, Tundra i-FORCE MAX, etc.)
              const modelYearMatch = context.match(/(\d{4})\s+([A-Za-z0-9][A-Za-z0-9\s\-]{1,})/);
              if (modelYearMatch) {
                const year = parseInt(modelYearMatch[1]);
                let model = modelYearMatch[2].trim();
                
                // Clean up model name - remove common suffixes and stop at APR/Offer/etc
                model = model.replace(/\s*(?:Customer\s*)?(APR|Lease|Cash|Offer|at\s+\d+).*$/i, '').trim();
                model = model.replace(/\s*Customer\s*$/i, '').trim();
                model = model.replace(/\s+(Hybrid|Plug-in|i-FORCE MAX|MAX)$/i, ' $1').trim();
                // Remove any trailing numbers that aren't part of the model name
                model = model.replace(/\s+\d+\s*$/, '').trim();
                if (!model || model.length < 2) continue;
                if (invalidModel(model)) continue;
                model = normModel(model);
                
                const key = year + '-' + model + '-' + apr;
                if (seen.has(key)) continue;
                seen.add(key);
                
                // Extract payment if present (lease offers) - handle spacing
                const paymentMatch = context.match(/\$\s*(\d{1,3}(?:,\d{3})*)\s*\/\s*mo/i);
                // Extract due at signing (lease offers) - handle spacing and capitalization, look in larger area
                const dueMatch = context.match(/\$\s*(\d{1,3}(?:,\d{3})*)\s+due\s+at\s+signing/i);
                // Extract all term mentions to find the right one (handle "mos", "mos.", "months", "Months", "for X Months")
                const termMatches = Array.from(context.matchAll(/(\d+)\s*(?:mos?\.?|months?|for\s+\d+\s+months?)/gi));
                // Also look for "for X Months" pattern specifically for APR
                const aprForTermMatch = context.match(/for\s+(\d+)\s+months?/i);
                
                const data: TextOffer = {
                  year: year,
                  model: model,
                  make: 'Toyota',
                  apr: apr,
                  aprRate: apr,
                  startDate: startDateStr,
                };
                
                if (paymentMatch) {
                  data.monthlyPayment = parseInt(paymentMatch[1].replace(/,/g, ''));
                  // For lease offers, find term closest to the payment
                  if (termMatches.length > 0) {
                    const paymentIndex = paymentMatch.index || 0;
                    const closestTerm = termMatches.find(function(m) {
                      const mIndex = m.index || 0;
                      return Math.abs(mIndex - paymentIndex) < 150;
                    });
                    if (closestTerm) {
                      data.termMonths = parseInt(closestTerm[1]);
                    }
                  }
                  // Also look for due at signing near the payment
                  if (dueMatch) {
                    const paymentIndex = paymentMatch.index || 0;
                    const dueIndex = dueMatch.index || 0;
                    // Only include due at signing if it's reasonably close to the payment
                    if (Math.abs(dueIndex - paymentIndex) < 300) {
                      data.dueAtSigning = parseInt(dueMatch[1].replace(/,/g, ''));
                    }
                  }
                } else {
                  // For APR offers, check for "for X Months" pattern first
                  if (aprForTermMatch) {
                    data.aprTermMonths = parseInt(aprForTermMatch[1]);
                  } else if (termMatches.length > 0) {
                    // Fallback to finding term closest to APR
                    const aprIndex = aprMatch.index || 0;
                    const closestTerm = termMatches.find(function(m) {
                      const mIndex = m.index || 0;
                      return Math.abs(mIndex - aprIndex) < 300;
                    });
                    if (closestTerm) {
                      data.aprTermMonths = parseInt(closestTerm[1]);
                    }
                  }
                }
                
                offers.push(data);
              }
            } catch (err) {
              // Skip this match if there's an error
              continue;
            }
          }
          
          return offers;
        });
        
        if (textOffers && textOffers.length > 0) {
          responses.push({
            url: 'dom://rendered-offers',
            status: 200,
            body: { offers: textOffers },
          });
        }
      } catch (e) {
        console.error('Text-based extraction error:', e);
      }
    }

    // Fallback: extract offer-like objects from in-page state (if the UI hydrates from preloaded JSON
    // and no obvious XHR/fetch payload is captured). This is not DOM scraping; it reads JS state.
    try {
      const windowOffers = await page.evaluate(() => {
        const win = window as Window & {
          __NEXT_DATA__?: unknown;
          __NUXT__?: unknown;
          __APOLLO_STATE__?: unknown;
          __PRELOADED_STATE__?: unknown;
          __INITIAL_STATE__?: unknown;
        };
        const sources: [string, unknown][] = [
          ['__NEXT_DATA__', win.__NEXT_DATA__],
          ['__NUXT__', win.__NUXT__],
          ['__APOLLO_STATE__', win.__APOLLO_STATE__],
          ['__PRELOADED_STATE__', win.__PRELOADED_STATE__],
          ['__INITIAL_STATE__', win.__INITIAL_STATE__],
        ];

        function isObj(v: unknown): v is object {
          return v != null && typeof v === 'object';
        }
        function unwrap(v: unknown): unknown {
          return (isObj(v) && 'value' in v ? (v as { value: unknown }).value : v);
        }
        function looksLikeOffer(o: unknown): boolean {
          if (!isObj(o)) return false;
          const rec = o as Record<string, unknown>;
          const modelRaw = rec.model || rec.modelName || rec.series || rec.seriesName || rec.vehicleModel;
          const model = unwrap(modelRaw);
          const hasModel = typeof model === 'string' && model.length > 0;
          const hasCore =
            unwrap(rec.apr) != null ||
            unwrap(rec.aprRate) != null ||
            unwrap(rec.payment) != null ||
            unwrap(rec.monthlyPayment) != null ||
            unwrap(rec.leasePayment) != null ||
            unwrap(rec.term) != null ||
            unwrap(rec.termMonths) != null;
          return hasModel && hasCore;
        }

        const matches: Record<string, unknown>[] = [];
        const seen = new Set<string>();
        function walk(v: unknown, depth: number): void {
          if (depth > 8) return;
          if (Array.isArray(v)) {
            for (const item of v) walk(item, depth + 1);
            return;
          }
          if (!isObj(v)) return;
          if (looksLikeOffer(v)) {
            const key = JSON.stringify(v);
            if (!seen.has(key)) {
              seen.add(key);
              matches.push(v as Record<string, unknown>);
            }
          }
          const obj = v as Record<string, unknown>;
          for (const k of Object.keys(obj)) walk(obj[k], depth + 1);
        };

        // Add additional likely state holders from window by key name
        try {
          const winRecord = window as unknown as Record<string, unknown>;
          const keys = Object.keys(winRecord).filter(function(k: string) {
            return /offer|offers|deal|incent|program|rebate|bat|zip|location/i.test(k);
          });
          for (const k of keys.slice(0, 50)) {
            sources.push([k, winRecord[k]]);
          }
        } catch {
          // ignore
        }

        for (const [name, src] of sources) {
          if (!src) continue;
          walk(src, 0);
        }

        return { count: matches.length, matches: matches.slice(0, 500) };
      });

      if (windowOffers?.count && windowOffers.count > 0) {
        responses.push({
          url: 'window://offer-like-state',
          status: 200,
          body: { offers: windowOffers.matches },
        });
      }
    } catch {
      // ignore
    }

    // Fallback: extract offer-like objects from React fiber tree (client-side hydration state).
    // This avoids HTML scraping while still being resilient when offers are stored in component props/state.
    try {
      const reactOffers = await page.evaluate(() => {
        const win = window as unknown as Record<string, unknown>;
        const hook = win['__REACT_DEVTOOLS_GLOBAL_HOOK__'] as { getFiberRoots?: (id: number) => Iterable<unknown>; renderers?: { values: () => Iterable<{ rendererID?: number }> }; } | undefined;
        if (!hook || !hook.getFiberRoots) return { count: 0, matches: [] as Record<string, unknown>[] };

        function isObj(v: unknown): v is object {
          return v != null && typeof v === 'object';
        }
        function unwrap(v: unknown): unknown {
          return (isObj(v) && 'value' in v ? (v as { value: unknown }).value : v);
        }

        function looksLikeOffer(o: unknown): boolean {
          if (!isObj(o)) return false;
          const rec = o as Record<string, unknown>;
          const modelRaw = rec.model || rec.modelName || rec.series || rec.seriesName || rec.vehicleModel;
          const model = unwrap(modelRaw);
          const hasModel = typeof model === 'string' && model.length > 0;
          const hasCore =
            unwrap(rec.apr) != null ||
            unwrap(rec.aprRate) != null ||
            unwrap(rec.payment) != null ||
            unwrap(rec.monthlyPayment) != null ||
            unwrap(rec.leasePayment) != null ||
            unwrap(rec.term) != null ||
            unwrap(rec.termMonths) != null ||
            unwrap(rec.msrp) != null;
          return hasModel && hasCore;
        }

        const matches: Record<string, unknown>[] = [];
        const seen = new Set<string>();

        function scanValue(v: unknown, depth: number): void {
          if (depth > 6) return;
          if (!v) return;
          if (Array.isArray(v)) {
            // direct array of offers
            for (const item of v) {
              if (looksLikeOffer(item)) {
                const key = JSON.stringify(item);
                if (!seen.has(key)) {
                  seen.add(key);
                  matches.push(item as Record<string, unknown>);
                }
              }
              scanValue(item, depth + 1);
            }
            return;
          }
          if (!isObj(v)) return;
          if (looksLikeOffer(v)) {
            const key = JSON.stringify(v);
            if (!seen.has(key)) {
              seen.add(key);
              matches.push(v as Record<string, unknown>);
            }
          }
          const obj = v as Record<string, unknown>;
          for (const k of Object.keys(obj)) scanValue(obj[k], depth + 1);
        }

        type FiberLike = {
          memoizedProps?: unknown;
          memoizedState?: unknown;
          stateNode?: { state?: unknown; props?: unknown };
          child?: FiberLike;
          sibling?: FiberLike;
          current?: FiberLike;
        };
        function scanFiber(node: FiberLike | null | undefined, depth: number): void {
          if (!node || depth > 15000) return;
          // probe props/state
          scanValue((node as Record<string, unknown>).memoizedProps, 0);
          scanValue((node as Record<string, unknown>).memoizedState, 0);
          const stateNode = (node as Record<string, unknown>).stateNode as { state?: unknown; props?: unknown } | undefined;
          if (stateNode) {
            scanValue(stateNode, 0);
            if (stateNode.state) scanValue(stateNode.state, 0);
            if (stateNode.props) scanValue(stateNode.props, 0);
          }
          // traverse fiber tree
          if (node.child) scanFiber(node.child, depth + 1);
          if (node.sibling) scanFiber(node.sibling, depth + 1);
        }

        try {
          const renderers = hook.renderers?.values();
          if (!renderers) return { count: matches.length, matches: matches.slice(0, 500) };
          for (const renderer of renderers) {
            const id = renderer?.rendererID;
            if (!id) continue;
            const roots = hook.getFiberRoots!(id);
            for (const root of roots) {
              const rootObj = root as { current?: FiberLike };
              const current = rootObj?.current;
              if (current) scanFiber(current, 0);
            }
          }
        } catch {
          // ignore
        }

        return { count: matches.length, matches: matches.slice(0, 500) };
      });

      if (reactOffers?.count && reactOffers.count > 0) {
        responses.push({
          url: 'react://offer-like-fiber',
          status: 200,
          body: { offers: reactOffers.matches },
        });
      }
    } catch (e4) {
      // ignore
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/1c939b99-987b-4107-9b41-38466e984993',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scraper.ts:1277',message:'React fiber extraction outer catch',data:{error:String(e4)},timestamp:Date.now(),sessionId:'debug-session',runId:'eval',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
    }

    // Write screenshot for debugging when artifacts dir is set (skip for preview)
    let screenshotPath: string | undefined;
    if (artifactsDir) {
      fs.mkdirSync(artifactsDir, { recursive: true });
      screenshotPath = `${artifactsDir}/toyota-page-${timestamp()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    }

    const titleFinal = await page.title().catch(() => '');
    if (isMaintenanceTitle(titleFinal)) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      return {
        ok: false,
        url: BUYATOYOTA_OFFERS_URL,
        responses,
        screenshotPath,
        error:
          'BuyAToyota returned a maintenance/WAF interstitial after navigation. This typically means the session is blocked in headless mode. Try setting TOYOTA_HEADLESS=0 and TOYOTA_USER_DATA_DIR to a persisted profile after completing any prompts once.',
      };
    }

    // Persist performance resource entries for debugging when artifacts dir is set
    if (artifactsDir) {
      try {
        const perf = await page.evaluate(() => {
          const entries = performance.getEntriesByType('resource') as any[];
          return entries
            .map((e) => ({
              name: e.name,
              initiatorType: e.initiatorType,
              transferSize: e.transferSize,
              encodedBodySize: e.encodedBodySize,
              decodedBodySize: e.decodedBodySize,
            }))
            .filter((e) => e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')
            .slice(0, 500);
        });
        fs.writeFileSync(
          `${artifactsDir}/toyota-perf-${timestamp()}.json`,
          JSON.stringify(perf, null, 2),
          'utf-8'
        );
      } catch {
        // ignore
      }
    }

    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }

    return {
      ok: true,
      url: BUYATOYOTA_OFFERS_URL,
      responses,
      screenshotPath,
      debug: {
        zipAttempted: true,
        zipUiAttempted: zipUiOk,
        zipEvidence,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (browser) {
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(BUYATOYOTA_OFFERS_URL, { timeout: 10000 }).catch(() => {});
        let screenshotPath: string | undefined;
        if (artifactsDir) {
          fs.mkdirSync(artifactsDir, { recursive: true });
          screenshotPath = `${artifactsDir}/screenshot-${timestamp()}.png`;
          await page.screenshot({ path: screenshotPath }).catch(() => {});
        }
        await browser.close();
        return {
          ok: false,
          url: BUYATOYOTA_OFFERS_URL,
          responses: [],
          screenshotPath,
          error,
        };
      } catch {
        await browser.close();
      }
    }
    return {
      ok: false,
      url: BUYATOYOTA_OFFERS_URL,
      responses: [],
      error,
    };
  }
}

function timestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}${M}${day}-${h}${m}${s}`;
}

function isMaintenanceTitle(title: string): boolean {
  const t = (title || '').toLowerCase();
  // Matches Toyota maintenance interstitial seen in captures.
  return t.includes('toyota cars, trucks, suvs');
}

/**
 * Check if page appears to be a maintenance/WAF interstitial or blank.
 * Returns true if the page looks like it needs a reload to show real content.
 */
async function looksLikeInterstitial(page: Page): Promise<boolean> {
  try {
    const title = await page.title().catch(() => '');
    if (isMaintenanceTitle(title)) return true;

    // Check if page body is suspiciously empty or minimal (blank maintenance render)
    const bodyText = await page.evaluate(() => {
      const body = document.body;
      if (!body) return '';
      // Get text content, excluding script/style
      const walker = document.createTreeWalker(
        body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tagName = parent.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );
      let text = '';
      let node;
      while ((node = walker.nextNode())) {
        text += node.textContent || '';
      }
      return text.trim();
    });

    // If body has very little text (< 100 chars), likely blank interstitial
    if (bodyText.length < 100) {
      // But check if it's just loading (has loading indicators)
      const hasLoadingIndicators = await page
        .locator('text=/loading|please wait|checking/i')
        .count()
        .catch(() => 0);
      if (!hasLoadingIndicators && bodyText.length < 50) {
        return true;
      }
    }

    return false;
  } catch {
    // If we can't check, assume it's fine (don't block on errors)
    return false;
  }
}

/**
 * Navigate to URL with WAF/interstitial retry logic.
 * Some WAF pages render blank initially and need a reload to show real content.
 */
async function navigateWithWafRetries(
  page: Page,
  url: string,
  options: {
    maxRetries?: number;
    artifactsDir?: string;
  } = {}
): Promise<{ success: boolean; screenshotPath?: string; error?: string }> {
  const maxRetries = options.maxRetries ?? 3;
  const artifactsDir = options.artifactsDir; // when undefined (preview), no WAF screenshots written
  let lastScreenshotPath: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // First attempt: use domcontentloaded (faster, catches initial render)
      // Subsequent attempts: reload with networkidle (more thorough)
      if (attempt === 0) {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });
      } else {
        // Reload with backoff delay
        const backoffMs = 2000 * attempt;
        await page.waitForTimeout(backoffMs);
        await page.reload({
          waitUntil: 'networkidle',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });
      }

      // Wait a moment for any client-side hydration
      await page.waitForTimeout(2000);

      // Check if we're still on an interstitial
      const isInterstitial = await looksLikeInterstitial(page);
      if (!isInterstitial) {
        // Success: page looks real
        return { success: true, screenshotPath: lastScreenshotPath };
      }

      // Still looks like interstitial, capture screenshot for debugging when artifacts dir set
      if (artifactsDir) {
        fs.mkdirSync(artifactsDir, { recursive: true });
        lastScreenshotPath = `${artifactsDir}/toyota-waf-attempt-${attempt}-${timestamp()}.png`;
        await page.screenshot({ path: lastScreenshotPath, fullPage: true }).catch(() => {});
      }

      // If this was the last attempt, fail
      if (attempt === maxRetries) {
        const title = await page.title().catch(() => '');
        return {
          success: false,
          screenshotPath: lastScreenshotPath,
          error: `Page still appears to be maintenance/WAF interstitial after ${maxRetries + 1} attempts. Title: "${title}"`,
        };
      }

      // Otherwise, continue to next retry
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (attempt === maxRetries) {
        return {
          success: false,
          screenshotPath: lastScreenshotPath,
          error: `Navigation failed after ${maxRetries + 1} attempts: ${error}`,
        };
      }
      // Continue to retry
    }
  }

  return {
    success: false,
    screenshotPath: lastScreenshotPath,
    error: 'Navigation retries exhausted',
  };
}

async function collectZipEvidence(page: Page): Promise<{
  cookiesZip?: Array<{ name: string; value: string }>;
  localStorageZip?: Record<string, string>;
}> {
  const cookies = await page.context().cookies();
  const cookiesZip = cookies
    .filter((c) => /zip/i.test(c.name))
    .map((c) => ({ name: c.name, value: c.value }));

  const localStorageZip = await page.evaluate(() => {
    const out: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (/zip/i.test(k)) out[k] = localStorage.getItem(k) ?? '';
      }
    } catch {
      // ignore
    }
    return out;
  });

  return { cookiesZip, localStorageZip };
}
