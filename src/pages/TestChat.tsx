import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, MessageSquare, ExternalLink, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Department {
  id: string;
  name: string;
  slug: string;
}

interface ChatResponse {
  content: string;
  citations: string[];
  model: string;
  response_time_ms: number;
}

const TestChat = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDepts, setIsLoadingDepts] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, slug')
        .order('name');

      if (data) {
        setDepartments(data);
        if (data.length > 0) {
          setSelectedDepartment(data[0].id);
        }
      }
      setIsLoadingDepts(false);
    };

    fetchDepartments();
  }, []);

  const sendMessage = async () => {
    if (!message.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите сообщение',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedDepartment) {
      toast({
        title: 'Ошибка',
        description: 'Выберите пространство (отдел)',
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
          department_id: selectedDepartment,
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

  const selectedDeptName = departments.find(d => d.id === selectedDepartment)?.name || '';

  if (isLoadingDepts) {
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
          Проверка работы Perplexity API по пространствам (отделам)
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
              Выберите пространство и отправьте сообщение
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="department">Пространство (отдел)</Label>
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите отдел" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {dept.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Каждый отдел имеет свой контекст и системный промпт
              </p>
            </div>

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
              disabled={isLoading || !message.trim()}
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
                  Отправить в "{selectedDeptName}"
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
