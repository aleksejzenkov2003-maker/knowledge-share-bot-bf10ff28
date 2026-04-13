import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-h-0">
          <AdminHeader />
          <main className="flex-1 min-h-0 overflow-auto p-6 [&:has(>[data-no-padding])]:p-0 [&:has(>[data-no-padding])]:overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
