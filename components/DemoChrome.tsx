'use client';

import { ThemeToggle } from '@/components/ThemeToggle';
import { DemoAboutProvider, AboutThisDemoLink } from '@/components/demo/DemoAboutProvider';

export function DemoChrome({ children }: { children: React.ReactNode }) {
  return (
    <DemoAboutProvider>
      <div className="flex min-h-screen flex-col">
        <header
          role="banner"
          className="sticky top-0 z-50 border-b border-slate-700/80 bg-slate-900 text-white shadow-sm"
        >
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-sm bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900">
                Demo
              </span>
              <span className="hidden text-xs font-medium uppercase tracking-wider text-slate-400 sm:inline">
                Ralston Digital
              </span>
            </div>
            <p className="text-center text-sm leading-snug text-slate-200 sm:flex-1">
              <span className="font-medium text-white">Portfolio demonstration.</span>{' '}
              Fictional dealerships and sample offers only — not connected to live dealer systems or
              inventory.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <AboutThisDemoLink />
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>

        <footer
          role="contentinfo"
          className="mt-auto border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-4 py-4 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              © 2026 Ralston Digital. All rights reserved.
            </p>
            <AboutThisDemoLink className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200" />
          </div>
        </footer>
      </div>
    </DemoAboutProvider>
  );
}
