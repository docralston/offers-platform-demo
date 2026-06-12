'use client';

import * as React from 'react';
import { Modal } from '@/components/ui';
import { DemoAboutActions, DemoAboutContent } from '@/components/demo/DemoAboutContent';

type DemoAboutContextValue = {
  openAbout: () => void;
};

const DemoAboutContext = React.createContext<DemoAboutContextValue | null>(null);

export function DemoAboutProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  const value = React.useMemo(
    () => ({
      openAbout: () => setOpen(true),
    }),
    [],
  );

  return (
    <DemoAboutContext.Provider value={value}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title="About this demo" size="lg">
        <DemoAboutContent />
        <DemoAboutActions onClose={() => setOpen(false)} />
      </Modal>
    </DemoAboutContext.Provider>
  );
}

export function useDemoAbout() {
  const ctx = React.useContext(DemoAboutContext);
  if (!ctx) {
    throw new Error('useDemoAbout must be used within DemoAboutProvider');
  }
  return ctx;
}

const linkClass =
  'text-xs font-medium text-amber-300 underline-offset-2 hover:text-amber-200 hover:underline';

export function AboutThisDemoLink({
  className = linkClass,
}: {
  className?: string;
}) {
  const { openAbout } = useDemoAbout();
  return (
    <button type="button" onClick={openAbout} className={className}>
      About this demo
    </button>
  );
}
