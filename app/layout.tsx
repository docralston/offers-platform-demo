import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from 'next-themes';
import { Inter } from 'next/font/google';
import { DemoChrome } from '@/components/DemoChrome';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

const isDemo = process.env.DEMO_MODE === 'true';

export const metadata: Metadata = {
  title: isDemo ? 'Offers Platform — Demo' : 'Offers Platform',
  description: isDemo
    ? 'Portfolio demo of the automotive offers admin and publishing platform'
    : 'Internal offers platform for automotive marketing',
  ...(isDemo
    ? {
        openGraph: {
          title: 'Offers Platform — Portfolio Demo',
          description: 'Automotive offers admin, disclaimers, and embeddable widget showcase.',
          type: 'website',
        },
      }
    : {
        robots: {
          index: false,
          follow: false,
          noarchive: true,
          nosnippet: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
            noarchive: true,
            nosnippet: true,
          },
        },
      }),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.className} min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 antialiased`}
        >
          <ThemeProvider
            attribute="class"
            enableSystem={false}
            enableColorScheme={false}
            storageKey="offers-platform-theme"
            defaultTheme="light"
          >
            {isDemo ? <DemoChrome>{children}</DemoChrome> : children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

