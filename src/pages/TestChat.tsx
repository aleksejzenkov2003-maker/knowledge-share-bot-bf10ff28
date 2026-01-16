import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, MessageSquare, ExternalLink, Bot, FolderOpen, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ChatRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  folder_ids: string[] | null;
  is_project_mode: boolean;
  system_prompt?: {
    name: string;
    prompt_text: string;
  } | null;
  department?: {
    name: string;
  } | null;
}

interface FolderInfo {
  id: string;
  name: string;
  document_count: number;
  chunk_count: number;
}

interface ChatResponse {
  content: string;
  citations?: string[];
  model: string;
  response_time_ms: number;
  rag_context?: string[];
}

const TestChat = () => {
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [folderInfo, setFolderInfo] = useState<FolderInfo[]>([]);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Загрузка ролей
  useEffect(() => {
    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from('chat_roles')
        .select(`
          id, name, slug, description, folder_ids, is_project_mode,
          system_prompt:system_prompts(name, prompt_text),
          department:departments(name)
        `)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error fetching roles:', error);
        toast({
          title: 'Ошибка',
          description: 'Не удалось загрузить роли',
          variant: 'destructive',
        });
      }

      if (data) {
        // Transform the data to handle the nested objects
        const transformedData = data.map(role => ({
          ...role,
          system_prompt: Array.isArray(role.system_prompt) ? role.system_prompt[0] : role.system_prompt,
          department: Array.isArray(role.department) ? role.department[0] : role.department,
        }));
        setRoles(transformedData);
        if (transformedData.length > 0) {
          setSelectedRoleId(transformedData[0].id);
        }
      }
      setIsLoadingRoles(false);
    };

    fetchRoles();
  }, []);

  // Загрузка информации о папках при выборе роли
  useEffect(() => {
    const fetchFolderInfo = async () => {
      const selectedRole = roles.find(r => r.id === selectedRoleId);
      if (!selectedRole?.folder_ids?.length) {
        setFolderInfo([]);
        return;
      }

      setIsLoadingFolders(true);

      try {
        // Получаем папки
        const { data: folders, error: foldersError } = await supabase
          .from('document_folders')
          .select('id, name')
          .in('id', selectedRole.folder_ids);

        if (foldersError) throw foldersError;

        // Для каждой папки считаем документы и chunks
        const folderStats = await Promise.all(
          (folders || []).map(async (folder) => {
            const { count: docCount } = await supabase
              .from('documents')
              .select('*', { count: 'exact', head: true })
              .eq('folder_id', folder.id);

            const { count: chunkCount } = await supabase
              .from('document_chunks')
              .select('*', { count: 'exact', head: true })
              .eq('document_id', folder.id); // This won't work correctly, need to join

            // Более правильный подсчет chunks через documents
            const { data: docs } = await supabase
              .from('documents')
              .select('id')
              .eq('folder_id', folder.id);

            let totalChunks = 0;
            if (docs && docs.length > 0) {
              const { count } = await supabase
                .from('document_chunks')
                .select('*', { count: 'exact', head: true })
                .in('document_id', docs.map(d => d.id));
              totalChunks = count || 0;
            }

            return {
              id: folder.id,
              name: folder.name,
              document_count: docCount || 0,
              chunk_count: totalChunks,
            };
          })
        );

        setFolderInfo(folderStats);
      } catch (error) {
        console.error('Error fetching folder info:', error);
      } finally {
        setIsLoadingFolders(false);
      }
    };

    if (selectedRoleId) {
      fetchFolderInfo();
    }
  }, [selectedRoleId, roles]);

  const sendMessage = async () => {
    if (!message.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите сообщение',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedRoleId) {
      toast({
        title: 'Ошибка',
        description: 'Выберите роль чата',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          message: message.trim(),
          role_id: selectedRoleId,
        },
      });

      if (error) {
        throw error;
      }

      setResponse(data);
      toast({
        title: 'Успешно',
        description: `Ответ получен за ${data.response_time_ms}ms`,
      });
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось получить ответ',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const totalDocs = folderInfo.reduce((sum, f) => sum + f.document_count, 0);
  const totalChunks = folderInfo.reduce((sum, f) => sum + f.chunk_count, 0);

  if (isLoadingRoles) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Тестирование чата</h1>
        <p className="text-muted-foreground">
          Проверка работы RAG с выбранной ролью и документами
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Запрос
            </CardTitle>
            <CardDescription>
              Выберите роль чата и отправьте сообщение
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">Роль чата</Label>
              {roles.length > 0 ? (
                <Select
                  value={selectedRoleId}
                  onValueChange={setSelectedRoleId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id || `role-${role.slug}`}>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          {role.name}
                          {role.department && (
                            <span className="text-muted-foreground">
                              ({role.department.name})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Нет доступных ролей. Создайте роль в разделе "Роли чатов".
                </div>
              )}
            </div>

            {/* Role Info */}
            {selectedRole && (
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                {selectedRole.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedRole.description}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-2">
                  {selectedRole.is_project_mode && (
                    <Badge variant="secondary">Проектный режим</Badge>
                  )}
                  {selectedRole.system_prompt && (
                    <Badge variant="outline">
                      Промпт: {selectedRole.system_prompt.name}
                    </Badge>
                  )}
                </div>

                <Separator className="my-2" />

                {/* Folders & Documents Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FolderOpen className="h-4 w-4" />
                    RAG источники
                  </div>
                  
                  {isLoadingFolders ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Загрузка...
                    </div>
                  ) : folderInfo.length > 0 ? (
                    <div className="space-y-1">
                      {folderInfo.map((folder) => (
                        <div key={folder.id} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <FolderOpen className="h-3 w-3 text-muted-foreground" />
                            {folder.name}
                          </span>
                          <span className="text-muted-foreground">
                            {folder.document_count} док. / {folder.chunk_count} chunks
                          </span>
                        </div>
                      ))}
                      <div className="pt-1 border-t text-sm font-medium">
                        Всего: {totalDocs} документов, {totalChunks} chunks
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Папки не привязаны - RAG не используется
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                placeholder="Введите ваш вопрос..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    sendMessage();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Ctrl+Enter для отправки
              </p>
            </div>

            <Button
              onClick={sendMessage}
              disabled={isLoading || !message.trim() || !selectedRoleId}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Отправить
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Response Card */}
        <Card>
          <CardHeader>
            <CardTitle>Ответ</CardTitle>
            <CardDescription>
              {response ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{response.model}</Badge>
                  <span>{response.response_time_ms}ms</span>
                  {response.rag_context && response.rag_context.length > 0 && (
                    <Badge variant="secondary">
                      RAG: {response.rag_context.length} chunks
                    </Badge>
                  )}
                </div>
              ) : (
                'Ожидание запроса...'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : response ? (
              <div className="space-y-4">
                <div className="rounded-md bg-muted p-4">
                  <pre className="whitespace-pre-wrap text-sm">
                    {response.content}
                  </pre>
                </div>

                {/* RAG Context */}
                {response.rag_context && response.rag_context.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Контекст из документов ({response.rag_context.length})
                    </Label>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {response.rag_context.map((chunk, index) => (
                        <div
                          key={index}
                          className="rounded border bg-muted/50 p-2 text-xs"
                        >
                          <span className="font-medium text-muted-foreground">
                            Chunk {index + 1}:
                          </span>
                          <p className="mt-1 line-clamp-3">{chunk}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {response.citations && response.citations.length > 0 && (
                  <div className="space-y-2">
                    <Label>Источники ({response.citations.length})</Label>
                    <div className="space-y-1">
                      {response.citations.map((citation, index) => (
                        <a
                          key={index}
                          href={citation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {citation}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Отправьте сообщение для получения ответа
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestChat;
