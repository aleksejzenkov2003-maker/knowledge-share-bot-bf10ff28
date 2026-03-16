import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCog, KeyRound, Trash2 } from 'lucide-react';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  department_id: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

interface Department {
  id: string;
  name: string;
}

const statusLabels: Record<string, string> = {
  active: 'Активен',
  trial: 'Пробный',
  limited: 'Ограничен',
  blocked: 'Заблокирован',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500',
  trial: 'bg-blue-500/10 text-blue-500',
  limited: 'bg-yellow-500/10 text-yellow-500',
  blocked: 'bg-red-500/10 text-red-500',
};

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  moderator: 'Модератор',
  employee: 'Сотрудник',
};

const Users = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; userId: string; userName: string }>({ open: false, userId: '', userName: '' });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: string; userName: string }>({ open: false, userId: '', userName: '' });
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      const [profilesRes, rolesRes, deptsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('departments').select('id, name'),
      ]);

      if (profilesRes.data) {
        setProfiles(profilesRes.data);
      }

      if (rolesRes.data) {
        const rolesMap: Record<string, string> = {};
        rolesRes.data.forEach((r: UserRole) => {
          rolesMap[r.user_id] = r.role;
        });
        setRoles(rolesMap);
      }

      if (deptsRes.data) {
        setDepartments(deptsRes.data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateUserStatus = async (userId: string, newStatus: 'active' | 'trial' | 'limited' | 'blocked') => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', userId);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить статус',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Статус пользователя обновлён',
      });
      fetchData();
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'moderator' | 'employee') => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('user_id', userId);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить роль',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Роль пользователя обновлена',
      });
      fetchData();
    }
  };

  const updateUserDepartment = async (userId: string, departmentId: string | null) => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('profiles')
      .update({ department_id: departmentId === 'none' ? null : departmentId })
      .eq('id', userId);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить отдел',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Отдел пользователя обновлён',
      });
      fetchData();
    }
  };

  const getDepartmentName = (departmentId: string | null) => {
    if (!departmentId) return 'Не назначен';
    const dept = departments.find(d => d.id === departmentId);
    return dept?.name || 'Не назначен';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Пользователи</h1>
        <p className="text-muted-foreground">
          Управление пользователями системы
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Список пользователей
          </CardTitle>
          <CardDescription>
            Всего: {profiles.length} пользователей
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя / Email</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Отдел</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дата регистрации</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{profile.full_name || 'Без имени'}</div>
                      <div className="text-sm text-muted-foreground">{profile.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={roles[profile.id] || 'employee'}
                        onValueChange={(value) => updateUserRole(profile.id, value as 'admin' | 'moderator' | 'employee')}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Администратор</SelectItem>
                          <SelectItem value="moderator">Модератор</SelectItem>
                          <SelectItem value="employee">Сотрудник</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">
                        {roleLabels[roles[profile.id]] || 'Сотрудник'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={profile.department_id || 'none'}
                        onValueChange={(value) => updateUserDepartment(profile.id, value)}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не назначен</SelectItem>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{getDepartmentName(profile.department_id)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={profile.status}
                        onValueChange={(value) => updateUserStatus(profile.id, value as 'active' | 'trial' | 'limited' | 'blocked')}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Активен</SelectItem>
                          <SelectItem value="trial">Пробный</SelectItem>
                          <SelectItem value="limited">Ограничен</SelectItem>
                          <SelectItem value="blocked">Заблокирован</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={statusColors[profile.status]}>
                        {statusLabels[profile.status]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(profile.created_at).toLocaleDateString('ru-RU')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Users;
