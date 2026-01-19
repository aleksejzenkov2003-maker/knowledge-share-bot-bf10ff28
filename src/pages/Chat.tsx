import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Send, 
  Loader2, 
  Bot, 
  User, 
  RotateCcw, 
  Clock, 
  FileText,
  Plus,
  MessageSquare,
  Trash2,
  History,
  PanelLeftClose,
  PanelLeft,
  Pencil
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatRole {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  is_project_mode: boolean;
}

interface Conversation {
  id: string;
  user_id: string;
  role_id: string | null;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  responseTime?: number;
  ragContext?: string[];
  semanticSearch?: boolean;
}

interface DBMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: {
    response_time_ms?: number;
    rag_context?: string[];
    semantic_search?: boolean;
  } | null;
  created_at: string;
}

export default function Chat() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (activeConversationId) {
      loadConversationMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("chat_roles")
        .select("id, name, description, slug, is_active, is_project_mode")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      setRoles(data || []);
      if (data && data.length > 0) {
        setSelectedRoleId(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Ошибка загрузки ролей");
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchConversations = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const loadedMessages: Message[] = (data || []).map((msg: DBMessage) => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: new Date(msg.created_at),
        responseTime: msg.metadata?.response_time_ms,
        ragContext: msg.metadata?.rag_context,
        semanticSearch: msg.metadata?.semantic_search,
      }));

      setMessages(loadedMessages);

      // Set the role from conversation
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation?.role_id) {
        setSelectedRoleId(conversation.role_id);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
      toast.error("Ошибка загрузки сообщений");
    }
  };

  const createNewConversation = async (): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          role_id: selectedRoleId || null,
          title: "Новый диалог",
        })
        .select()
        .single();

      if (error) throw error;
      
      setConversations(prev => [data, ...prev]);
      return data.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error("Ошибка создания диалога");
      return null;
    }
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    
    try {
      await supabase
        .from("conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, title, updated_at: new Date().toISOString() } : c)
      );
    } catch (error) {
      console.error("Error updating conversation title:", error);
    }
  };

  const saveMessage = async (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: { response_time_ms?: number; rag_context?: string[]; semantic_search?: boolean }
  ) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role,
          content,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error("Error saving message:", error);
      return null;
    }
  };

  const handleNewChat = async () => {
    setActiveConversationId(null);
    setMessages([]);
    setInputValue("");
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    if (conversation.role_id) {
      setSelectedRoleId(conversation.role_id);
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await supabase
        .from("conversations")
        .update({ is_active: false })
        .eq("id", conversationId);
      
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
      
      toast.success("Диалог удален");
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Ошибка удаления диалога");
    }
  };

  const handleRenameConversation = async (conversationId: string) => {
    if (!editingTitle.trim()) {
      setEditingConversationId(null);
      return;
    }

    try {
      await supabase
        .from("conversations")
        .update({ title: editingTitle.trim() })
        .eq("id", conversationId);
      
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, title: editingTitle.trim() } : c)
      );
      setEditingConversationId(null);
    } catch (error) {
      console.error("Error renaming conversation:", error);
      toast.error("Ошибка переименования");
    }
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isProjectMode = selectedRole?.is_project_mode || false;

  const handleSend = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    let conversationId = activeConversationId;
    
    // Create new conversation if needed
    if (!conversationId) {
      conversationId = await createNewConversation();
      if (!conversationId) return;
      setActiveConversationId(conversationId);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Save user message to DB
    await saveMessage(conversationId, "user", trimmedInput);

    // Update title if it's the first message
    const currentMessages = messages;
    if (currentMessages.length === 0) {
      await updateConversationTitle(conversationId, trimmedInput);
    }

    try {
      // Build message history for project mode
      let messageHistory: { role: string; content: string }[] | undefined;
      
      if (isProjectMode) {
        messageHistory = [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        }));
      }

      const response = await supabase.functions.invoke("chat", {
        body: {
          message: trimmedInput,
          role_id: selectedRoleId || undefined,
          conversation_id: conversationId,
          message_history: messageHistory,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: response.data.content || "Нет ответа",
        timestamp: new Date(),
        responseTime: response.data.response_time_ms,
        ragContext: response.data.rag_context,
        semanticSearch: response.data.semantic_search,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message to DB
      await saveMessage(conversationId, "assistant", response.data.content || "Нет ответа", {
        response_time_ms: response.data.response_time_ms,
        rag_context: response.data.rag_context,
        semantic_search: response.data.semantic_search,
      });

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(error.message || "Ошибка отправки сообщения");
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Ошибка: ${error.message || "Не удалось получить ответ"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = async () => {
    if (activeConversationId) {
      await handleDeleteConversation(activeConversationId, { stopPropagation: () => {} } as React.MouseEvent);
    }
    setMessages([]);
  };

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div 
        className={cn(
          "border-r transition-all duration-300 flex flex-col",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        )}
      >
        <div className="p-3 border-b">
          <Button 
            onClick={handleNewChat} 
            className="w-full justify-start gap-2"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            Новый диалог
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Нет диалогов</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={cn(
                    "group flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-accent transition-colors",
                    activeConversationId === conversation.id && "bg-accent"
                  )}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  
                  {editingConversationId === conversation.id ? (
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleRenameConversation(conversation.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameConversation(conversation.id);
                        if (e.key === "Escape") setEditingConversationId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 text-sm"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 truncate text-sm">{conversation.title}</span>
                  )}
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingConversationId(conversation.id);
                        setEditingTitle(conversation.title);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => handleDeleteConversation(conversation.id, e)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0"
            >
              {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
            </Button>
            
            <Select
              value={selectedRoleId || "_none"}
              onValueChange={(value) => setSelectedRoleId(value === "_none" ? "" : value)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Выберите роль" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Без роли</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    <div className="flex items-center gap-2">
                      {role.name}
                      {role.is_project_mode && (
                        <Badge variant="secondary" className="text-xs">Проект</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedRole?.description && (
              <span className="text-sm text-muted-foreground max-w-sm truncate hidden md:inline">
                {selectedRole.description}
              </span>
            )}
            
            {isProjectMode && (
              <Badge variant="outline" className="hidden sm:flex">
                <History className="h-3 w-3 mr-1" />
                Режим проекта
              </Badge>
            )}
          </div>
          
          <Button variant="outline" size="sm" onClick={handleClearChat}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Очистить
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Bot className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg">Начните диалог</p>
                <p className="text-sm">
                  {selectedRole
                    ? `Роль: ${selectedRole.name}`
                    : "Выберите роль для специализированных ответов"}
                </p>
                {isProjectMode && (
                  <p className="text-xs mt-2 text-primary">
                    Режим проекта: история сохраняется в контексте
                  </p>
                )}
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                  <Card
                    className={cn(
                      "max-w-[70%] p-4",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <div
                      className={cn(
                        "prose prose-sm max-w-none",
                        message.role === "user"
                          ? "prose-invert"
                          : "prose-neutral dark:prose-invert"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                            code: ({ className, children }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="bg-background/50 px-1 py-0.5 rounded text-xs">
                                  {children}
                                </code>
                              ) : (
                                <pre className="bg-background/50 p-2 rounded overflow-x-auto">
                                  <code className="text-xs">{children}</code>
                                </pre>
                              );
                            },
                            h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-bold mb-2">{children}</h3>,
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-2 border-primary pl-3 italic">
                                {children}
                              </blockquote>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                    
                    {message.role === "assistant" && (
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                        {message.responseTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {message.responseTime}ms
                          </span>
                        )}
                        {message.ragContext && message.ragContext.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {message.ragContext.length} документов
                            {message.semanticSearch && " (семантика)"}
                          </Badge>
                        )}
                      </div>
                    )}
                  </Card>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <Card className="bg-muted p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Думаю...</span>
                  </div>
                </Card>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Введите сообщение... (Enter для отправки, Shift+Enter для новой строки)"
              className="min-h-[60px] max-h-[200px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="h-auto"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
