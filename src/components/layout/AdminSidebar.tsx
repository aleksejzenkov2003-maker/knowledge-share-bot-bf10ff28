import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  Building2,
  Bot,
  FileText,
  MessageSquare,
  ClipboardList,
  Settings,
  LogOut,
  FolderTree,
  UserCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const mainMenuItems = [
  { title: 'Дашборд', url: '/', icon: LayoutDashboard },
  { title: 'Чат', url: '/chat', icon: MessageSquare },
];

const managementItems = [
  { title: 'Роли чатов', url: '/chat-roles', icon: UserCircle, roles: ['admin'] },
  { title: 'Папки', url: '/folders', icon: FolderTree, roles: ['admin'] },
  { title: 'Документы', url: '/documents', icon: FileText, roles: ['admin'] },
  { title: 'Промпты', url: '/prompts', icon: MessageSquare, roles: ['admin'] },
  { title: 'AI Провайдеры', url: '/providers', icon: Bot, roles: ['admin'] },
];

const adminItems = [
  { title: 'Пользователи', url: '/users', icon: Users, roles: ['admin', 'moderator'] },
  { title: 'Отделы', url: '/departments', icon: Building2 },
  { title: 'Логи чатов', url: '/chat-logs', icon: ClipboardList, roles: ['admin', 'moderator'] },
];

const settingsItems = [
  { title: 'Настройки', url: '/settings', icon: Settings, roles: ['admin'] },
];

export const AdminSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { role, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const canAccess = (itemRoles?: string[]) => {
    if (!itemRoles) return true;
    return role && itemRoles.includes(role);
  };

  const filteredMainItems = mainMenuItems.filter(item => canAccess((item as any).roles));
  const filteredManagementItems = managementItems.filter(item => canAccess(item.roles));
  const filteredAdminItems = adminItems.filter(item => canAccess(item.roles));
  const filteredSettingsItems = settingsItems.filter(item => canAccess(item.roles));

  return (
    <Sidebar className={collapsed ? 'w-14' : 'w-60'} collapsible="icon">
      <SidebarHeader className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">AI Chat</span>
              <span className="text-xs text-muted-foreground">Админ-панель</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Основное</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredManagementItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Управление</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredManagementItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Администрирование</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredSettingsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Система</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredSettingsItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Выйти</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};
