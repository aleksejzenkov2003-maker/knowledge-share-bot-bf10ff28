import { useAuth } from '@/contexts/AuthContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  moderator: 'Модератор',
  employee: 'Сотрудник',
};

const roleColors: Record<string, string> = {
  admin: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
  moderator: 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20',
  employee: 'bg-green-500/10 text-green-500 hover:bg-green-500/20',
};

export const AdminHeader = () => {
  const { user, role } = useAuth();

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
      </div>

      <div className="flex items-center gap-3">
        {role && (
          <Badge variant="outline" className={roleColors[role]}>
            {roleLabels[role]}
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm md:block">{user?.email}</span>
        </div>
      </div>
    </header>
  );
};
