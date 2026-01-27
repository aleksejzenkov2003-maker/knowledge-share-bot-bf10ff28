import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Loader2,
  Users,
  Send,
  Search,
  Square,
  Bot,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { BitrixChatMessage } from "@/components/chat/BitrixChatMessage";
import { format, isToday, isYesterday, subDays, isAfter } from "date-fns";
import type { Message } from "@/types/chat";

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
    rag_context?: string[];
    web_search_citations?: string[];
    web_search_used?: boolean;
  } | null;
  created_at: string;
  role_id: string | null;
}

interface GroupedMessages {
  today: DepartmentMessage[];
  yesterday: DepartmentMessage[];
  lastWeek: DepartmentMessage[];
  older: DepartmentMessage[];
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
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  
  // New: Sidebar and filter state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgentId, setFilterAgentId] = useState<string>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  
  // Streaming and stop state
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef<string>("");

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

  // Authenticate on mount with timeout
  useEffect(() => {
    const AUTH_TIMEOUT_MS = 30000;
    
    const authenticate = async () => {
      if (!portal || !bitrixUserId) {
        setAuthError('Отсутствуют параметры авторизации. Проверьте настройки приложения в Bitrix24.');
        setIsAuthenticating(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, AUTH_TIMEOUT_MS);

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
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          const errorMessage = error.details || error.error || 'Ошибка авторизации';
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setToken(data.token);
        setUser(data.user);
      } catch (error) {
        console.error('Auth error:', error);
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            setAuthError('Превышено время ожидания авторизации.');
          } else if (error.message.includes('Portal not registered')) {
            setAuthError(`Портал "${portal}" не зарегистрирован.`);
          } else {
            setAuthError(error.message);
          }
        } else {
          setAuthError('Неизвестная ошибка авторизации');
        }
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
        const agentsResponse = await fetch(`${apiBaseUrl}/department/agents`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (agentsResponse.ok) {
          const agentsData = await agentsResponse.json();
          setAgents(agentsData.agents || []);
        }

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

  // Handle agent selection from popup or dropdown
  const handleSelectAgent = (agent: Agent) => {
    if (!agent.mention) return;

    const lastAtIndex = inputValue.lastIndexOf('@');
    const newValue = lastAtIndex >= 0 
      ? inputValue.substring(0, lastAtIndex) + agent.mention + ' '
      : agent.mention + ' ';
    setInputValue(newValue);
    setShowMentionPopup(false);
    setSelectedAgentId(agent.id);
    textareaRef.current?.focus();
  };

  // Insert agent mention from dropdown
  const handleInsertAgentMention = (agent: Agent) => {
    if (!agent.mention) return;
    setInputValue(prev => prev + agent.mention + ' ');
    setSelectedAgentId(agent.id);
    textareaRef.current?.focus();
  };

  // Stop generation
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
      if (streamingContentRef.current && streamingMessage) {
        const finalMessage: DepartmentMessage = {
          id: streamingMessage.id,
          message_role: 'assistant',
          content: streamingContentRef.current + '\n\n[Генерация остановлена]',
          metadata: null,
          created_at: new Date().toISOString(),
          role_id: null,
        };
        setMessages(prev => [...prev, finalMessage]);
        setStreamingMessage(null);
      }
      setIsLoading(false);
    }
  }, [streamingMessage]);

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
    streamingContentRef.current = "";

    // Create streaming message
    const streamingId = crypto.randomUUID();
    setStreamingMessage({
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    });

    abortControllerRef.current = new AbortController();

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
        signal: abortControllerRef.current.signal,
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
                  streamingContentRef.current = fullContent;
                  setStreamingMessage(prev => prev ? {
                    ...prev,
                    content: fullContent,
                  } : null);
                }
                if (parsed.citations) metadata.citations = parsed.citations;
                if (parsed.response_time_ms) metadata.response_time_ms = parsed.response_time_ms;
                if (parsed.agent_name) metadata.agent_name = parsed.agent_name;
                if (parsed.rag_context) metadata.rag_context = parsed.rag_context;
                if (parsed.web_search_citations) metadata.web_search_citations = parsed.web_search_citations;
                if (parsed.web_search_used) metadata.web_search_used = parsed.web_search_used;
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Send message error:', error);
        setStreamingMessage(null);
        toast({
          title: "Ошибка",
          description: "Не удалось отправить сообщение",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
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

  // Delete message
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/department/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete');

      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === messageId);
        if (idx === -1) return prev;
        
        if (prev[idx].message_role === 'user' && prev[idx + 1]?.message_role === 'assistant') {
          return [...prev.slice(0, idx), ...prev.slice(idx + 2)];
        }
        return prev.filter(m => m.id !== messageId);
      });
      
      toast({
        title: "Сообщение удалено",
      });
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить сообщение",
        variant: "destructive",
      });
    }
  }, [token, apiBaseUrl, toast]);

  // Regenerate assistant response
  const handleRegenerate = useCallback(async (messageId: string, newRoleId?: string) => {
    if (!token) return;

    setIsLoading(true);
    streamingContentRef.current = "";
    abortControllerRef.current = new AbortController();

    // Remove old message from UI
    setMessages(prev => prev.filter(m => m.id !== messageId));

    // Create new streaming message
    const streamingId = crypto.randomUUID();
    setStreamingMessage({
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    });

    try {
      const response = await fetch(`${apiBaseUrl}/department/regenerate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message_id: messageId, 
          role_id: newRoleId 
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to regenerate');
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
              const assistantMessage: DepartmentMessage = {
                id: streamingId,
                message_role: 'assistant',
                content: fullContent,
                metadata: metadata,
                created_at: new Date().toISOString(),
                role_id: newRoleId || null,
              };
              setMessages(prev => [...prev, assistantMessage]);
              setStreamingMessage(null);
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  streamingContentRef.current = fullContent;
                  setStreamingMessage(prev => prev ? {
                    ...prev,
                    content: fullContent,
                  } : null);
                }
                if (parsed.citations) metadata.citations = parsed.citations;
                if (parsed.response_time_ms) metadata.response_time_ms = parsed.response_time_ms;
                if (parsed.agent_name) metadata.agent_name = parsed.agent_name;
                if (parsed.rag_context) metadata.rag_context = parsed.rag_context;
                if (parsed.web_search_citations) metadata.web_search_citations = parsed.web_search_citations;
                if (parsed.web_search_used) metadata.web_search_used = parsed.web_search_used;
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Regenerate aborted');
      } else {
        console.error('Regenerate error:', error);
        setStreamingMessage(null);
        toast({
          title: "Ошибка",
          description: "Не удалось перегенерировать ответ",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [token, apiBaseUrl, toast]);

  // Convert department message to Message format for BitrixChatMessage
  const convertToMessage = (msg: DepartmentMessage): Message => ({
    id: msg.id,
    role: msg.message_role,
    content: msg.content,
    timestamp: new Date(msg.created_at),
    responseTime: msg.metadata?.response_time_ms,
    ragContext: msg.metadata?.rag_context,
    citations: msg.metadata?.citations,
    webSearchCitations: msg.metadata?.web_search_citations,
    webSearchUsed: msg.metadata?.web_search_used,
  });

  // Group messages by date for sidebar
  const groupedMessages = useMemo((): GroupedMessages => {
    const sevenDaysAgo = subDays(new Date(), 7);
    
    let filtered = messages.filter(m => m.message_role === 'user');
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.content.toLowerCase().includes(query) ||
        m.metadata?.user_name?.toLowerCase().includes(query)
      );
    }
    
    if (filterAgentId !== "all") {
      const agent = agents.find(a => a.id === filterAgentId);
      if (agent?.mention) {
        filtered = filtered.filter(m => m.content.includes(agent.mention!));
      }
    }
    
    return {
      today: filtered.filter(m => isToday(new Date(m.created_at))),
      yesterday: filtered.filter(m => isYesterday(new Date(m.created_at))),
      lastWeek: filtered.filter(m => {
        const date = new Date(m.created_at);
        return !isToday(date) && !isYesterday(date) && isAfter(date, sevenDaysAgo);
      }),
      older: filtered.filter(m => !isAfter(new Date(m.created_at), sevenDaysAgo)),
    };
  }, [messages, searchQuery, filterAgentId, agents]);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Render message preview for sidebar
  const renderMessagePreview = (msg: DepartmentMessage) => {
    const mentionMatch = msg.content.match(/@\w+/);
    const preview = msg.content.slice(0, 50).replace(/@\w+\s*/, '');
    
    return (
      <div
        key={msg.id}
        className="px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 cursor-pointer transition-colors"
        onClick={() => {
          // Scroll to message in main area
          const element = document.getElementById(`msg-${msg.id}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          {mentionMatch && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {mentionMatch[0]}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {format(new Date(msg.created_at), 'HH:mm')}
          </span>
        </div>
        <p className="text-sm truncate text-muted-foreground">
          {preview || msg.content.slice(0, 50)}...
        </p>
      </div>
    );
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
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar with history */}
      <div 
        className={cn(
          "h-full border-r border-border transition-all duration-300 flex-shrink-0 flex flex-col",
          sidebarOpen ? "w-72" : "w-0"
        )}
      >
        {sidebarOpen && (
          <>
            {/* Sidebar Header */}
            <div className="p-3 border-b border-border space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">История чата</span>
              </div>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск сообщений..."
                  className="pl-8 h-8 text-sm"
                />
              </div>
              
              {/* Agent filter */}
              {agents.length > 0 && (
                <Select
                  value={filterAgentId}
                  onValueChange={setFilterAgentId}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Все агенты" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все агенты</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.mention} — {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Messages history */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-3">
                {groupedMessages.today.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground px-2 mb-1">Сегодня</div>
                    {groupedMessages.today.map(renderMessagePreview)}
                  </div>
                )}
                {groupedMessages.yesterday.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground px-2 mb-1">Вчера</div>
                    {groupedMessages.yesterday.map(renderMessagePreview)}
                  </div>
                )}
                {groupedMessages.lastWeek.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground px-2 mb-1">Последние 7 дней</div>
                    {groupedMessages.lastWeek.map(renderMessagePreview)}
                  </div>
                )}
                {groupedMessages.older.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground px-2 mb-1">Ранее</div>
                    {groupedMessages.older.map(renderMessagePreview)}
                  </div>
                )}
                {messages.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Нет сообщений
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* User Info */}
            {user && (
              <div className="p-3 border-t border-border">
                <div className="text-xs text-muted-foreground truncate">
                  {user.full_name}
                </div>
                <div className="text-xs text-muted-foreground truncate opacity-70">
                  {user.department_name}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            
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
          </div>

          {/* Available Agents */}
          {agents.length > 0 && (
            <div className="hidden md:flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Агенты:</span>
              {agents.slice(0, 3).map((agent) => (
                <Badge 
                  key={agent.id} 
                  variant="secondary" 
                  className="text-xs px-2 py-0.5 cursor-pointer hover:bg-secondary/80"
                  onClick={() => handleInsertAgentMention(agent)}
                >
                  {agent.mention}
                </Badge>
              ))}
              {agents.length > 3 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Badge variant="outline" className="text-xs px-2 py-0.5 cursor-pointer">
                      +{agents.length - 3}
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    {agents.slice(3).map((agent) => (
                      <DropdownMenuItem
                        key={agent.id}
                        onClick={() => handleInsertAgentMention(agent)}
                      >
                        {agent.mention} — {agent.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
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
                      <Badge 
                        key={agent.id} 
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => handleInsertAgentMention(agent)}
                      >
                        {agent.mention} — {agent.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} id={`msg-${message.id}`}>
                    <BitrixChatMessage
                      message={convertToMessage(message)}
                      onDeleteMessage={handleDeleteMessage}
                      onRegenerateResponse={handleRegenerate}
                      availableRoles={agents.map(a => ({
                        id: a.id,
                        name: a.name,
                        slug: a.slug,
                        description: a.description,
                      }))}
                    />
                  </div>
                ))}
                {streamingMessage && (
                  <BitrixChatMessage
                    message={streamingMessage}
                    onStopGeneration={handleStopGeneration}
                  />
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

            {/* Agent selector dropdown */}
            <div className="flex items-center gap-2 mb-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Bot className="h-4 w-4" />
                    {selectedAgentId ? agents.find(a => a.id === selectedAgentId)?.mention : "Выбрать агента"}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 bg-popover">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Выберите агента для @упоминания
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {agents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.id}
                      onClick={() => handleInsertAgentMention(agent)}
                      className="cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{agent.mention}</span>
                        <span className="text-xs text-muted-foreground">{agent.name}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Напишите сообщение или упомяните @агента..."
                className="min-h-[60px] max-h-[200px] resize-none pr-24"
                disabled={isLoading}
              />
              <div className="absolute bottom-2 right-2 flex gap-1">
                {isLoading ? (
                  <Button
                    onClick={handleStopGeneration}
                    size="sm"
                    variant="outline"
                    className="gap-1"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    Стоп
                  </Button>
                ) : (
                  <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                    size="icon"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
