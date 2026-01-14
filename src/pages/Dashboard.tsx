import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, Building2, FileText, MessageSquare, Bot, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Stats {
  usersCount: number;
  departmentsCount: number;
  documentsCount: number;
  logsCount: number;
  providersCount: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    usersCount: 0,
    departmentsCount: 0,
    documentsCount: 0,
    logsCount: 0,
    providersCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const { isAdmin, isModerator } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [profiles, departments, documents, logs, providers] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('departments').select('id', { count: 'exact', head: true }),
          supabase.from('documents').select('id', { count: 'exact', head: true }),
          isAdmin || isModerator 
            ? supabase.from('chat_logs').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
          isAdmin 
            ? supabase.from('ai_providers').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
        ]);

        setStats({
          usersCount: profiles.count || 0,
          departmentsCount: departments.count || 0,
          documentsCount: documents.count || 0,
          logsCount: typeof logs === 'object' && 'count' in logs ? (logs.count || 0) : 0,
          providersCount: typeof providers === 'object' && 'count' in providers ? (providers.count || 0) : 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [isAdmin, isModerator]);

  const statCards = [
    {
      title: 'Пользователи',
      value: stats.usersCount,
      description: 'Всего зарегистрировано',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      show: isAdmin || isModerator,
    },
    {
      title: 'Отделы',
      value: stats.departmentsCount,
      description: 'Активных отделов',
      icon: Building2,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      show: true,
    },
    {
      title: 'Документы',
      value: stats.documentsCount,
      description: 'В базе знаний',
      icon: FileText,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      show: true,
    },
    {
      title: 'AI Провайдеры',
      value: stats.providersCount,
      description: 'Настроенных провайдеров',
      icon: Bot,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      show: isAdmin,
    },
    {
      title: 'Запросы к AI',
      value: stats.logsCount,
      description: 'Всего запросов',
      icon: MessageSquare,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
      show: isAdmin || isModerator,
    },
  ].filter(card => card.show);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
        <p className="text-muted-foreground">
          Обзор системы AI Chat
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '...' : stat.value}
              </div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Быстрые действия
            </CardTitle>
            <CardDescription>
              Часто используемые функции
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isAdmin && (
              <>
                <QuickAction href="/providers" label="Настроить AI провайдера" />
                <QuickAction href="/documents" label="Загрузить документ" />
                <QuickAction href="/prompts" label="Создать системный промпт" />
              </>
            )}
            <QuickAction href="/departments" label="Просмотреть отделы" />
            {(isAdmin || isModerator) && (
              <QuickAction href="/logs" label="Просмотреть логи" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Статус системы</CardTitle>
            <CardDescription>
              Состояние компонентов
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusItem label="База данных" status="online" />
            <StatusItem label="Авторизация" status="online" />
            <StatusItem label="AI провайдеры" status={stats.providersCount > 0 ? 'online' : 'offline'} />
            <StatusItem label="RAG система" status={stats.documentsCount > 0 ? 'online' : 'offline'} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const QuickAction = ({ href, label }: { href: string; label: string }) => (
  <a 
    href={href} 
    className="block rounded-lg border p-3 transition-colors hover:bg-muted"
  >
    {label}
  </a>
);

const StatusItem = ({ label, status }: { label: string; status: 'online' | 'offline' }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm">{label}</span>
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-yellow-500'}`} />
      <span className="text-xs text-muted-foreground">
        {status === 'online' ? 'Активен' : 'Требует настройки'}
      </span>
    </div>
  </div>
);

export default Dashboard;
