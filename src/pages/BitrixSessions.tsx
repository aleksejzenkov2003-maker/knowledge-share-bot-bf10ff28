import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Eye, MessageSquare, User, Bot, RefreshCw, Globe, Smartphone, PlayCircle, ExternalLink, Monitor } from 'lucide-react';

interface BitrixSession {
  bitrix_user_id: string;
  user_name: string | null;
  department_id: string;
  department_name: string;
  message_count: number;
  last_message_at: string;
  first_message_at: string;
}

interface DepartmentMessage {
  id: string;
  chat_id: string;
  user_id: string;
  role_id: string | null;
  message_role: 'user' | 'assistant';
  content: string;
  source: string;
  metadata: any;
  created_at: string;
}

interface Department {
  id: string;
  name: string;
}

interface ApiKeyWithDepartment {
  id: string;
  portal_domain: string;
  department_id: string;
  department_name: string;
}

const BitrixSessions = () => {
  const [sessions, setSessions] = useState<BitrixSession[]>([]);
  const [allMessages, setAllMessages] = useState<DepartmentMessage[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterSource, setFilterSource] = useState('bitrix');
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<BitrixSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<DepartmentMessage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Demo mode state
  const [apiKeys, setApiKeys] = useState<ApiKeyWithDepartment[]>([]);
  const [demoPortal, setDemoPortal] = useState<string>('');
  const [demoChatType, setDemoChatType] = useState<'personal' | 'department'>('personal');
  const [demoUserId, setDemoUserId] = useState<string>('demo-admin-123');
  const [demoUserName, setDemoUserName] = useState<string>('Тестовый Администратор');
  const [demoUserEmail, setDemoUserEmail] = useState<string>('admin@test.local');
  const [showDemoIframe, setShowDemoIframe] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string>('');

  useEffect(() => {
    fetchDepartments();
    fetchApiKeys();
  }, []);

  useEffect(() => {
    fetchData();
  }, [filterDepartment, filterSource]);

  const fetchDepartments = async () => {
    const { data } = await supabase.from('departments').select('id, name').order('name');
    setDepartments(data || []);
  };

  const fetchApiKeys = async () => {
    const { data } = await supabase
      .from('department_api_keys')
      .select(`
        id,
        portal_domain,
        department_id,
        departments(name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data) {
      const keys = data.map((k: any) => ({
        id: k.id,
        portal_domain: k.portal_domain || '',
        department_id: k.department_id,
        department_name: k.departments?.name || 'Неизвестный'
      }));
      setApiKeys(keys);
      if (keys.length > 0 && !demoPortal) {
        setDemoPortal(keys[0].portal_domain);
      }
    }
  };

  const openDemo = (inIframe: boolean) => {
    if (!demoPortal) return;
    
    const baseUrl = demoChatType === 'personal' ? '/bitrix-personal' : '/bitrix-department';
    const params = new URLSearchParams({
      portal: demoPortal,
      bitrixUserId: demoUserId,
      userName: demoUserName,
      userEmail: demoUserEmail,
    });
    
    const url = `${baseUrl}?${params.toString()}`;
    
    if (inIframe) {
      setDemoUrl(url);
      setShowDemoIframe(true);
    } else {
      window.open(url, '_blank', 'width=900,height=700,resizable=yes');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('department_chat_messages')
        .select(`
          id,
          chat_id,
          user_id,
          role_id,
          message_role,
          content,
          source,
          metadata,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (filterSource) {
        query = query.eq('source', filterSource);
      }

      const { data: messages, error } = await query;
      if (error) throw error;

      // Cast messages properly
      const typedMessages: DepartmentMessage[] = (messages || []).map(m => ({
        ...m,
        message_role: m.message_role as 'user' | 'assistant',
        metadata: m.metadata as any
      }));

      setAllMessages(typedMessages);

      // Group by bitrix_user_id for sessions
      const sessionsMap = new Map<string, BitrixSession>();
      
      for (const msg of typedMessages) {
        const meta = msg.metadata as { bitrix_user_id?: string; user_name?: string } | null;
        const bitrixUserId = meta?.bitrix_user_id;
        if (!bitrixUserId) continue;

        const key = `${bitrixUserId}_${msg.chat_id}`;
        const existing = sessionsMap.get(key);

        if (existing) {
          existing.message_count++;
          if (new Date(msg.created_at) > new Date(existing.last_message_at)) {
            existing.last_message_at = msg.created_at;
          }
          if (new Date(msg.created_at) < new Date(existing.first_message_at)) {
            existing.first_message_at = msg.created_at;
          }
        } else {
          // Get department info
          const { data: chatData } = await supabase
            .from('department_chats')
            .select('department_id, departments(name)')
            .eq('id', msg.chat_id)
            .single();

          const deptName = (chatData as any)?.departments?.name || 'Неизвестный';
          const deptId = chatData?.department_id || '';

          if (filterDepartment && deptId !== filterDepartment) continue;

          sessionsMap.set(key, {
            bitrix_user_id: bitrixUserId,
            user_name: meta?.user_name || null,
            department_id: deptId,
            department_name: deptName,
            message_count: 1,
            last_message_at: msg.created_at,
            first_message_at: msg.created_at,
          });
        }
      }

      setSessions(Array.from(sessionsMap.values()).sort((a, b) => 
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      ));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewSession = async (session: BitrixSession) => {
    setSelectedSession(session);

    // Fetch messages for this session
    const { data } = await supabase
      .from('department_chat_messages')
      .select('*')
      .order('created_at', { ascending: true });

    const sessionMsgs = (data || []).filter(m => {
      const meta = m.metadata as { bitrix_user_id?: string } | null;
      return meta?.bitrix_user_id === session.bitrix_user_id;
    }).map(m => ({
      ...m,
      message_role: m.message_role as 'user' | 'assistant',
      metadata: m.metadata as any
    }));

    setSessionMessages(sessionMsgs);
    setDialogOpen(true);
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'bitrix':
        return <Badge variant="default" className="bg-blue-500"><Smartphone className="h-3 w-3 mr-1" />Битрикс24</Badge>;
      case 'web':
        return <Badge variant="secondary"><Globe className="h-3 w-3 mr-1" />Web</Badge>;
      case 'api':
        return <Badge variant="outline">API</Badge>;
      default:
        return <Badge variant="outline">{source}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Битрикс-сессии</h1>
        <p className="text-muted-foreground">
          История чатов из внешних интеграций (Битрикс24 и API)
        </p>
      </div>

      {/* Demo Mode Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PlayCircle className="h-5 w-5 text-primary" />
            Демо-режим тестирования
          </CardTitle>
          <CardDescription>
            Откройте чат как тестовый пользователь Bitrix24
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Portal/Department selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Портал / Отдел</label>
              <Select value={demoPortal} onValueChange={setDemoPortal}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите портал" />
                </SelectTrigger>
                <SelectContent>
                  {apiKeys.map(k => (
                    <SelectItem key={k.id} value={k.portal_domain}>
                      {k.department_name} ({k.portal_domain})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Chat type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Тип чата</label>
              <Select value={demoChatType} onValueChange={(v) => setDemoChatType(v as 'personal' | 'department')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Личный чат</SelectItem>
                  <SelectItem value="department">Общий чат</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* User ID */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Bitrix User ID</label>
              <Input 
                value={demoUserId} 
                onChange={(e) => setDemoUserId(e.target.value)}
                placeholder="demo-123"
              />
            </div>
            
            {/* User Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Имя пользователя</label>
              <Input 
                value={demoUserName} 
                onChange={(e) => setDemoUserName(e.target.value)}
                placeholder="Тест Тестов"
              />
            </div>

            {/* User Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input 
                value={demoUserEmail} 
                onChange={(e) => setDemoUserEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </div>
            
            {/* Buttons */}
            <div className="space-y-2">
              <label className="text-sm font-medium">&nbsp;</label>
              <div className="flex gap-2">
                <Button onClick={() => openDemo(false)} disabled={!demoPortal} size="sm">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Окно
                </Button>
                <Button variant="outline" onClick={() => openDemo(true)} disabled={!demoPortal} size="sm">
                  <Monitor className="h-4 w-4 mr-1" />
                  Здесь
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Сессии чатов</CardTitle>
              <CardDescription>
                Всего сессий: {sessions.length}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select
                value={filterSource || '_all'}
                onValueChange={(v) => setFilterSource(v === '_all' ? '' : v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Все источники" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Все источники</SelectItem>
                  <SelectItem value="bitrix">Битрикс24</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterDepartment || '_all'}
                onValueChange={(v) => setFilterDepartment(v === '_all' ? '' : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Все отделы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Все отделы</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Нет сессий для отображения
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bitrix User ID</TableHead>
                  <TableHead>Имя</TableHead>
                  <TableHead>Отдел</TableHead>
                  <TableHead>Сообщений</TableHead>
                  <TableHead>Первое сообщение</TableHead>
                  <TableHead>Последнее сообщение</TableHead>
                  <TableHead className="w-16">Детали</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session, idx) => (
                  <TableRow key={`${session.bitrix_user_id}_${idx}`}>
                    <TableCell className="font-mono text-sm">
                      {session.bitrix_user_id}
                    </TableCell>
                    <TableCell>
                      {session.user_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{session.department_name}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{session.message_count}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(session.first_message_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(session.last_message_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewSession(session)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Переписка с {selectedSession?.user_name || `Bitrix User ${selectedSession?.bitrix_user_id}`}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4">
              {sessionMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.message_role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.message_role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.message_role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs opacity-70">
                      <span>{format(new Date(msg.created_at), 'HH:mm', { locale: ru })}</span>
                      {msg.metadata?.agent_name && (
                        <Badge variant="outline" className="text-[10px] py-0">
                          {msg.metadata.agent_name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {msg.message_role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Demo Iframe Dialog */}
      <Dialog open={showDemoIframe} onOpenChange={setShowDemoIframe}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Демо: {demoChatType === 'personal' ? 'Личный чат' : 'Общий чат'} — {demoUserName}
            </DialogTitle>
          </DialogHeader>
          <iframe
            src={demoUrl}
            className="w-full flex-1 border-0"
            style={{ height: 'calc(85vh - 60px)' }}
            title="Demo Chat"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BitrixSessions;
