import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Copy, Trash2, Key, RefreshCw, Eye, EyeOff, ShieldAlert, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ApiKey {
  id: string;
  department_id: string;
  api_key: string;
  name: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  request_count: number;
  portal_domain: string | null;
}

interface Department {
  id: string;
  name: string;
}

const ApiKeys = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [portalDomain, setPortalDomain] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [serviceKey, setServiceKey] = useState<string | null>(null);
  const [serviceUrl, setServiceUrl] = useState<string | null>(null);
  const [serviceKeyVisible, setServiceKeyVisible] = useState(false);
  const [loadingServiceKey, setLoadingServiceKey] = useState(false);
  const { toast } = useToast();

  const handleFetchServiceKey = async () => {
    setLoadingServiceKey(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-service-key');
      if (error) throw error;
      if (!data?.service_role_key) throw new Error('Ключ не получен');
      setServiceKey(data.service_role_key);
      setServiceUrl(data.url);
      toast({ title: 'Получено', description: 'Ключ загружен. Скопируйте и закройте окно.' });
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: e?.message || 'Не удалось получить ключ. Доступно только админам.',
        variant: 'destructive',
      });
    } finally {
      setLoadingServiceKey(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [keysRes, depsRes] = await Promise.all([
        supabase.from('department_api_keys').select('*').order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name').order('name')
      ]);

      if (keysRes.data) setApiKeys(keysRes.data);
      if (depsRes.data) setDepartments(depsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract clean domain from URL
  const extractDomain = (input: string): string => {
    if (!input) return '';
    let domain = input.trim();
    // Remove protocol
    domain = domain.replace(/^https?:\/\//, '');
    // Remove path, query, fragment
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    return domain.toLowerCase();
  };

  // Validate domain format
  const isValidDomain = (domain: string): boolean => {
    if (!domain) return true; // Optional field
    // Simple domain validation: letters, numbers, dots, hyphens
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
    return domainRegex.test(domain);
  };

  const handleCreateKey = async () => {
    if (!selectedDepartment || !newKeyName.trim()) {
      toast({ title: 'Ошибка', description: 'Заполните все поля', variant: 'destructive' });
      return;
    }

    // Clean and validate portal domain
    const cleanDomain = extractDomain(portalDomain);
    if (cleanDomain && !isValidDomain(cleanDomain)) {
      toast({ 
        title: 'Неверный формат домена', 
        description: 'Укажите только домен, например: company.bitrix24.ru', 
        variant: 'destructive' 
      });
      return;
    }

    const { data, error } = await supabase
      .from('department_api_keys')
      .insert({
        department_id: selectedDepartment,
        name: newKeyName.trim(),
        portal_domain: cleanDomain || null
      })
      .select()
      .single();

    if (error) {
      let errorMessage = error.message;
      if (error.code === '23505' || error.message.includes('idx_department_api_keys_portal_domain')) {
        errorMessage = `Домен "${cleanDomain}" уже используется другим API-ключом. Каждый портал может иметь только один ключ.`;
      }
      toast({ title: 'Ошибка', description: errorMessage, variant: 'destructive' });
      return;
    }

    setCreatedKey(data.api_key);
    setApiKeys(prev => [data, ...prev]);
    toast({ title: 'Успешно', description: 'API-ключ создан' });
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setCreatedKey(null);
    setNewKeyName('');
    setSelectedDepartment('');
    setPortalDomain('');
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    const { error } = await supabase
      .from('department_api_keys')
      .update({ is_active: !currentState })
      .eq('id', id);

    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }

    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !currentState } : k));
    toast({ title: 'Успешно', description: currentState ? 'Ключ деактивирован' : 'Ключ активирован' });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('department_api_keys')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }

    setApiKeys(prev => prev.filter(k => k.id !== id));
    toast({ title: 'Успешно', description: 'Ключ удалён' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Скопировано', description: 'API-ключ скопирован в буфер обмена' });
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const maskKey = (key: string) => {
    return key.substring(0, 8) + '••••••••••••••••' + key.substring(key.length - 4);
  };

  const getDepartmentName = (id: string) => {
    return departments.find(d => d.id === id)?.name || 'Неизвестный отдел';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API-ключи</h1>
          <p className="text-muted-foreground">
            Управление ключами для интеграции с внешними системами (Битрикс24 и др.)
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать ключ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdKey ? 'Ключ создан!' : 'Новый API-ключ'}</DialogTitle>
              <DialogDescription>
                {createdKey 
                  ? 'Сохраните ключ — он больше не будет показан полностью.'
                  : 'Создайте API-ключ для интеграции с внешней системой.'}
              </DialogDescription>
            </DialogHeader>
            
            {createdKey ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg font-mono text-sm break-all">
                  {createdKey}
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => copyToClipboard(createdKey)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Скопировать
                </Button>
                <p className="text-xs text-muted-foreground">
                  Этот ключ можно использовать для прямых API-вызовов. 
                  Для интеграции с Bitrix24 через iframe используйте portal_domain.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="keyName">Название</Label>
                  <Input
                    id="keyName"
                    placeholder="Например: Битрикс24 Production"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Отдел</Label>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите отдел" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dep) => (
                        <SelectItem key={dep.id} value={dep.id}>
                          {dep.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portalDomain">Домен Bitrix24 портала (опционально)</Label>
                  <Input
                    id="portalDomain"
                    placeholder="company.bitrix24.ru"
                    value={portalDomain}
                    onChange={(e) => setPortalDomain(e.target.value)}
                    onBlur={(e) => {
                      // Auto-clean to pure domain on blur
                      const cleaned = extractDomain(e.target.value);
                      if (cleaned !== e.target.value) {
                        setPortalDomain(cleaned);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    <strong>Только домен</strong> (без https:// и пути), например: <code className="bg-muted px-1 rounded">bitrix.company.ru</code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bitrix24 передаёт только доменную часть при авторизации. 
                    API-ключ НЕ будет передаваться в браузер.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              {createdKey ? (
                <Button onClick={handleCloseCreate}>Закрыть</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleCloseCreate}>Отмена</Button>
                  <Button onClick={handleCreateKey}>Создать</Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Активные ключи
          </CardTitle>
          <CardDescription>
            Каждый ключ привязан к отделу и используется для аутентификации API-запросов
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Нет созданных API-ключей
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Отдел</TableHead>
                  <TableHead>Портал Bitrix24</TableHead>
                  <TableHead>API-ключ</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Запросов</TableHead>
                  <TableHead>Последнее использование</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>{getDepartmentName(key.department_id)}</TableCell>
                    <TableCell>
                      {key.portal_domain ? (
                        <code className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-2 py-1 rounded">
                          {key.portal_domain}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {visibleKeys.has(key.id) ? key.api_key : maskKey(key.api_key)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleKeyVisibility(key.id)}
                        >
                          {visibleKeys.has(key.id) ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(key.api_key)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={key.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => handleToggleActive(key.id, key.is_active)}
                      >
                        {key.is_active ? 'Активен' : 'Неактивен'}
                      </Badge>
                    </TableCell>
                    <TableCell>{key.request_count || 0}</TableCell>
                    <TableCell>
                      {key.last_used_at 
                        ? format(new Date(key.last_used_at), 'dd MMM yyyy, HH:mm', { locale: ru })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить ключ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Все интеграции, использующие этот ключ, перестанут работать.
                              Это действие нельзя отменить.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(key.id)}>
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Документация по интеграции</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Базовый URL</h4>
            <code className="block bg-muted p-3 rounded text-sm">
              https://eidesurdreoxroarympm.supabase.co/functions/v1/bitrix-chat-api
            </code>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Заголовки запроса</h4>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`Authorization: Bearer YOUR_API_KEY
X-Bitrix-User-Id: 123
X-Bitrix-User-Name: Иван Петров (опционально)
X-Bitrix-User-Email: ivan@company.com (опционально)
Content-Type: application/json`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">Доступные эндпоинты</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li><code>POST /send-message</code> — отправить сообщение и получить ответ (SSE stream)</li>
              <li><code>GET /messages</code> — получить историю сообщений</li>
              <li><code>GET /agents</code> — список доступных агентов (@юрист, @hr и т.д.)</li>
              <li><code>POST /sync-user</code> — синхронизировать данные пользователя</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-2">Пример отправки сообщения</h4>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`POST /send-message
{
  "message": "@юрист Какие документы нужны для отпуска?",
  "attachments": [
    {
      "file_name": "doc.pdf",
      "file_base64": "JVBERi0xLj...",
      "file_type": "application/pdf"
    }
  ]
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiKeys;
