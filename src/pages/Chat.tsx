import { useState, useEffect, useRef } from "react";
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
import { Send, Loader2, Bot, User, RotateCcw, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatRole {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  responseTime?: number;
  ragContext?: string[];
  semanticSearch?: boolean;
}

export default function Chat() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<ChatRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("chat_roles")
        .select("id, name, description, slug, is_active")
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

  const handleSend = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await supabase.functions.invoke("chat", {
        body: {
          message: trimmedInput,
          role_id: selectedRoleId || undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.data.content || "Нет ответа",
        timestamp: new Date(),
        responseTime: response.data.response_time_ms,
        ragContext: response.data.rag_context,
        semanticSearch: response.data.semantic_search,
      };

      setMessages((prev) => [...prev, assistantMessage]);
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

  const handleClearChat = () => {
    setMessages([]);
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Чат</h1>
          <Select
            value={selectedRoleId || "_none"}
            onValueChange={(value) => setSelectedRoleId(value === "_none" ? "" : value)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Выберите роль" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Без роли</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedRole?.description && (
            <span className="text-sm text-muted-foreground max-w-md truncate">
              {selectedRole.description}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleClearChat}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Очистить
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 py-4">
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
      <div className="pt-4 border-t">
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
  );
}
