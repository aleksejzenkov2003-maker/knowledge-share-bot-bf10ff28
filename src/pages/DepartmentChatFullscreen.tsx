import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Minimize2, 
  Loader2,
  Users,
  Building2,
  Filter,
  Search
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptimizedDepartmentChat } from "@/hooks/useOptimizedDepartmentChat";
import { DepartmentChatMessage } from "@/components/chat/DepartmentChatMessage";
import { MentionInput } from "@/components/chat/MentionInput";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Department {
  id: string;
  name: string;
  slug: string;
}

export default function DepartmentChatFullscreen() {
  const navigate = useNavigate();
  const { user, role, isLoading: authLoading } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === 'admin' || role === 'moderator';
  const activeDepartmentId = isAdmin ? selectedDepartmentId : user?.user_metadata?.department_id;

  const {
    chat,
    messages,
    availableAgents,
    isLoading,
    isGenerating,
    sendMessage,
    stopGeneration,
    attachments,
    handleAttach,
    removeAttachment,
    regenerateResponse,
  } = useOptimizedDepartmentChat(user?.id, activeDepartmentId);

  // Fetch departments for admin
  useEffect(() => {
    const fetchDepartments = async () => {
      if (!isAdmin) {
        setDepartmentsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('departments')
          .select('id, name, slug')
          .order('name');

        if (error) throw error;
        setDepartments(data || []);
        if (data && data.length > 0 && !selectedDepartmentId) {
          setSelectedDepartmentId(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
      } finally {
        setDepartmentsLoading(false);
      }
    };

    fetchDepartments();
  }, [isAdmin]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filter messages by agent and search query - MUST be before any returns
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      if (agentFilter !== "all") {
        if (m.message_role === 'assistant' && m.role_id !== agentFilter) return false;
        if (m.message_role === 'user') {
          const msgIndex = messages.indexOf(m);
          const nextAssistant = messages.slice(msgIndex + 1).find(nm => nm.message_role === 'assistant');
          if (nextAssistant && nextAssistant.role_id !== agentFilter) return false;
        }
      }
      if (searchQuery.trim()) {
        return m.content.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [messages, agentFilter, searchQuery]);

  // Get unique agents from messages - MUST be before any returns
  const usedAgents = useMemo(() => {
    const agentIds = new Set(messages.filter(m => m.role_id).map(m => m.role_id!));
    return availableAgents.filter(a => agentIds.has(a.id));
  }, [messages, availableAgents]);

  const handleSend = async (text: string) => {
    await sendMessage(text);
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin && !user?.user_metadata?.department_id) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Отдел не назначен</h2>
          <p className="text-muted-foreground mb-4">
            Обратитесь к администратору для назначения отдела
          </p>
          <Button onClick={() => navigate("/department-chat")} variant="outline">
            Вернуться
          </Button>
        </div>
      </div>
    );
  }

  if (isAdmin && departmentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentDepartment = departments.find(d => d.id === selectedDepartmentId);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          
          {isAdmin ? (
            <Select
              value={selectedDepartmentId || ""}
              onValueChange={setSelectedDepartmentId}
            >
              <SelectTrigger className="w-48 h-8 border-0 bg-transparent hover:bg-accent">
                <SelectValue placeholder="Выберите отдел" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">Чат отдела</span>
          )}

          {/* Search input */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-32 pl-8 text-xs"
            />
          </div>

          {/* Agent filter */}
          {usedAgents.length > 0 && (
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-36 h-8">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Фильтр" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все агенты</SelectItem>
                {usedAgents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    @{agent.mention_trigger || agent.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Available Agents */}
          {availableAgents.length > 0 && (
            <div className="hidden lg:flex items-center gap-1 ml-2">
              <span className="text-xs text-muted-foreground mr-1">Агенты:</span>
              {availableAgents.slice(0, 3).map((agent) => (
                <Badge 
                  key={agent.id} 
                  variant="secondary" 
                  className="text-xs px-2 py-0.5"
                >
                  @{agent.mention_trigger}
                </Badge>
              ))}
              {availableAgents.length > 3 && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  +{availableAgents.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/department-chat")}
          className="h-8 w-8"
          title="Выйти из полноэкранного режима"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div className="max-w-5xl mx-auto py-6 px-4 lg:px-8">
          {filteredMessages.length === 0 && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Групповой чат {currentDepartment ? `— ${currentDepartment.name}` : ""}
              </h2>
              <p className="text-muted-foreground max-w-md mb-4">
                Начните диалог или упомяните агента через @, чтобы получить ответ от ИИ-ассистента
              </p>
              {availableAgents.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {availableAgents.map((agent) => (
                    <Badge key={agent.id} variant="outline">
                      @{agent.mention_trigger} — {agent.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[40vh] text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                Нет сообщений по фильтру
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => { setAgentFilter("all"); setSearchQuery(""); }}
              >
                Сбросить фильтры
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMessages.map((message) => (
                <DepartmentChatMessage 
                  key={message.id} 
                  message={message}
                  currentUserId={user?.id}
                  availableAgents={availableAgents}
                  onRegenerateResponse={regenerateResponse}
                />
              ))}
              {isGenerating && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Агент печатает...</span>
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
          <MentionInput
            onSend={handleSend}
            isGenerating={isGenerating}
            onStop={stopGeneration}
            availableAgents={availableAgents}
            attachments={attachments}
            onAttach={handleAttach}
            onRemoveAttachment={removeAttachment}
            placeholder="Напишите сообщение или упомяните @агента..."
          />
        </div>
      </div>
    </div>
  );
}
