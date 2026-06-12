// render-model-page.js
//
// Shared renderer for model-year pages.
// Given template HTML, a store config, and a page JSON (ModelYearPage),
// returns fully rendered HTML with all tokens, images, and microdata applied.

const sanitizeHtml = require("sanitize-html");
const {
  EDITORIAL_HTML_SANITIZE_OPTIONS,
} = require("../../../lib/sanitize/editorial-html-options.js");

function sanitizeEditorialHtml(html) {
  return sanitizeHtml(String(html ?? ""), EDITORIAL_HTML_SANITIZE_OPTIONS);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function joinUrl(base, p) {
  base = String(base || "").replace(/\/+$/, "");
  p = String(p || "").trim();
  if (!p) return "";
  if (!p.startsWith("/")) p = "/" + p;
  return base + p;
}

// Deterministic hash -> integer
function hash32(str) {
  str = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function slugifyModelName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Towns we avoid in the "Why the X fits Y" block for Toyota (case-insensitive match).
const TOYOTA_EXCLUDED_FIT_TOWNS = [
  "Fairview",
  "Oakdale",
  "Brookville",
  "Lakeside",
  "Centralburg",
  "Crossville",
].map((t) => t.trim().toLowerCase());

// Allowed replacement towns for Toyota "fits" heading (shuffled order for variety; deterministic per page).
const TOYOTA_ALLOWED_FIT_TOWNS = [
  "Greenfield",
  "Demotown",
  "Millbrook",
  "Cedarville",
  "Lakewood",
  "Pinehurst",
  "Riverside",
  "Westport",
  "Hillcrest",
  "Valleyview",
  "Northgate",
  "Southgate",
  "Eastgate",
];

const LINEUP_CTA_POOLS = {
  toyota: [
    "Explore {model}",
    "View {model} Details",
    "See {model} in Our Lineup",
    "Shop {model} Inventory",
    "Discover {model}",
    "Compare {model} Trims",
    "Get {model} Pricing",
    "Schedule a {model} Test Drive",
    "Find Your {model}",
    "See Why {model} Fits You",
    "Customize Your {model}",
    "Check {model} Availability",
  ],
  lexus: [
    "Explore {model}",
    "View {model} Highlights",
    "See {model} Features",
    "Discover {model}",
    "Compare {model} Trims",
    "Get {model} Pricing",
    "Schedule a {model} Test Drive",
    "Experience {model}",
    "Find Your {model}",
    "See Why {model} Fits You",
    "Customize Your {model}",
    "Check {model} Availability",
  ],
  bmw: [
    "Explore {model}",
    "View {model} Details",
    "See {model} Highlights",
    "Discover {model}",
    "Compare {model} Trims",
    "Learn About {model}",
    "See {model} Features",
    "Explore {model} Specs",
    "Inside the {model}",
    "Read More on {model}",
    "Take a Closer Look at {model}",
  ],
  default: [
    "Explore {model}",
    "View {model} Details",
    "See {model} in Our Lineup",
    "Shop {model} Inventory",
    "Discover {model}",
    "Compare {model} Trims",
    "Get {model} Pricing",
    "Schedule a {model} Test Drive",
    "Find Your {model}",
    "See Why {model} Fits You",
    "Customize Your {model}",
    "Check {model} Availability",
  ],
};

function getLineupCtaPool(brand) {
  const key = String(brand || "").trim().toLowerCase();
  return LINEUP_CTA_POOLS[key] || LINEUP_CTA_POOLS.default;
}

function selectLineupCTA(brand, usedSet, modelName) {
  const pool = getLineupCtaPool(brand);
  const used = usedSet || new Set();
  const filledPool = pool
    .map((label) =>
      String(label || "").replace("{model}", modelName || "").trim()
    )
    .filter(Boolean);
  if (!filledPool.length) return "";
  const available = filledPool.filter((c) => !used.has(c));
  const value =
    available.length > 0
      ? available[Math.min(used.size, available.length - 1)]
      : filledPool[used.size % filledPool.length];
  used.add(value);
  return value;
}

function pickUniqueDeterministic(pool, count, seedStr) {
  const cleaned = [];
  const seen = new Set();
  for (const t of (pool || [])) {
    const v = String(t || "").replace(/\s+[A-Z]{2}\s*$/, "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(v);
  }
  if (!cleaned.length) return [];
  const out = [];
  const used = new Set();
  // simple deterministic selection by stepping through a hashed start index
  let idx = hash32(seedStr) % cleaned.length;
  let step = (hash32(seedStr + "::step") % (cleaned.length - 1 || 1)) + 1;
  for (let i = 0; i < cleaned.length && out.length < count; i++) {
    const v = cleaned[idx];
    const key = v.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      out.push(v);
    }
    idx = (idx + step) % cleaned.length;
  }
  return out;
}

function replaceAttrByDataTto(html, key, attr, value) {
  if (!value) return html;
  const re = new RegExp(`(<[^>]+\\sdata-tto="${key}"[^>]*)(>)`, "g");
  return html.replace(re, (m, open, close) => {
    // remove existing attr if present, then add
    let out = open
      .replace(new RegExp(`\\s${attr}="[^"]*"`, "g"), "")
      .replace(new RegExp(`\\sdata-tto="${key}"`, "g"), "");
    out += ` ${attr}="${escapeHtml(value)}"`;
    return out + close;
  });
}

function replaceAttrByDataToken(html, tokenAttr, key, attr, value) {
  if (!value) return html;
  const re = new RegExp(`(<[^>]+\\s${tokenAttr}="${key}"[^>]*)(>)`, "g");
  return html.replace(re, (m, open, close) => {
    let out = open
      .replace(new RegExp(`\\s${attr}="[^"]*"`, "g"), "")
      .replace(new RegExp(`\\s${tokenAttr}="${key}"`, "g"), "");
    out += ` ${attr}="${escapeHtml(value)}"`;
    return out + close;
  });
}

function replaceTextByDataTto(html, key, value) {
  if (value === undefined || value === null) return html;
  const v = escapeHtml(value);
  // Replace element contents for tags that have data-tto="key"
  const re = new RegExp(
    '(<([a-zA-Z0-9]+)([^>]*?)\\sdata-tto="' + key + '"([^>]*?)>)([\\s\\S]*?)(</\\2>)',
    "g"
  );
  return html.replace(re, (m, open, tag, pre, post, inner, close) => {
    const open2 = open
      .replace(' data-tto="' + key + '"', "")
      .replace(/\sdata-tto="[^"]*"/g, (x) =>
        x.includes('data-tto="' + key + '"') ? "" : x
      );
    return open2 + v + close;
  });
}

function replaceHtmlByDataTto(html, key, innerHtml) {
  const re = new RegExp(
    '(<([a-zA-Z0-9]+)([^>]*?)\\sdata-tto="' + key + '"([^>]*?)>)([\\s\\S]*?)(</\\2>)',
    "g"
  );
  return html.replace(re, (m, open, tag, pre, post, inner, close) => {
    const open2 = open.replace(' data-tto="' + key + '"', "");
    return open2 + innerHtml + close;
  });
}

function setImgByDataTto(html, key, src, alt) {
  // Works for <img ... data-tto="key" ...>
  const re = new RegExp('(<img[^>]*?)\\sdata-tto="' + key + '"([^>]*?)>', "g");
  const safeAlt = escapeHtml(alt || "");
  return html.replace(re, (m, a, b) => {
    let tag = (a + b)
      .replace(/\sdata-tto="[^"]*"/g, "")
      .replace(/\ssrc="[^"]*"/g, "")
      .replace(/\salt="[^"]*"/g, "")
      .replace(/\sonerror="[^"]*"/g, "");
    tag += ' src="' + escapeHtml(src || "") + '" alt="' + safeAlt + '"';
    return tag + ">";
  });
}

function stripAllDataTto(html) {
  return html.replace(/\sdata-tto[-\w]*="[^"]*"/g, "");
}

function stripAllScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function stripLocalInfoCard(html) {
  return html.replace(
    /\s*<section\b[^>]*>\s*<h2\b[^>]*>\s*Local Info\s*<\/h2>[\s\S]*?<\/section>/gi,
    ""
  );
}

function injectMicrodata(html, microdataHtml) {
  if (!html.includes("<!-- TTO_MICRODATA_INJECT -->")) {
    throw new Error(
      "Missing TTO_MICRODATA_INJECT placeholder after sanitation steps."
    );
  }
  return html.replace("<!-- TTO_MICRODATA_INJECT -->", microdataHtml);
}

function buildBreadcrumbMicrodata(store, page) {
  const siteUrl = store.siteUrl || "";
  const canonical = page.canonicalUrl || joinUrl(siteUrl, page.pagePath || "");

  // For brand-lineup pages, only include Home (position 1) and the lineup page itself (position 2).
  if (page.pageType === "brand-lineup") {
    const year = page.year || "";
    const makeRaw = page.make || store.brand || "";
    const makeSlug = String(makeRaw || "").trim().toLowerCase();
    let makeDisplay = makeRaw;
    if (makeSlug === "toyota") makeDisplay = "Toyota";
    else if (makeSlug === "lexus") makeDisplay = "Lexus";
    else if (makeSlug === "bmw") makeDisplay = "BMW";
    const lineupLabel =
      (year && makeDisplay)
        ? `${year} ${makeDisplay} Model Lineup`
        : page.seo?.title || "Model Lineup";

    return (
      "\n  <div itemscope itemtype=\"https://schema.org/BreadcrumbList\"\n" +
      '    style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">\n' +
      '    <div itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">\n' +
      "      <a itemprop=\"item\" href=\"" +
      escapeHtml(siteUrl) +
      '"><span itemprop="name">' +
      escapeHtml(store.dealerName || "Home") +
      "</span></a>\n" +
      '      <meta itemprop="position" content="1" />\n' +
      "    </div>\n" +
      '    <div itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">\n' +
      "      <a itemprop=\"item\" href=\"" +
      escapeHtml(canonical) +
      '"><span itemprop="name">' +
      escapeHtml(lineupLabel) +
      "</span></a>\n" +
      '      <meta itemprop="position" content="2" />\n' +
      "    </div>\n" +
      "  </div>"
    );
  }

  // Default: Home → New Inventory (or Toyota lineup) → specific model page.
  const isToyotaModelYear =
    String(page.make || store.brand || "")
      .trim()
      .toLowerCase() === "toyota" &&
    Number(page.year) === 2026 &&
    page.pageType === "model-year";
  const lineupPath = "/new-toyota/2026-toyota-model-lineup.htm";
  const isLineupPage =
    String(page.pagePath || "").trim().toLowerCase() === lineupPath;
  const newInv =
    store.links && store.links.newInventory
      ? joinUrl(siteUrl, store.links.newInventory)
      : siteUrl;
  const lineupUrl = joinUrl(siteUrl, lineupPath);
  const secondHref = isToyotaModelYear && !isLineupPage ? lineupUrl : newInv;
  const secondName =
    isToyotaModelYear && !isLineupPage ? "2026 Toyota Model Lineup" : "New Inventory";
  const modelName = `${page.year || ""} ${page.make || ""} ${
    page.model || ""
  }`.trim();

  return (
    "\n  <div itemscope itemtype=\"https://schema.org/BreadcrumbList\"\n" +
    '    style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">\n' +
    '    <div itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">\n' +
    "      <a itemprop=\"item\" href=\"" +
    escapeHtml(siteUrl) +
    '"><span itemprop="name">' +
    escapeHtml(store.dealerName || "Home") +
    "</span></a>\n" +
    '      <meta itemprop="position" content="1" />\n' +
    "    </div>\n" +
    '    <div itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">\n' +
    "      <a itemprop=\"item\" href=\"" +
      escapeHtml(secondHref) +
    '"><span itemprop="name">' +
    escapeHtml(secondName) +
    "</span></a>\n" +
    '      <meta itemprop="position" content="2" />\n' +
    "    </div>\n" +
    '    <div itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">\n' +
    "      <a itemprop=\"item\" href=\"" +
    escapeHtml(canonical) +
    '"><span itemprop="name">' +
    escapeHtml(modelName || page.model || "Model") +
    "</span></a>\n" +
    '      <meta itemprop="position" content="3" />\n' +
    "    </div>\n" +
    "  </div>"
  );
}

function buildTrimsItemListMicrodata(page) {
  const sections =
    page.trims && Array.isArray(page.trims.sections) ? page.trims.sections : [];
  const all = [];
  for (const sec of sections) {
    for (const it of sec.items || []) {
      const label = (it && it.label) ? String(it.label).trim() : "";
      if (label) all.push(label);
    }
  }
  if (!all.length) return "";
  let items = "";
  all.forEach((name, i) => {
    items +=
      "\n    <div itemprop=\"itemListElement\" itemscope itemtype=\"https://schema.org/ListItem\">\n" +
      '      <meta itemprop="position" content="' +
      (i + 1) +
      `" />\n` +
      '      <span itemprop="name">' +
      escapeHtml(name) +
      "</span>\n" +
      "    </div>";
  });
  const title = `${page.year || ""} ${page.make || ""} ${page.model || ""} trims`.trim();
  return (
    "\n  <div itemscope itemtype=\"https://schema.org/ItemList\"\n" +
    '    style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">\n' +
    '    <meta itemprop="name" content="' +
    escapeHtml(title) +
    `" />${items}\n` +
    "  </div>"
  );
}

function buildLineupItemListMicrodata(store, lineupPage, orderedModels) {
  if (!Array.isArray(orderedModels) || !orderedModels.length) return "";
  const siteUrl = store.siteUrl || "";
  let items = "";
  orderedModels.forEach((modelPage, idx) => {
    if (!modelPage) return;
    const name = `${modelPage.year || ""} ${modelPage.make || ""} ${
      modelPage.model || ""
    }`.trim();
    const url =
      modelPage.canonicalUrl ||
      joinUrl(siteUrl, modelPage.pagePath || "");
    if (!name || !url) return;
    items +=
      "\n    <div itemprop=\"itemListElement\" itemscope itemtype=\"https://schema.org/ListItem\">\n" +
      '      <meta itemprop="position" content="' +
      (idx + 1) +
      `" />\n` +
      '      <a itemprop="item" href="' +
      escapeHtml(url) +
      '"><span itemprop="name">' +
      escapeHtml(name) +
      "</span></a>\n" +
      "    </div>";
  });
  if (!items) return "";
  const title =
    (lineupPage &&
      `${lineupPage.year || ""} ${lineupPage.brand || ""} lineup`.trim()) ||
    "Model lineup";
  return (
    "\n  <div itemscope itemtype=\"https://schema.org/ItemList\"\n" +
    '    style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">\n' +
    '    <meta itemprop="name" content="' +
    escapeHtml(title) +
    `" />${items}\n` +
    "  </div>"
  );
}

function buildFaqMicrodataWrapper(faqs) {
  if (!Array.isArray(faqs) || !faqs.length) return "";
  let items = "";
  for (const f of faqs) {
    const q = escapeHtml(f.q || "");
    const a = escapeHtml(f.a || "");
    if (!q || !a) continue;
    items +=
      "\n    <div itemscope itemprop=\"mainEntity\" itemtype=\"https://schema.org/Question\">\n" +
      '      <meta itemprop="name" content="' +
      q +
      `" />\n` +
      "      <div itemscope itemprop=\"acceptedAnswer\" itemtype=\"https://schema.org/Answer\">\n" +
      '        <meta itemprop="text" content="' +
      a +
      `" />\n` +
      "      </div>\n" +
      "    </div>";
  }
  return (
    '<div itemscope itemtype="https://schema.org/FAQPage"\n' +
    '        style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">\n' +
    items +
    "\n      </div>"
  );
}

function deriveBodyType(model, tags) {
  const t = Array.isArray(tags) ? tags.join(" ") : "";
  const s = `${model || ""} ${t}`.toLowerCase();
  if (/(suv|crossover)/.test(s)) return "suv";
  if (/(truck|tacoma|tundra|ranger)/.test(s)) return "truck";
  if (/(van|sienna)/.test(s)) return "minivan";
  if (/coupe/.test(s)) return "coupe";
  if (/hatchback/.test(s)) return "hatchback";
  if (/wagon/.test(s)) return "wagon";
  if (/convertible/.test(s)) return "convertible";
  return "sedan";
}

function deriveFuelType(model, tags) {
  const t = Array.isArray(tags) ? tags.join(" ") : "";
  const s = `${model || ""} ${t}`.toLowerCase();
  if (/(plug-in hybrid|phev|prime)/.test(s)) return "PluginHybrid";
  if (/hybrid/.test(s)) return "HybridGasoline";
  // BMW: i4/i5/i7/ix. Toyota: bz* (e.g. bz4x, bz3).
  if (/(i4|i5|i7|ix)/.test(s) || /(^|[^a-z0-9])bz([^a-z0-9]|$)/.test(s))
    return "Electric";
  return "Gasoline";
}

function buildVehicleSchemaJsonLd(store, page) {
  if (!page || page.pageType !== "model-year") return "";
  const year = page.year ?? "";
  const make = page.make ?? store.brand ?? "";
  const model = page.model ?? "";
  if (!year || !make || !model) return "";

  const brandName = store.brand || make;
  const tags = Array.isArray(page.tags) ? page.tags : [];
  const override = page.vehicleSchema || {};

  const bodyType = override.bodyType || deriveBodyType(model, tags);
  const fuelType = override.fuelType || deriveFuelType(model, tags);

  const url = page.canonicalUrl || joinUrl(store.siteUrl || "", page.pagePath || "");
  const description =
    page.seo && typeof page.seo.metaDescription === "string"
      ? page.seo.metaDescription
      : "";
  const imageUrl = resolveImg(
    page.images && page.images.vehicleJellybean,
    store
  );

  const obj = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: `${year} ${brandName} ${model}`.trim(),
    brand: { "@type": "Brand", name: String(brandName).trim() },
    model: String(model).trim(),
    vehicleModelDate: String(year),
    bodyType,
    vehicleEngine: { "@type": "EngineSpecification", fuelType },
    itemCondition: "https://schema.org/NewCondition",
  };

  if (url) obj.url = url;
  if (description) obj.description = description;
  if (imageUrl) obj.image = imageUrl;

  // Optional overrides for edge cases (passed through the saved page JSON).
  if (override.driveWheelConfiguration) {
    obj.driveWheelConfiguration = override.driveWheelConfiguration;
  }
  if (typeof override.vehicleSeatingCapacity === "number") {
    obj.vehicleSeatingCapacity = override.vehicleSeatingCapacity;
  }

  return (
    '<script type="application/ld+json">' + JSON.stringify(obj) + "</script>"
  );
}

function renderBullets(bullets) {
  if (!Array.isArray(bullets) || !bullets.length) return "";
  return bullets.map((b) => "<li>" + escapeHtml(b) + "</li>").join("");
}

/** Single checklist row for the why-it-fits 2x2 grid (data-tto whyBullet1..3). */
function renderWhyBulletItem(bullets, index) {
  if (!Array.isArray(bullets) || index < 0) return "";
  const b = bullets[index];
  if (b == null || String(b).trim() === "") return "";
  return "<li>" + escapeHtml(String(b)) + "</li>";
}

function renderNearbyTowns(towns) {
  if (!Array.isArray(towns) || !towns.length) return "";
  return towns
    .map((t) => "<strong>" + escapeHtml(t) + "</strong>")
    .join(" • ");
}

function renderTrims(trims) {
  const sections =
    trims && Array.isArray(trims.sections) ? trims.sections : [];
  if (!sections.length) return "";
  const cols = sections.slice(0, 2).map((sec, idx) => {
    const titleClass = idx === 0 ? "tto-ind-title-accent" : "tto-ind-title-dark";
    const items = (sec.items || [])
      .map((it) => {
        const label = escapeHtml(it.label || "");
        const note = it.note ? ": " + escapeHtml(it.note) : "";
        return "<li>" + label + note + "</li>";
      })
      .join("");
    return (
      '\n  <div class="tto-ind-col">\n' +
      '    <div class="tto-ind-title ' +
      titleClass +
      '">' +
      escapeHtml(sec.title || "") +
      "</div>\n" +
      '    <ul class="tto-checklist tto-checklist-compact">' +
      items +
      "</ul>\n" +
      "  </div>"
    );
  }).join("");
  return cols;
}

function renderContentSections(sections) {
  if (!Array.isArray(sections) || !sections.length) return "";
  return sections
    .map((sec) => {
      const title = escapeHtml(sec.title || "");
      const body = sanitizeEditorialHtml(sec.bodyHtml || "");
      if (!title && !body) return "";
      return (
        '\n<section class="tto-card">' +
        '<h2 class="tto-h2">' +
        title +
        "</h2>" +
        '<div class="tto-body">' +
        body +
        "</div>" +
        "</section>"
      );
    })
    .join("");
}

function renderFaqDetails(faqs) {
  if (!Array.isArray(faqs) || !faqs.length) return "";
  return faqs
    .map((f) => {
      const q = sanitizeEditorialHtml(f.q || "");
      const a = sanitizeEditorialHtml(f.a || "");
      return (
        '<details class="tto-qa"><summary>' +
        q +
        '</summary><p class="tto-body">' +
        a +
        "</p></details>"
      );
    })
    .join("");
}

function resolveImg(imgObj, store) {
  if (!imgObj) return "";
  if (imgObj.src) return String(imgObj.src).trim();
  if (imgObj.path)
    return joinUrl(store.assets && store.assets.r2BaseUrl, imgObj.path);
  return "";
}

function applySeoHead(html, page, store) {
  // Title
  const title =
    page.seo && page.seo.title
      ? page.seo.title
      : `${page.year || ""} ${page.make || ""} ${
          page.model || ""
        } in ${(page.city || store.location?.city || "")}, ${
          page.state || store.location?.state || ""
        }`.trim();

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    "<title>" + escapeHtml(title) + "</title>"
  );

  // Meta description (supports both page.seo.description and page.metaDescription)
  const desc =
    (page.seo && (page.seo.description || page.seo.metaDescription)) ||
    page.metaDescription ||
    "";
  if (desc) {
    if (/<meta name="description"/i.test(html)) {
      html = html.replace(
        /<meta name="description"[^>]*>/i,
        '<meta name="description" content="' + escapeHtml(desc) + '" />'
      );
    } else {
      html = html.replace(
        /<\/title>/i,
        '</title>\n  <meta name="description" content="' +
          escapeHtml(desc) +
          '" />'
      );
    }
  }

  // Canonical
  const canonical =
    page.canonicalUrl || joinUrl(store.siteUrl, page.pagePath || "");
  if (canonical) {
    if (/<link rel="canonical"/i.test(html)) {
      html = html.replace(
        /<link rel="canonical"[^>]*>/i,
        '<link rel="canonical" href="' + escapeHtml(canonical) + '" />'
      );
    } else {
      html = html.replace(
        /<\/head>/i,
        '  <link rel="canonical" href="' +
          escapeHtml(canonical) +
          "\" />\n</head>"
      );
    }
  }
  return html;
}

function renderModelYearPage(templateHtml, store, page) {
  const city = (page.city || store.location?.city || "").trim();
  const state = (page.state || store.location?.state || "").trim();
  const year = page.year || "";
  const make = page.make || "";
  const model = page.model || "";
  const h1Base = [year, make, model].filter(Boolean).join(" ").trim();
  const h1Loc = [city, state].filter(Boolean).join(", ").trim();
  const h1Text = [h1Base, h1Loc ? `in ${h1Loc}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  // Deterministic single PMA town for "fits ____"
  const seed =
    page.pagePath || page.canonicalUrl || `${page.year}-${page.make}-${page.model}`;
  const pool =
    store.seo && Array.isArray(store.seo.serviceArea)
      ? store.seo.serviceArea
      : [];
  const pmaTownRaw = pickUniqueDeterministic(pool, 1, seed + "::fit")[0] || city;
  // For Toyota, never use excluded towns in "Why the X fits Y"; replace with one from allowed list (deterministic per page).
  const makeLower = String(page.make || "").trim().toLowerCase();
  let pmaTown = pmaTownRaw;
  if (makeLower === "toyota") {
    const pmaLower = String(pmaTownRaw || "").trim().toLowerCase();
    if (TOYOTA_EXCLUDED_FIT_TOWNS.includes(pmaLower)) {
      const idx =
        hash32(seed + "::toyota-fit") % TOYOTA_ALLOWED_FIT_TOWNS.length;
      pmaTown = TOYOTA_ALLOWED_FIT_TOWNS[idx];
    }
  }
  // Resolve images
  const heroUrl = resolveImg(page.images && page.images.hero, store);
  const jellyUrl = resolveImg(page.images && page.images.vehicleJellybean, store);
  const dealerUrl = resolveImg(store.images && store.images.dealership, store);

  // Fill SEO head
  let html = applySeoHead(templateHtml, page, store);

  // Accent color (CSS variable)
  if (page.accent || (store.branding && store.branding.accentColor)) {
    const accent = page.accent || store.branding.accentColor;
    // Set inline style on tto-scope: --tto-accent
    html = html.replace(
      /<section class="tto-scope"([^>]*)>/,
      (m, rest) => {
        if (/style="/.test(m)) return m; // keep existing
        return `<section class="tto-scope"${rest} style="--tto-accent:${escapeHtml(accent)};">`;
      }
    );
  }

  // Core text tokens
  const kickerText = [year, "MODEL YEAR • LOCAL AVAILABILITY"]
    .filter(Boolean)
    .join(" ")
    .trim();
  const whyHeading = `Why the ${[year, model]
    .filter(Boolean)
    .join(" ")} fits ${pmaTown}`
    .replace(/\s+/g, " ")
    .trim();
  const faqHeading = `${[year, model].filter(Boolean).join(" ")} FAQ`.trim();
  const ctaHeading = `Get pricing on the ${[year, model]
    .filter(Boolean)
    .join(" ")}`
    .replace(/\s+/g, " ")
    .trim();
  const quickLinksHeading = `${model} Quick Links`.trim();
  const inventoryLinkText = `View ${model} Inventory`.trim();
  const allNewLinkText = `Browse All New ${make} Inventory`.trim();

  html = replaceTextByDataTto(html, "h1", h1Text);
  html = replaceTextByDataTto(html, "kicker", kickerText);
  html = replaceTextByDataTto(html, "whyHeading", whyHeading);
  html = replaceTextByDataTto(html, "faqHeading", faqHeading);
  html = replaceTextByDataTto(html, "ctaHeading", ctaHeading);
  html = replaceTextByDataTto(html, "quickLinksHeading", quickLinksHeading);
  html = replaceTextByDataTto(html, "inventoryLinkText", inventoryLinkText);
  html = replaceTextByDataTto(html, "allNewLinkText", allNewLinkText);

  html = replaceHtmlByDataTto(
    html,
    "heroSubhead",
    sanitizeEditorialHtml(page.heroSubhead || ""),
  );
  const fine =
    page.heroFine ||
    `Serving ${[city, store.location?.county].filter(Boolean).join(", ")} and nearby communities.`;
  html = replaceTextByDataTto(html, "heroFine", fine);
  html = replaceTextByDataTto(html, "localDealerName", store.dealerName || "");
  html = replaceTextByDataTto(
    html,
    "localAddress",
    store.fullAddress ? `Address: ${store.fullAddress}` : ""
  );
  html = replaceTextByDataTto(
    html,
    "localPhone",
    store.phone ? `Phone: ${store.phone}` : ""
  );
  html = replaceTextByDataTto(
    html,
    "localHours",
    store.openingHours && store.openingHours.length
      ? `Hours: ${store.openingHours.join(" • ")}`
      : ""
  );
  html = replaceTextByDataTto(html, "localServiceArea", store.serviceAreaText);

  // Lineup breadcrumb (← YYYY Make Lineup)
  const makeSlug = String(make || store.brand || "").trim().toLowerCase();
  if (year && makeSlug) {
    const lineupPath = `/new-${makeSlug}/${year}-${makeSlug}-model-lineup.htm`;
    const lineupText = `← ${year} ${make} Lineup`.trim();
    html = replaceTextByDataTto(html, "lineupText", lineupText);
    html = replaceAttrByDataToken(html, "data-tto-href", "lineupHref", "href", lineupPath);
  }

  // Links
  const siteUrl = store.siteUrl || "";
  const inv = (page.links && page.links.inventoryHref) || page.inventoryHref || "";
  const allNew =
    store.links && store.links.newInventory
      ? joinUrl(siteUrl, store.links.newInventory)
      : (page.links && page.links.allNewHref) || "";
  const finance =
    store.links && store.links.finance
      ? joinUrl(siteUrl, store.links.finance)
      : (page.links && page.links.financeHref) || "";
  const trade =
    store.links && store.links.trade
      ? joinUrl(siteUrl, store.links.trade)
      : (page.links && page.links.tradeHref) || "";
  const contact =
    store.links && store.links.contact
      ? joinUrl(siteUrl, store.links.contact)
      : (page.links && page.links.contactHref) || "";
  const phoneRaw =
    (store.contact && store.contact.phone) || store.phone || "";
  const telDigits = String(phoneRaw).replace(/[^\d]/g, "");
  const callHref = telDigits ? `tel:+1${telDigits}` : "";
  const mapQuery = [
    store.dealerName || store.legalName || "",
    store.location && store.location.address,
    store.location && store.location.city,
    store.location && store.location.state,
    store.location && store.location.zip,
  ]
    .filter(Boolean)
    .join(", ");
  const mapsHref = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : "";

  html = replaceAttrByDataToken(html, "data-tto-href", "inventoryHref", "href", inv);
  html = replaceAttrByDataToken(html, "data-tto-href", "allNewHref", "href", allNew);
  html = replaceAttrByDataTto(html, "financeHref", "href", finance);
  html = replaceAttrByDataTto(html, "tradeHref", "href", trade);
  html = replaceAttrByDataTto(html, "contactHref", "href", contact);
  html = replaceAttrByDataTto(html, "dealerCallHref", "href", callHref);
  html = replaceAttrByDataTto(html, "dealerMapsHref", "href", mapsHref);
  html = replaceTextByDataTto(
    html,
    "dealerBusinessName",
    store.dealerName || store.legalName || ""
  );
  html = replaceTextByDataTto(html, "dealerPhoneText", phoneRaw || "");
  const dealerAddress = [
    store.location && store.location.address,
    [
      store.location && store.location.city,
      store.location && store.location.state,
      store.location && store.location.zip,
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" ");
  html = replaceTextByDataTto(html, "dealerAddress", dealerAddress);

  html = replaceAttrByDataTto(
    html,
    "inventoryAnchorHref",
    "href",
    inv ||
      (store.defaults && store.defaults.inventoryAnchor) ||
      "#inventory"
  );
  html = replaceAttrByDataTto(
    html,
    "leadHref",
    "href",
    (store.defaults && store.defaults.leadFormAnchor) || "#tto_leadform"
  );

  // Images with fallback
  const heroAlt =
    (page.images && page.images.hero && page.images.hero.alt) ||
    `${page.year || ""} ${page.make || ""} ${page.model || ""} in ${city}, ${state}`.trim();
  const jellyAlt =
    (page.images &&
      page.images.vehicleJellybean &&
      page.images.vehicleJellybean.alt) ||
    `${page.year || ""} ${page.make || ""} ${
      page.model || ""
    } jellybean image`.trim();
  const dealerAlt =
    (store.images && store.images.dealership && store.images.dealership.alt) ||
    `Exterior of ${store.dealerName || "the dealership"}`;

  html = setImgByDataTto(html, "heroImg", heroUrl, heroAlt);
  html = setImgByDataTto(html, "vehicleJellybeanImg", jellyUrl, jellyAlt);
  html = setImgByDataTto(html, "dealershipImg", dealerUrl, dealerAlt);

  // Lists / sections (why-it-fits 2x2: one <li> per quadrant ul)
  const bullets = page.whyBullets || [];
  html = replaceHtmlByDataTto(html, "whyBullet1", renderWhyBulletItem(bullets, 0));
  html = replaceHtmlByDataTto(html, "whyBullet2", renderWhyBulletItem(bullets, 1));
  html = replaceHtmlByDataTto(html, "whyBullet3", renderWhyBulletItem(bullets, 2));
  html = replaceHtmlByDataTto(
    html,
    "nearbyTowns",
    renderNearbyTowns(page.nearbyTowns || [])
  );
  html = replaceHtmlByDataTto(
    html,
    "trimsIntro",
    page.trims && page.trims.intro ? sanitizeEditorialHtml(page.trims.intro) : "",
  );
  html = replaceHtmlByDataTto(html, "trims", renderTrims(page.trims || {}));
  html = replaceHtmlByDataTto(
    html,
    "contentSections",
    renderContentSections(page.contentSections || [])
  );
  html = replaceHtmlByDataTto(
    html,
    "faqList",
    renderFaqDetails(page.faqs || [])
  );

  html = stripLocalInfoCard(html);

  // Strip scripts + data-tto
  html = stripAllScripts(html);
  html = stripAllDataTto(html);

  // Inject microdata blocks (AutoDealer + BreadcrumbList + ItemList + FAQPage microdata wrapper)
  const microParts = [];

  // Add Car JSON-LD only for model-year pages.
  const pageType = page.pageType || "";
  if (String(pageType) === "model-year") {
    microParts.push(buildVehicleSchemaJsonLd(store, page));
  }

  // Breadcrumbs and FAQPage and trims itemlist can follow store.schema toggles if present; default true
  const flags = store.schema || {};
  const includeBreadcrumbs = flags.includeBreadcrumbs !== false;
  const includeFaq = flags.includeFAQPage !== false;
  const includeTrims = flags.includeTrimsItemList !== false;

  if (includeBreadcrumbs) microParts.push(buildBreadcrumbMicrodata(store, page));
  if (includeTrims) microParts.push(buildTrimsItemListMicrodata(page));
  if (includeFaq) microParts.push(buildFaqMicrodataWrapper(page.faqs || []));

  html = injectMicrodata(html, microParts.join("\n"));

  return html;
}

function firstSentence(text) {
  if (!text) return "";
  const s = String(text).trim();
  if (!s) return "";
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : s;
}

function splitSentences(text) {
  const compact = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return [];
  const parts = compact.match(/[^.!?]+[.!?]?/g) || [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

function pickBalancedLineupTeaser(text, options) {
  const targetMin = Math.max(60, Number(options?.targetMin || 120));
  const targetMax = Math.max(targetMin, Number(options?.targetMax || 180));
  const sentences = splitSentences(text);
  if (!sentences.length) return "";

  let combined = "";
  for (const sentence of sentences) {
    const candidate = combined ? `${combined} ${sentence}` : sentence;
    if (candidate.length <= targetMax) {
      combined = candidate;
      if (combined.length >= targetMin) return combined;
      continue;
    }
    if (!combined) return sentence;
    break;
  }

  if (combined) return combined;
  return sentences[0];
}

function cleanBmwLineupTeaser(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  return s
    .replace(
      /\s+at BMW of Demotown\b(?:,\s*serving[^.]*?)?(?=[\s—,.]|$)/gi,
      ""
    )
    .replace(/\s+available at BMW of Demotown\b(?=[\s—,.]|$)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function buildLineupTeaser(modelPage, override, maxLen, brand) {
  const page = modelPage || {};
  const overrideText = String(override || "").trim();
  const seo = page.seo || {};
  const summary = (page.localSeoSummary || "").trim();
  const meta =
    (seo.metaDescription || seo.description || page.metaDescription || "").trim();

  const candidates = [];
  if (overrideText) candidates.push(overrideText);
  if (summary) candidates.push(summary);
  if (meta) candidates.push(firstSentence(meta), meta);

  for (const source of candidates) {
    if (!source) continue;
    const cleaned =
      String(brand || "").trim().toLowerCase() === "bmw"
        ? cleanBmwLineupTeaser(source)
        : source;
    const balanced = pickBalancedLineupTeaser(cleaned, {
      targetMin: 120,
      targetMax: maxLen || 180,
    });
    if (balanced) return balanced;
  }

  const fallback = overrideText || summary || firstSentence(meta);
  if (!fallback) return "";
  return (
    String(brand || "").trim().toLowerCase() === "bmw"
      ? cleanBmwLineupTeaser(fallback)
      : fallback
  );
}

function renderBrandLineupPage(templateHtml, store, lineupPage, modelPages) {
  const year = lineupPage.year || (modelPages && modelPages[0]?.year) || "";
  const brandRaw =
    lineupPage.brand ||
    lineupPage.make ||
    (modelPages && modelPages[0]?.make) ||
    store.brand ||
    "";
  const brandSlug = String(brandRaw || "").trim().toLowerCase();
  let make =
    String(brandRaw || "").trim() ||
    (modelPages && modelPages[0]?.make) ||
    store.brand ||
    "";
  if (brandSlug === "toyota") make = "Toyota";
  else if (brandSlug === "lexus") make = "Lexus";
  else if (brandSlug === "bmw") make = "BMW";
  const city = (lineupPage.city || store.location?.city || "").trim();
  const state = (lineupPage.state || store.location?.state || "").trim();

  const pageForSeo = {
    ...lineupPage,
    year,
    make,
    model: lineupPage.model || "Model Lineup",
  };

  let html = applySeoHead(templateHtml, pageForSeo, store);

  if (lineupPage.accent || (store.branding && store.branding.accentColor)) {
    const accent = lineupPage.accent || store.branding.accentColor;
    html = html.replace(
      /<section class="tto-scope"([^>]*)>/,
      (m, rest) => {
        if (/style="/.test(m)) return m;
        return `<section class="tto-scope"${rest} style="--tto-accent:${escapeHtml(
          accent
        )};">`;
      }
    );
  }

  const h1Base = `${year || ""} ${make || ""} Lineup`.trim();
  const h1Loc = [city, state].filter(Boolean).join(", ").trim();
  const h1Text = [h1Base, h1Loc ? `in ${h1Loc}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  const kickerText = [year, "MODEL YEAR LINEUP"]
    .filter(Boolean)
    .join(" ")
    .trim();

  const defaultHeroSubhead =
    lineupPage.heroSubhead ||
    `See every ${year || ""} ${make || ""} model available at ${
      store.dealerName || "our dealership"
    } in ${[city, state].filter(Boolean).join(", ")}.`;

  const fine =
    lineupPage.heroFine ||
    `Serving ${[city, store.location?.county]
      .filter(Boolean)
      .join(", ")} and nearby communities.`;

  const modelsHeadingDefault = `${year || ""} ${make || ""} lineup`.trim();
  const modelsIntroDefault =
    lineupPage.modelsIntro ||
    `Browse every ${year || ""} ${make || ""} car, SUV, truck, and hybrid in one place, then tap through to detailed pages for trims, features, and local availability.`;

  html = replaceTextByDataTto(
    html,
    "h1",
    lineupPage.h1 || h1Text
  );
  html = replaceTextByDataTto(html, "kicker", kickerText);
  html = replaceTextByDataTto(html, "heroSubhead", defaultHeroSubhead);
  html = replaceTextByDataTto(html, "heroFine", fine);
  html = replaceTextByDataTto(
    html,
    "modelsHeading",
    lineupPage.modelsHeading || modelsHeadingDefault
  );
  html = replaceTextByDataTto(
    html,
    "modelsIntro",
    modelsIntroDefault
  );

  const siteUrl = store.siteUrl || "";
  const allNew =
    store.links && store.links.newInventory
      ? joinUrl(siteUrl, store.links.newInventory)
      : "";

  html = replaceAttrByDataTto(
    html,
    "inventoryAnchorHref",
    "href",
    allNew || (store.defaults && store.defaults.inventoryAnchor) || "#inventory"
  );
  html = replaceAttrByDataTto(
    html,
    "leadHref",
    "href",
    (store.defaults && store.defaults.leadFormAnchor) || "#tto_leadform"
  );

  const pagesArray = Array.isArray(modelPages) ? modelPages.slice() : [];
  const byModelName = new Map();
  const bySlug = new Map();
  for (const p of pagesArray) {
    if (!p || !p.model) continue;
    const nameKey = String(p.model).trim().toLowerCase();
    if (nameKey) {
      if (!byModelName.has(nameKey)) byModelName.set(nameKey, p);
    }
    const slug = slugifyModelName(p.model);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p);
  }

  const orderedModels = [];
  const seen = new Set();
  const requestedModels = Array.isArray(lineupPage.models)
    ? lineupPage.models
    : [];

  for (const entry of requestedModels) {
    const raw = String(entry || "").trim();
    if (!raw) continue;
    const nameKey = raw.toLowerCase();
    const slugKey = slugifyModelName(raw);
    let page =
      byModelName.get(nameKey) ||
      bySlug.get(slugKey) ||
      null;
    if (!page) continue;
    const pageId = `${page.year || ""}-${page.make || ""}-${page.model || ""}`;
    if (seen.has(pageId)) continue;
    seen.add(pageId);
    orderedModels.push(page);
  }

  if (!orderedModels.length) {
    for (const p of pagesArray) {
      if (!p) continue;
      const pid = `${p.year || ""}-${p.make || ""}-${p.model || ""}`;
      if (seen.has(pid)) continue;
      seen.add(pid);
      orderedModels.push(p);
    }
  }

  const cardsConfig = lineupPage.cards || {};
  const usedCTAs = new Set();
  let cardsHtml = "";

  for (const page of orderedModels) {
    const modelName = String(page.model || "").trim();
    if (!modelName) continue;
    const modelSlug = slugifyModelName(modelName);
    const cardCfg =
      cardsConfig[modelSlug] ||
      cardsConfig[modelName] ||
      {};
    const teaser = buildLineupTeaser(
      page,
      cardCfg.teaserOverride,
      180,
      brandSlug
    );
    const ctaLabel =
      cardCfg.ctaLabelOverride ||
      selectLineupCTA(brandSlug, usedCTAs, modelName);
    const cardTitle = `${page.year || ""} ${modelName}`.trim();
    const href =
      page.canonicalUrl ||
      joinUrl(siteUrl, page.pagePath || "");
    const jellyUrl = resolveImg(
      page.images && page.images.vehicleJellybean,
      store
    );
    const jellyAlt =
      (page.images &&
        page.images.vehicleJellybean &&
        page.images.vehicleJellybean.alt) ||
      `${page.year || ""} ${page.make || ""} ${modelName} jellybean image`.trim();

    cardsHtml +=
      '\n<article class="tto-card tto-grid-card">' +
      '\n  <figure class="tto-media tto-grid-card-media">' +
      '\n    <img src="' +
      escapeHtml(jellyUrl || "") +
      '" alt="' +
      escapeHtml(jellyAlt) +
      '" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'https://placehold.co/800x450?text=\'+encodeURIComponent(this.alt || \'Image\')">' +
      "\n  </figure>" +
      "\n  <h3 class=\"tto-grid-card-title\">" +
      escapeHtml(cardTitle) +
      "</h3>" +
      "\n  <p class=\"tto-body\">" +
      escapeHtml(teaser) +
      "</p>" +
      '\n  <div class="tto-grid-card-footer">' +
      '\n    <a class="tto-btn tto-btn-primary" href="' +
      escapeHtml(href || "#") +
      '">' +
      escapeHtml(ctaLabel) +
      "</a>" +
      "\n  </div>" +
      "\n</article>";
  }

  html = replaceHtmlByDataTto(html, "cards", cardsHtml);

  html = stripAllScripts(html);
  html = stripAllDataTto(html);

  const microParts = [];
  const flags = store.schema || {};
  const includeBreadcrumbs = flags.includeBreadcrumbs !== false;
  if (includeBreadcrumbs) {
    microParts.push(buildBreadcrumbMicrodata(store, pageForSeo));
  }
  microParts.push(
    buildLineupItemListMicrodata(store, lineupPage, orderedModels)
  );

  html = injectMicrodata(html, microParts.join("\n"));

  return html;
}

module.exports = {
  renderModelYearPage,
  renderBrandLineupPage,
};

