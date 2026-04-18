import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Users, Building2, FileText, MessageSquare, Bot, 
  TrendingUp, MessageCircle, Settings, Plus,
  Zap, FolderOpen, Sparkles, Loader2, Rocket
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Stats {
  usersCount: number;
  departmentsCount: number;
  documentsCount: number;
  logsCount: number;
  providersCount: number;
  rolesCount: number;
  promptsCount: number;
  foldersCount: number;
}

interface UsageData {
  name: string;
  count: number;
}

interface ProviderUsage {
  name: string;
  value: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(210, 80%, 60%)', 'hsl(150, 60%, 50%)', 'hsl(45, 90%, 55%)'];

const Dashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, isModerator, user, role } = useAuth();

  // Redirect employee to chat
  useEffect(() => {
    if (role === 'employee') {
      navigate('/chat', { replace: true });
    }
  }, [role, navigate]);

  const [stats, setStats] = useState<Stats>({
    usersCount: 0,
    departmentsCount: 0,
    documentsCount: 0,
    logsCount: 0,
    providersCount: 0,
    rolesCount: 0,
    promptsCount: 0,
    foldersCount: 0,
  });
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [providerUsage, setProviderUsage] = useState<ProviderUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  const initializeSystem = async () => {
    setIsInitializing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await supabase.functions.invoke('init-system', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.error) {
        toast.error('Ошибка инициализации: ' + response.error.message);
        return;
      }

      if (response.data.success) {
        toast.success(response.data.message);
        // Refetch stats
        window.location.reload();
      } else {
        toast.error('Ошибка инициализации');
      }
    } catch (error) {
      console.error('Init error:', error);
      toast.error('Ошибка инициализации системы');
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [profiles, departments, documents, logs, providers, roles, prompts, folders] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('departments').select('id', { count: 'exact', head: true }),
          supabase.from('documents').select('id', { count: 'exact', head: true }),
          isAdmin || isModerator 
            ? supabase.from('chat_logs').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
          isAdmin 
            ? supabase.from('ai_providers').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
          supabase.from('chat_roles').select('id', { count: 'exact', head: true }),
          supabase.from('system_prompts').select('id', { count: 'exact', head: true }),
          supabase.from('document_folders').select('id', { count: 'exact', head: true }),
        ]);

        setStats({
          usersCount: profiles.count || 0,
          departmentsCount: departments.count || 0,
          documentsCount: documents.count || 0,
          logsCount: typeof logs === 'object' && 'count' in logs ? (logs.count || 0) : 0,
          providersCount: typeof providers === 'object' && 'count' in providers ? (providers.count || 0) : 0,
          rolesCount: roles.count || 0,
          promptsCount: prompts.count || 0,
          foldersCount: folders.count || 0,
        });

        // Fetch usage data for charts (last 7 days)
        if (isAdmin || isModerator) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          const { data: logsData } = await supabase
            .from('chat_logs')
            .select('created_at, metadata')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: true });

          if (logsData) {
            // Group by day
            const dailyUsage: Record<string, number> = {};
            const providerCounts: Record<string, number> = {};
            
            logsData.forEach(log => {
              const date = new Date(log.created_at).toLocaleDateString('ru-RU', { weekday: 'short' });
              dailyUsage[date] = (dailyUsage[date] || 0) + 1;
              
              const providerType = (log.metadata as any)?.provider_type || 'unknown';
              providerCounts[providerType] = (providerCounts[providerType] || 0) + 1;
            });

            setUsageData(Object.entries(dailyUsage).map(([name, count]) => ({ name, count })));
            setProviderUsage(Object.entries(providerCounts).map(([name, value]) => ({ 
              name: name === 'lovable' ? 'Lovable AI' : name === 'anthropic' ? 'Anthropic' : name === 'openai' ? 'OpenAI' : name === 'openrouter' ? 'OpenRouter' : name === 'perplexity' ? 'Perplexity' : name,
              value 
            })));
          }
        }
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
      description: 'Зарегистрировано',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      show: isAdmin || isModerator,
    },
    {
      title: 'Роли чата',
      value: stats.rolesCount,
      description: 'Настроено ролей',
      icon: Sparkles,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      show: true,
    },
    {
      title: 'Документы',
      value: stats.documentsCount,
      description: 'В базе знаний',
      icon: FileText,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      show: true,
    },
    {
      title: 'Папки',
      value: stats.foldersCount,
      description: 'Для документов',
      icon: FolderOpen,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      show: true,
    },
    {
      title: 'AI Провайдеры',
      value: stats.providersCount,
      description: 'Настроено',
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

  const needsSetup = stats.providersCount === 0 || stats.rolesCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Дашборд</h1>
          <p className="text-muted-foreground">
            AI Chat с базой знаний
          </p>
        </div>
        <Button size="lg" onClick={() => navigate('/chat')} className="gap-2">
          <MessageCircle className="h-5 w-5" />
          Начать чат
        </Button>
      </div>

      {/* Setup Alert */}
      {isAdmin && needsSetup && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-primary">
              <Rocket className="h-5 w-5" />
              Быстрый старт
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Система ещё не настроена. Нажмите кнопку ниже для автоматической инициализации с Lovable AI.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={initializeSystem} disabled={isInitializing}>
                {isInitializing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                {isInitializing ? 'Инициализация...' : 'Автоматическая настройка'}
              </Button>
              <div className="flex items-center text-sm text-muted-foreground">
                или настройте вручную:
              </div>
              {stats.providersCount === 0 && (
                <Button variant="outline" size="sm" onClick={() => navigate('/providers')}>
                  <Plus className="h-4 w-4 mr-1" />
                  AI провайдер
                </Button>
              )}
              {stats.rolesCount === 0 && (
                <Button variant="outline" size="sm" onClick={() => navigate('/chat-roles')}>
                  <Plus className="h-4 w-4 mr-1" />
                  Роль чата
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

      {/* Charts (Admin/Moderator only) */}
      {(isAdmin || isModerator) && usageData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Использование за неделю
              </CardTitle>
              <CardDescription>
                Количество запросов по дням
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {providerUsage.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Распределение по провайдерам
                </CardTitle>
                <CardDescription>
                  Использование AI моделей
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={providerUsage}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {providerUsage.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-4 -mt-4">
                  {providerUsage.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                      />
                      <span>{entry.name}: {entry.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Быстрые действия
            </CardTitle>
            <CardDescription>
              Часто используемые функции
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction onClick={() => navigate('/chat')} label="Открыть чат с AI" icon={MessageCircle} />
            {isAdmin && (
              <>
                <QuickAction onClick={() => navigate('/providers')} label="Настроить AI провайдера" icon={Bot} />
                <QuickAction onClick={() => navigate('/chat-roles')} label="Управление ролями чата" icon={Sparkles} />
                <QuickAction onClick={() => navigate('/documents')} label="Загрузить документы" icon={FileText} />
                <QuickAction onClick={() => navigate('/prompts')} label="Системные промпты" icon={MessageSquare} />
              </>
            )}
            {(isAdmin || isModerator) && (
              <QuickAction onClick={() => navigate('/chat-logs')} label="Просмотреть логи" icon={TrendingUp} />
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
            <StatusItem label="Роли чата" status={stats.rolesCount > 0 ? 'online' : 'offline'} />
            <StatusItem label="База знаний (RAG)" status={stats.documentsCount > 0 ? 'online' : 'offline'} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const QuickAction = ({ onClick, label, icon: Icon }: { onClick: () => void; label: string; icon: React.ComponentType<{ className?: string }> }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted text-left"
  >
    <Icon className="h-4 w-4 text-muted-foreground" />
    <span className="text-sm">{label}</span>
  </button>
);

const StatusItem = ({ label, status }: { label: string; status: 'online' | 'offline' }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm">{label}</span>
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-amber-500'}`} />
      <span className="text-xs text-muted-foreground">
        {status === 'online' ? 'Активен' : 'Требует настройки'}
      </span>
    </div>
  </div>
);

export default Dashboard;
