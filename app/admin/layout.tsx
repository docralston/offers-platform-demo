import '../globals.css';
import { AdminNav } from '@/components/AdminNav';
import { ToastProvider } from '@/components/ui';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex flex-1 flex-col">
        <AdminNav />
        <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-12">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
