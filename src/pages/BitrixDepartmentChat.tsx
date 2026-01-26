import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2,
  Users,
  Send,
  Paperclip,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface BitrixUser {
  user_id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'moderator' | 'employee';
  department_id: string;
  department_name: string;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  mention: string | null;
  description: string | null;
}

interface DepartmentMessage {
  id: string;
  message_role: 'user' | 'assistant';
  content: string;
  metadata: {
    user_name?: string;
    agent_name?: string;
    bitrix_user_id?: string;
    citations?: Array<{
      index: number;
      document: string;
      section?: string;
      relevance: number;
    }>;
    response_time_ms?: number;
    attachments?: Array<{
      file_name: string;
      file_type: string;
      file_size: number;
    }>;
  } | null;
  created_at: string;
  role_id: string | null;
}

interface StreamingMessage {
  id: string;
  content: string;
  isStreaming: boolean;
}

export default function BitrixDepartmentChat() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<BitrixUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<DepartmentMessage[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionPopupRef = useRef<HTMLDivElement>(null);

  const apiBaseUrl = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/bitrix-chat-api';

  // Get params from URL
  const portal = searchParams.get('portal') || '';
  const bitrixUserId = searchParams.get('bitrixUserId') || '';
  const userName = searchParams.get('userName') || '';
  const userEmail = searchParams.get('userEmail') || '';
  const theme = searchParams.get('theme') || 'light';

  // Apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Authenticate on mount
  useEffect(() => {
    const authenticate = async () => {
      if (!portal || !bitrixUserId) {
        setAuthError('Отсутствуют параметры авторизации');
        setIsAuthenticating(false);
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portal,
            bitrix_user_id: bitrixUserId,
            bitrix_user_name: userName,
            bitrix_user_email: userEmail,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Ошибка авторизации');
        }

        const data = await response.json();
        setToken(data.token);
        setUser(data.user);
      } catch (error) {
        console.error('Auth error:', error);
        setAuthError(error instanceof Error ? error.message : 'Ошибка авторизации');
      } finally {
        setIsAuthenticating(false);
      }
    };

    authenticate();
  }, [portal, bitrixUserId, userName, userEmail, apiBaseUrl]);

  // Fetch agents and messages after auth
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        // Fetch agents
        const agentsResponse = await fetch(`${apiBaseUrl}/department/agents`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (agentsResponse.ok) {
          const agentsData = await agentsResponse.json();
          setAgents(agentsData.agents || []);
        }

        // Fetch messages
        const messagesResponse = await fetch(`${apiBaseUrl}/department/messages?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          setMessages(messagesData.messages || []);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };

    fetchData();
  }, [token, apiBaseUrl]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  // Handle input change for @mention detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Check for @mention
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const afterAt = value.substring(lastAtIndex + 1);
      const spaceIndex = afterAt.indexOf(' ');
      if (spaceIndex === -1 && afterAt.length < 20) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentionPopup(true);
        return;
      }
    }
    setShowMentionPopup(false);
  };

  // Filter agents for mention popup
  const filteredAgents = agents.filter(agent => 
    agent.mention && (
      agent.name.toLowerCase().includes(mentionFilter) ||
      agent.mention.toLowerCase().includes(mentionFilter)
    )
  );

  // Handle agent selection from popup
  const handleSelectAgent = (agent: Agent) => {
    if (!agent.mention) return;

    const lastAtIndex = inputValue.lastIndexOf('@');
    const newValue = inputValue.substring(0, lastAtIndex) + agent.mention + ' ';
    setInputValue(newValue);
    setShowMentionPopup(false);
    textareaRef.current?.focus();
  };

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!token || !inputValue.trim() || isLoading) return;

    const userMessage: DepartmentMessage = {
      id: crypto.randomUUID(),
      message_role: 'user',
      content: inputValue,
      metadata: {
        user_name: user?.full_name,
        bitrix_user_id: bitrixUserId,
      },
      created_at: new Date().toISOString(),
      role_id: null,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setShowMentionPopup(false);

    // Create streaming message placeholder
    const streamingId = crypto.randomUUID();
    setStreamingMessage({
      id: streamingId,
      content: '',
      isStreaming: true,
    });

    try {
      const response = await fetch(`${apiBaseUrl}/department/send-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let metadata: any = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              // Add completed message
              const assistantMessage: DepartmentMessage = {
                id: streamingId,
                message_role: 'assistant',
                content: fullContent,
                metadata: metadata,
                created_at: new Date().toISOString(),
                role_id: null,
              };
              setMessages(prev => [...prev, assistantMessage]);
              setStreamingMessage(null);
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setStreamingMessage(prev => prev ? {
                    ...prev,
                    content: fullContent,
                  } : null);
                }
                if (parsed.citations) metadata.citations = parsed.citations;
                if (parsed.response_time_ms) metadata.response_time_ms = parsed.response_time_ms;
                if (parsed.agent_name) metadata.agent_name = parsed.agent_name;
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      console.error('Send message error:', error);
      setStreamingMessage(null);
      toast({
        title: "Ошибка",
        description: "Не удалось отправить сообщение",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, inputValue, isLoading, user?.full_name, bitrixUserId, apiBaseUrl, toast]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setShowMentionPopup(false);
    }
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (isAuthenticating) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center p-6">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Ошибка авторизации</h2>
          <p className="text-muted-foreground">{authError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="font-medium">Чат отдела</span>
            {user?.department_name && (
              <span className="text-sm text-muted-foreground ml-2">
                — {user.department_name}
              </span>
            )}
          </div>

          {/* Available Agents */}
          {agents.length > 0 && (
            <div className="hidden md:flex items-center gap-1 ml-4">
              <span className="text-xs text-muted-foreground mr-1">Агенты:</span>
              {agents.slice(0, 3).map((agent) => (
                <Badge 
                  key={agent.id} 
                  variant="secondary" 
                  className="text-xs px-2 py-0.5 cursor-pointer hover:bg-secondary/80"
                  onClick={() => {
                    if (agent.mention) {
                      setInputValue(prev => prev + agent.mention + ' ');
                      textareaRef.current?.focus();
                    }
                  }}
                >
                  {agent.mention}
                </Badge>
              ))}
              {agents.length > 3 && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  +{agents.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto py-6 px-4">
          {messages.length === 0 && !streamingMessage ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Групповой чат {user?.department_name ? `— ${user.department_name}` : ""}
              </h2>
              <p className="text-muted-foreground max-w-md mb-4">
                Напишите сообщение или упомяните агента через @
              </p>
              {agents.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {agents.map((agent) => (
                    <Badge key={agent.id} variant="outline">
                      {agent.mention} — {agent.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble 
                  key={message.id} 
                  message={message}
                  getInitials={getInitials}
                />
              ))}
              {streamingMessage && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0 bg-primary/10">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      AI
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">Ассистент</span>
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streamingMessage.content || '...'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto relative">
          {/* Mention Popup */}
          {showMentionPopup && filteredAgents.length > 0 && (
            <div 
              ref={mentionPopupRef}
              className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-lg shadow-lg py-1 z-50"
            >
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                  onClick={() => handleSelectAgent(agent)}
                >
                  <div className="font-medium text-sm">{agent.mention}</div>
                  <div className="text-xs text-muted-foreground">{agent.name}</div>
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Напишите сообщение или упомяните @агента..."
              className="min-h-[60px] max-h-[200px] resize-none pr-20"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
              className="absolute bottom-2 right-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Message Bubble Component
function MessageBubble({ 
  message, 
  getInitials 
}: { 
  message: DepartmentMessage;
  getInitials: (name: string) => string;
}) {
  const isUser = message.message_role === 'user';
  const displayName = isUser 
    ? message.metadata?.user_name || 'Пользователь'
    : message.metadata?.agent_name || 'Ассистент';

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <Avatar className={cn("h-8 w-8 shrink-0", isUser ? "bg-primary" : "bg-primary/10")}>
        <AvatarFallback className={cn(
          "text-xs",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}>
          {isUser ? getInitials(displayName) : 'AI'}
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex-1 min-w-0", isUser && "flex flex-col items-end")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{displayName}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className={cn(
          "rounded-lg p-3 max-w-[85%]",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        
        {/* Citations */}
        {message.metadata?.citations && message.metadata.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.metadata.citations.map((citation, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                [{citation.index}] {citation.document}
              </Badge>
            ))}
          </div>
        )}

        {/* Response time */}
        {message.metadata?.response_time_ms && (
          <div className="mt-1 text-xs text-muted-foreground">
            {(message.metadata.response_time_ms / 1000).toFixed(1)}с
          </div>
        )}
      </div>
    </div>
  );
}
