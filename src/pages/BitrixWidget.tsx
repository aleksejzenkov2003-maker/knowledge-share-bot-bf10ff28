import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, X, Bot, User, Loader2, StopCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

interface Agent {
  id: string;
  name: string;
  slug: string;
  mention: string | null;
  description: string | null;
}

interface Message {
  id: string;
  message_role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  created_at: string;
}

interface Attachment {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'ready';
}

const BitrixWidget = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Get params from URL
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('apiKey') || '';
  const bitrixUserId = params.get('bitrixUserId') || '';
  const userName = params.get('userName') || '';

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bitrix-chat-api`;

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-Bitrix-User-Id': bitrixUserId,
    'X-Bitrix-User-Name': userName,
    'Content-Type': 'application/json'
  };

  useEffect(() => {
    if (!apiKey || !bitrixUserId) {
      toast({
        title: 'Ошибка конфигурации',
        description: 'Отсутствуют обязательные параметры (apiKey, bitrixUserId)',
        variant: 'destructive'
      });
      return;
    }
    
    loadInitialData();
  }, [apiKey, bitrixUserId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [messagesRes, agentsRes] = await Promise.all([
        fetch(`${baseUrl}/messages?limit=50`, { headers }),
        fetch(`${baseUrl}/agents`, { headers })
      ]);

      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.messages || []);
      }

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;

    const message = input.trim();
    setInput('');
    setIsGenerating(true);
    setStreamingContent('');

    // Add user message to UI immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      message_role: 'user',
      content: message,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Prepare attachments
    const attachmentData = await Promise.all(
      attachments.map(async (att) => {
        const base64 = await fileToBase64(att.file);
        return {
          file_name: att.file.name,
          file_base64: base64,
          file_type: att.file.type
        };
      })
    );
    setAttachments([]);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(`${baseUrl}/send-message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          attachments: attachmentData.length > 0 ? attachmentData : undefined
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              // Add assistant message
              const assistantMessage: Message = {
                id: crypto.randomUUID(),
                message_role: 'assistant',
                content: fullContent,
                created_at: new Date().toISOString()
              };
              setMessages(prev => [...prev, assistantMessage]);
              setStreamingContent('');
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setStreamingContent(fullContent);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Send error:', error);
        toast({
          title: 'Ошибка',
          description: 'Не удалось отправить сообщение',
          variant: 'destructive'
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '@') {
      setShowAgents(true);
    }
  };

  const insertMention = (mention: string) => {
    setInput(prev => prev + mention + ' ');
    setShowAgents(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'ready' as const
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:...;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  if (!apiKey || !bitrixUserId) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-4">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">Ошибка конфигурации</p>
          <p className="text-sm mt-2">Необходимые параметры: apiKey, bitrixUserId</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium">AI Ассистент</span>
        </div>
        {agents.length > 0 && (
          <div className="flex items-center gap-1">
            {agents.slice(0, 3).map(agent => (
              <Badge 
                key={agent.id} 
                variant="secondary" 
                className="text-xs cursor-pointer"
                onClick={() => insertMention(agent.mention || `@${agent.slug}`)}
              >
                {agent.mention || `@${agent.slug}`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="h-12 w-12 mb-4 opacity-50" />
            <p>Начните диалог с AI-ассистентом</p>
            {agents.length > 0 && (
              <p className="text-sm mt-2">
                Используйте @упоминание для выбора агента
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.message_role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.message_role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.message_role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.message_role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.message_role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Streaming message */}
            {streamingContent && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                  <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-1" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Agent suggestions */}
      {showAgents && agents.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4 bg-popover border rounded-lg shadow-lg p-2 z-10">
          <p className="text-xs text-muted-foreground px-2 mb-1">Выберите агента</p>
          {agents.map(agent => (
            <button
              key={agent.id}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm"
              onClick={() => insertMention(agent.mention || `@${agent.slug}`)}
            >
              <span className="font-medium">{agent.mention || `@${agent.slug}`}</span>
              {agent.description && (
                <span className="text-muted-foreground ml-2">— {agent.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-t">
          {attachments.map(att => (
            <div key={att.id} className="relative bg-muted rounded px-2 py-1 text-xs flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[100px] truncate">{att.file.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t bg-card">
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение... (@ для упоминания агента)"
            className="min-h-[40px] max-h-[120px] resize-none"
            disabled={isGenerating}
            onFocus={() => setShowAgents(false)}
          />
          {isGenerating ? (
            <Button variant="destructive" size="icon" onClick={handleStop}>
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              size="icon" 
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BitrixWidget;
