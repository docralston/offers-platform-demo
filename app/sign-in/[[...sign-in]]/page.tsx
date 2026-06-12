import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isDemoMode } from '@/lib/config/demo';
import { DemoSignIn } from '../DemoSignIn';

export default function SignInPage() {
  const demo = isDemoMode();

  return (
    <div className="relative flex flex-1 flex-col bg-gray-50 dark:bg-gray-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        {demo ? (
          <Suspense fallback={null}>
            <DemoSignIn />
          </Suspense>
        ) : (
          <SignIn />
        )}
      </div>
    </div>
  );
}
