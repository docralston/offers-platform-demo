'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ThemeToggle } from './ThemeToggle';

const UserButtonClient = dynamic(
  () =>
    import('./UserButtonClient').then((mod) => ({
      default: mod.UserButtonClient,
    })),
  { ssr: false },
);

export function AdminNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const homeActive = pathname === '/admin' || pathname === '/admin/';
  const offersActive = pathname?.startsWith('/admin/offers') ?? false;
  const modelPagesActive = pathname?.startsWith('/admin/model-pages') ?? false;
  const specialsActive = pathname?.startsWith('/admin/specials') ?? false;
  const imagesActive = pathname?.startsWith('/admin/images') ?? false;
  const emailsActive = pathname?.startsWith('/admin/emails') ?? false;
  const jsonActive = pathname?.startsWith('/admin/json') ?? false;
  const usageActive = pathname?.startsWith('/admin/ai-usage') ?? false;
  const disclaimersActive = pathname?.startsWith('/admin/disclaimers') ?? false;
  const embedActive = pathname?.startsWith('/admin/embed') ?? false;
  const settingsActive = pathname?.startsWith('/admin/settings') ?? false;

  function navClass(active: boolean, mobile = false) {
    if (mobile) {
      const base = 'block border-l-4 py-3 px-4 text-sm font-medium';
      return active
        ? `${base} border-accent-600 text-neutral-900 dark:border-accent-500 dark:text-neutral-100`
        : `${base} border-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100`;
    }
    const base = '-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150';
    return active
      ? `${base} border-accent-600 text-neutral-900 dark:border-accent-500 dark:text-neutral-100`
      : `${base} border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-300 dark:hover:text-neutral-100`;
  }

  const navLinks = (
    <>
      <Link href="/admin/offers" className={navClass(offersActive)} onClick={() => setMobileOpen(false)}>
        Offers
      </Link>
      <Link href="/admin/model-pages" className={navClass(modelPagesActive)} onClick={() => setMobileOpen(false)}>
        Model pages
      </Link>
      <Link href="/admin/specials" className={navClass(specialsActive)} onClick={() => setMobileOpen(false)}>
        Specials
      </Link>
      <Link href="/admin/images" className={navClass(imagesActive)} onClick={() => setMobileOpen(false)}>
        Images
      </Link>
      <Link href="/admin/emails" className={navClass(emailsActive)} onClick={() => setMobileOpen(false)}>
        Emails
      </Link>
      <Link href="/admin/json" className={navClass(jsonActive)} onClick={() => setMobileOpen(false)}>
        JSON
      </Link>
      <Link href="/admin/ai-usage" className={navClass(usageActive)} onClick={() => setMobileOpen(false)}>
        Usage
      </Link>
      <Link href="/admin/disclaimers" className={navClass(disclaimersActive)} onClick={() => setMobileOpen(false)}>
        Disclaimers
      </Link>
      <Link href="/admin/embed" className={navClass(embedActive)} onClick={() => setMobileOpen(false)}>
        Embed
      </Link>
      <Link href="/admin/settings" className={navClass(settingsActive)} onClick={() => setMobileOpen(false)}>
        Settings
      </Link>
    </>
  );

  return (
    <nav className="sticky top-0 z-10 border-b border-neutral-200 bg-surface-slate dark:border-neutral-800 dark:bg-surface-slate-dark">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6 lg:px-8 xl:px-12">
        <Link
          href="/admin"
          className={
            homeActive
              ? 'shrink-0 -mb-px inline-flex items-center border-r border-b-2 border-neutral-200 border-b-accent-600 pr-4 py-2 text-sm font-semibold text-neutral-900 transition-colors duration-150 dark:border-neutral-800 dark:border-b-accent-500 dark:text-neutral-100 md:pr-6'
              : 'shrink-0 -mb-px inline-flex items-center border-r border-b-2 border-neutral-200 border-b-transparent pr-4 py-2 text-sm font-semibold text-neutral-900 transition-colors duration-150 hover:border-b-neutral-300 dark:border-neutral-800 dark:text-neutral-100 dark:hover:border-b-neutral-300 md:pr-6'
          }
        >
          Offers Platform
        </Link>
        <div className="hidden items-center gap-1 md:flex">{navLinks}</div>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 md:hidden"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          <span className="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
          {mobileOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <UserButtonClient />
        </div>
      </div>
      {mobileOpen && (
        <div className="border-t border-neutral-200 bg-surface-slate py-2 dark:border-neutral-800 dark:bg-surface-slate-dark md:hidden">
          <div className="flex flex-col px-4">
            <Link href="/admin/offers" className={navClass(offersActive, true)} onClick={() => setMobileOpen(false)}>
              Offers
            </Link>
            <Link href="/admin/model-pages" className={navClass(modelPagesActive, true)} onClick={() => setMobileOpen(false)}>
              Model pages
            </Link>
            <Link href="/admin/specials" className={navClass(specialsActive, true)} onClick={() => setMobileOpen(false)}>
              Specials
            </Link>
            <Link href="/admin/images" className={navClass(imagesActive, true)} onClick={() => setMobileOpen(false)}>
              Images
            </Link>
            <Link href="/admin/emails" className={navClass(emailsActive, true)} onClick={() => setMobileOpen(false)}>
              Emails
            </Link>
            <Link href="/admin/json" className={navClass(jsonActive, true)} onClick={() => setMobileOpen(false)}>
              JSON
            </Link>
            <Link href="/admin/ai-usage" className={navClass(usageActive, true)} onClick={() => setMobileOpen(false)}>
              Usage
            </Link>
            <Link href="/admin/disclaimers" className={navClass(disclaimersActive, true)} onClick={() => setMobileOpen(false)}>
              Disclaimers
            </Link>
            <Link href="/admin/embed" className={navClass(embedActive, true)} onClick={() => setMobileOpen(false)}>
              Embed
            </Link>
            <Link href="/admin/settings" className={navClass(settingsActive, true)} onClick={() => setMobileOpen(false)}>
              Settings
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
