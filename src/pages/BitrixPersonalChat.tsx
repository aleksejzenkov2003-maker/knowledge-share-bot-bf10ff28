import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  PanelLeftClose, 
  PanelLeft, 
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  Pin,
  PinOff,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { Message } from "@/types/chat";

interface BitrixUser {
  user_id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'moderator' | 'employee';
  department_id: string;
  department_name: string;
  available_roles: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }>;
}

interface Conversation {
  id: string;
  title: string;
  role_id: string | null;
  role?: { id: string; name: string; slug: string };
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export default function BitrixPersonalChat() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<BitrixUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Chat state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

        // Fetch user profile with roles
        const meResponse = await fetch(`${apiBaseUrl}/me`, {
          headers: { 'Authorization': `Bearer ${data.token}` },
        });

        if (meResponse.ok) {
          const meData = await meResponse.json();
          setUser(meData);
          if (meData.available_roles?.length > 0) {
            setSelectedRoleId(meData.available_roles[0].id);
          }
        }
      } catch (error) {
        console.error('Auth error:', error);
        setAuthError(error instanceof Error ? error.message : 'Ошибка авторизации');
      } finally {
        setIsAuthenticating(false);
      }
    };

    authenticate();
  }, [portal, bitrixUserId, userName, userEmail, apiBaseUrl]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!token) return;

    setConversationsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/personal/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  }, [token, apiBaseUrl]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/personal/conversations/${conversationId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          citations: m.metadata?.citations,
          ragContext: m.metadata?.rag_context,
          responseTime: m.metadata?.response_time_ms,
          attachments: m.metadata?.attachments,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  }, [token, apiBaseUrl]);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/personal/conversations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role_id: selectedRoleId || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await fetchConversations();
        setActiveConversationId(data.conversation.id);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать диалог",
        variant: "destructive",
      });
    }
  }, [token, selectedRoleId, apiBaseUrl, fetchConversations, toast]);

  // Handle select conversation
  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  // Handle delete conversation
  const handleDeleteConversation = useCallback(async (id: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/personal/conversations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [token, activeConversationId, apiBaseUrl]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!token || !inputValue.trim() || isLoading) return;

    let conversationId = activeConversationId;

    // Create new conversation if none active
    if (!conversationId) {
      try {
        const response = await fetch(`${apiBaseUrl}/personal/conversations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role_id: selectedRoleId || null }),
        });

        if (!response.ok) throw new Error('Failed to create conversation');
        const data = await response.json();
        conversationId = data.conversation.id;
        setActiveConversationId(conversationId);
        await fetchConversations();
      } catch (error) {
        console.error('Failed to create conversation:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось создать диалог",
          variant: "destructive",
        });
        return;
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Create streaming assistant message
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch(`${apiBaseUrl}/personal/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          role_id: selectedRoleId || null,
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
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { ...m, isStreaming: false, ...metadata }
                  : m
              ));
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMessage.id 
                      ? { ...m, content: fullContent }
                      : m
                  ));
                }
                if (parsed.citations) metadata.citations = parsed.citations;
                if (parsed.response_time_ms) metadata.responseTime = parsed.response_time_ms;
              } catch {}
            }
          }
        }
      }

      // Refresh conversations to update title
      await fetchConversations();
    } catch (error) {
      console.error('Send message error:', error);
      setMessages(prev => prev.filter(m => m.id !== assistantMessage.id));
      toast({
        title: "Ошибка",
        description: "Не удалось отправить сообщение",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, inputValue, isLoading, activeConversationId, selectedRoleId, apiBaseUrl, fetchConversations, toast]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Selected role
  const selectedRole = useMemo(() => 
    user?.available_roles?.find(r => r.id === selectedRoleId),
    [user?.available_roles, selectedRoleId]
  );

  // Active conversation
  const activeConversation = useMemo(() =>
    conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

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
            <MessageSquare className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Ошибка авторизации</h2>
          <p className="text-muted-foreground">{authError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div 
        className={cn(
          "h-full border-r border-border transition-all duration-300 flex-shrink-0 flex flex-col",
          sidebarOpen ? "w-64" : "w-0"
        )}
      >
        {sidebarOpen && (
          <>
            {/* Sidebar Header */}
            <div className="p-3 border-b border-border">
              <Button
                onClick={handleNewChat}
                className="w-full gap-2"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                Новый диалог
              </Button>
            </div>

            {/* Conversations List */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {conversationsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Нет диалогов
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors overflow-hidden",
                        activeConversationId === conv.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/50"
                      )}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {conv.is_pinned && (
                        <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="block truncate text-sm">
                          {conv.title || "Без названия"}
                        </span>
                      </div>
                      <div className="shrink-0 ml-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-50 hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConversation(conv.id);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))
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
          <div className="flex items-center gap-2">
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
            
            {activeConversation && (
              <span className="text-sm font-medium truncate max-w-[200px]">
                {activeConversation.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeConversation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteConversation(activeConversation.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Messages Area */}
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto py-6 px-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  {selectedRole?.name || "AI Ассистент"}
                </h2>
                <p className="text-muted-foreground max-w-md">
                  {selectedRole?.description || "Начните диалог, задав вопрос"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage 
                    key={message.id} 
                    message={message}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Генерация ответа...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 mb-2">
              {user?.available_roles && user.available_roles.length > 1 && (
                <Select
                  value={selectedRoleId}
                  onValueChange={setSelectedRoleId}
                >
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Выберите агента" />
                  </SelectTrigger>
                  <SelectContent>
                    {user.available_roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Напишите сообщение..."
                className="min-h-[60px] max-h-[200px] resize-none pr-20"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                size="sm"
                className="absolute bottom-2 right-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Отправить"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
