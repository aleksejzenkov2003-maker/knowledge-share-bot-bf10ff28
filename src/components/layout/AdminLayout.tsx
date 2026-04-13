import { useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { pathname } = useLocation();
  const isProjectDetailRoute = /^\/projects\/[^/]+$/.test(pathname);

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-h-0">
          <AdminHeader />
          <main
            className={isProjectDetailRoute
              ? 'flex-1 min-h-0 overflow-hidden p-0'
              : 'flex-1 min-h-0 overflow-auto p-6'}
          >
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};