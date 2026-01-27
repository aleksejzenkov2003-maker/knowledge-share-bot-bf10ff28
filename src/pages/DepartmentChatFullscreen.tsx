import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Minimize2, 
  Loader2,
  Users,
  Building2,
  Filter,
  Search,
  PanelLeftClose,
  PanelLeft,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptimizedDepartmentChat } from "@/hooks/useOptimizedDepartmentChat";
import { DepartmentChatMessage } from "@/components/chat/DepartmentChatMessage";
import { DepartmentChatSidebar } from "@/components/chat/DepartmentChatSidebar";
import { MentionInput } from "@/components/chat/MentionInput";
import { ReplyPreview } from "@/components/chat/ReplyPreview";
import { KnowledgeBaseSelector } from "@/components/chat/KnowledgeBaseSelector";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DepartmentChatMessage as DepartmentChatMessageType } from "@/types/departmentChat";

interface Department {
  id: string;
  name: string;
  slug: string;
}

export default function DepartmentChatFullscreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role, isLoading: authLoading } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [messageAgentFilter, setMessageAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarAgentFilter, setSidebarAgentFilter] = useState<string>("all");
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
    toggleAttachmentKnowledgeBase,
    regenerateResponse,
    // Multi-chat support
    departmentChats,
    activeChatId,
    chatAgentsMap,
    createNewChat,
    selectChat,
    renameChat,
    deleteChat,
    pinChat,
    // Reply-to and Knowledge Base
    replyToMessage,
    setReplyToMessage,
    selectedKnowledgeDocs,
    setSelectedKnowledgeDocs,
  } = useOptimizedDepartmentChat(user?.id, activeDepartmentId);

  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);

  // Restore chat from URL parameter
  useEffect(() => {
    const chatIdFromUrl = searchParams.get('chatId');
    if (chatIdFromUrl && departmentChats.length > 0) {
      const chatExists = departmentChats.some(c => c.id === chatIdFromUrl);
      if (chatExists && chatIdFromUrl !== activeChatId) {
        selectChat(chatIdFromUrl);
      }
    }
  }, [searchParams, departmentChats, activeChatId, selectChat]);

  // Update URL when chat changes
  useEffect(() => {
    if (activeChatId) {
      setSearchParams({ chatId: activeChatId }, { replace: true });
    }
  }, [activeChatId, setSearchParams]);

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

  // Filter messages by agent and search query
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      if (messageAgentFilter !== "all") {
        if (m.message_role === 'assistant' && m.role_id !== messageAgentFilter) return false;
        if (m.message_role === 'user') {
          const msgIndex = messages.indexOf(m);
          const nextAssistant = messages.slice(msgIndex + 1).find(nm => nm.message_role === 'assistant');
          if (nextAssistant && nextAssistant.role_id !== messageAgentFilter) return false;
        }
      }
      if (searchQuery.trim()) {
        return m.content.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [messages, messageAgentFilter, searchQuery]);

  // Get unique agents from messages
  const usedAgents = useMemo(() => {
    const agentIds = new Set(messages.filter(m => m.role_id).map(m => m.role_id!));
    return availableAgents.filter(a => agentIds.has(a.id));
  }, [messages, availableAgents]);

  const handleSend = useCallback(async (text: string) => {
    await sendMessage(text, attachments, selectedKnowledgeDocs, replyToMessage);
    setReplyToMessage(null);
    setSelectedKnowledgeDocs([]);
  }, [sendMessage, attachments, selectedKnowledgeDocs, replyToMessage, setReplyToMessage, setSelectedKnowledgeDocs]);

  const handleReply = useCallback((message: DepartmentChatMessageType) => {
    setReplyToMessage(message);
    // Focus input after setting reply
  }, [setReplyToMessage]);

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
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "border-r border-border transition-all duration-300 flex-shrink-0",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        {sidebarOpen && (
          <DepartmentChatSidebar
            departmentChats={departmentChats}
            activeChatId={activeChatId}
            onSelectChat={selectChat}
            onNewChat={createNewChat}
            onDeleteChat={deleteChat}
            onRenameChat={renameChat}
            onPinChat={pinChat}
            availableAgents={availableAgents}
            selectedAgentFilter={sidebarAgentFilter}
            onAgentFilterChange={setSidebarAgentFilter}
            chatAgentsMap={chatAgentsMap}
          />
        )}
      </div>

      {/* Main content */}
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
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>
            
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
                <SelectContent className="bg-popover">
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="font-medium">{chat?.title || 'Чат отдела'}</span>
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

            {/* Message agent filter */}
            {usedAgents.length > 0 && (
              <Select value={messageAgentFilter} onValueChange={setMessageAgentFilter}>
                <SelectTrigger className="w-36 h-8">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Фильтр" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
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
                  onClick={() => { setMessageAgentFilter("all"); setSearchQuery(""); }}
                >
                  Сбросить фильтры
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMessages.map((message) => {
                  const replyTo = message.reply_to_message_id 
                    ? messages.find(m => m.id === message.reply_to_message_id) 
                    : undefined;
                  return (
                    <DepartmentChatMessage 
                      key={message.id} 
                      message={message}
                      currentUserId={user?.id}
                      availableAgents={availableAgents}
                      onRegenerateResponse={regenerateResponse}
                      onReply={handleReply}
                      replyToMessage={replyTo}
                    />
                  );
                })}
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
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Reply Preview */}
            <ReplyPreview 
              replyTo={replyToMessage} 
              onClear={() => setReplyToMessage(null)} 
            />
            
            {/* Knowledge Base Selected Docs Indicator */}
            {selectedKnowledgeDocs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  База знаний: {selectedKnowledgeDocs.length} док.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 ml-auto"
                  onClick={() => setKnowledgeBaseOpen(true)}
                >
                  Изменить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-destructive hover:text-destructive"
                  onClick={() => setSelectedKnowledgeDocs([])}
                >
                  Очистить
                </Button>
              </div>
            )}
            
            <div className="flex gap-2">
              {/* Knowledge Base Button */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-[60px] w-12 flex-shrink-0"
                onClick={() => setKnowledgeBaseOpen(true)}
                title="База знаний"
              >
                <BookOpen className="h-5 w-5" />
                {selectedKnowledgeDocs.length > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {selectedKnowledgeDocs.length}
                  </Badge>
                )}
              </Button>
              
              <div className="flex-1">
                <MentionInput
                  onSend={handleSend}
                  isGenerating={isGenerating}
                  onStop={stopGeneration}
                  availableAgents={availableAgents}
                  attachments={attachments}
                  onAttach={handleAttach}
                  onRemoveAttachment={removeAttachment}
                  onToggleAttachmentKnowledgeBase={toggleAttachmentKnowledgeBase}
                  showKnowledgeBaseOption={true}
                  placeholder="Напишите сообщение или упомяните @агента..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge Base Selector Dialog */}
        <KnowledgeBaseSelector
          open={knowledgeBaseOpen}
          onOpenChange={setKnowledgeBaseOpen}
          departmentId={activeDepartmentId || undefined}
          selectedDocs={selectedKnowledgeDocs}
          onSelect={setSelectedKnowledgeDocs}
        />
      </div>
    </div>
  );
}
