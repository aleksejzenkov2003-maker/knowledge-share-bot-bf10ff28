import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOptimizedDepartmentChat } from '@/hooks/useOptimizedDepartmentChat';
import { ChatInputEnhanced } from '@/components/chat/ChatInputEnhanced';
import { DepartmentChatMessage } from '@/components/chat/DepartmentChatMessage';
import { DepartmentChatSidebar } from '@/components/chat/DepartmentChatSidebar';
import { PiiPreviewDialog } from '@/components/documents/PiiPreviewDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, Bot, Maximize2, Minimize2, Filter, Search, PanelLeftClose, PanelLeft, Trash2, StopCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { DepartmentChatMessage as DepartmentChatMessageType } from '@/types/departmentChat';
import { Attachment, ReputationSearchResult } from '@/types/chat';
import { useAttachmentTextExtractor } from '@/hooks/useAttachmentTextExtractor';
import { useRoleProviderLabels } from '@/hooks/useRoleProviderLabels';
import { toast } from 'sonner';

interface Department {
  id: string;
  name: string;
}

const DepartmentChat: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, departmentId: userDepartmentId, isAdmin, isLoading: authLoading } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // PII preview state
  const [piiPreviewOpen, setPiiPreviewOpen] = useState(false);
  const [piiPreviewText, setPiiPreviewText] = useState("");
  const [piiPreviewFileName, setPiiPreviewFileName] = useState("");
  const { extractText } = useAttachmentTextExtractor();
  const { data: roleProviderLabels } = useRoleProviderLabels();

  // For admins, allow selecting any department; for users, use their assigned department
  const activeDepartmentId = isAdmin ? selectedDepartmentId : userDepartmentId;

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
    toggleAttachmentPii,
    toggleAttachmentKnowledgeBase,
    regenerateResponse,
    retryMessage,
    departmentChats,
    activeChatId,
    chatAgentsMap,
    createNewChat,
    selectChat,
    renameChat,
    deleteChat,
    pinChat,
    replyToMessage,
    setReplyToMessage,
    selectedKnowledgeDocs,
    setSelectedKnowledgeDocs,
  } = useOptimizedDepartmentChat(user?.id, activeDepartmentId || undefined);

  // Check URL for fullscreen flag
  useEffect(() => {
    if (searchParams.get('fullscreen') === 'true') {
      setIsFullscreen(true);
    }
  }, [searchParams]);

  // Fetch departments for admin selection
  useEffect(() => {
    if (isAdmin) {
      setLoadingDepartments(true);
      supabase
        .from('departments')
        .select('id, name')
        .order('name')
        .then(({ data, error }) => {
          if (!error && data) {
            setDepartments(data);
            if (data.length > 0) {
              setSelectedDepartmentId(userDepartmentId || data[0].id);
            }
          }
          setLoadingDepartments(false);
        });
    }
  }, [isAdmin, userDepartmentId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filter messages by agent and search query
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
        const query = searchQuery.toLowerCase();
        return m.content.toLowerCase().includes(query);
      }
      return true;
    });
  }, [messages, agentFilter, searchQuery]);

  // Get unique agents from messages for filter dropdown
  const usedAgents = useMemo(() => {
    const agentIds = new Set(messages.filter(m => m.role_id).map(m => m.role_id!));
    return availableAgents.filter(a => agentIds.has(a.id));
  }, [messages, availableAgents]);

  // Handle send with reply and knowledge base
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() && attachments.length === 0) return;
    await sendMessage(inputValue.trim(), attachments, selectedKnowledgeDocs, replyToMessage);
    setInputValue("");
    setReplyToMessage(null);
    setSelectedKnowledgeDocs([]);
  }, [sendMessage, inputValue, attachments, selectedKnowledgeDocs, replyToMessage, setReplyToMessage, setSelectedKnowledgeDocs]);

  // Handle reply action
  const handleReply = useCallback((message: DepartmentChatMessageType) => {
    setReplyToMessage(message);
  }, [setReplyToMessage]);

  // Handle reputation company selection from carousel
  const handleSelectReputationCompany = useCallback((result: ReputationSearchResult) => {
    const entityType = (result.Type || 'Company').toLowerCase() === 'entrepreneur' ? 'entrepreneur' : 
                       (result.Type || 'Company').toLowerCase() === 'person' ? 'person' : 'company';
    const selectMessage = `[REPUTATION_SELECT:${result.Id}:${entityType}] Покажи полное досье на компанию "${result.Name}"`;
    // Find the agent that was used for the reputation search by looking at the last assistant message with role_id
    const lastAssistantWithRole = [...messages].reverse().find(m => m.message_role === 'assistant' && m.role_id);
    const agentForSelect = lastAssistantWithRole 
      ? availableAgents.find(a => a.id === lastAssistantWithRole.role_id)
      : null;
    const rawMentionTrigger = (agentForSelect?.mention_trigger || agentForSelect?.slug || '').trim();
    const normalizedMentionTrigger = rawMentionTrigger.replace(/^@+/, '');
    const mention = normalizedMentionTrigger ? `@${normalizedMentionTrigger} ` : '';
    sendMessage(mention + selectMessage);
  }, [sendMessage, availableAgents, messages]);

  // PII preview handler
  const handlePiiPreview = useCallback(async (attachment: Attachment) => {
    const text = await extractText(attachment);
    if (!text) {
      toast.error('Не удалось извлечь текст из файла');
      return;
    }
    setPiiPreviewText(text);
    setPiiPreviewFileName(attachment.file_name);
    setPiiPreviewOpen(true);
  }, [extractText]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin && !userDepartmentId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Отдел не назначен
            </CardTitle>
            <CardDescription>
              Для доступа к чату отдела вам необходимо быть назначенным в отдел.
              Обратитесь к администратору.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isAdmin && loadingDepartments) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin && departments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Нет отделов
            </CardTitle>
            <CardDescription>
              Создайте хотя бы один отдел для использования чатов отделов.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentDepartmentName = isAdmin 
    ? departments.find(d => d.id === selectedDepartmentId)?.name 
    : 'Ваш отдел';

  // ── Shared UI pieces ──

  const sidebarContent = (
    <DepartmentChatSidebar
      departmentChats={departmentChats}
      activeChatId={activeChatId}
      onSelectChat={selectChat}
      onNewChat={createNewChat}
      onDeleteChat={deleteChat}
      onRenameChat={renameChat}
      onPinChat={pinChat}
      availableAgents={availableAgents}
      selectedAgentFilter={agentFilter}
      onAgentFilterChange={setAgentFilter}
      chatAgentsMap={chatAgentsMap}
    />
  );

  const searchInput = (
    <div className="relative hidden sm:block">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder="Поиск..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-8 w-32 pl-8 text-xs"
      />
    </div>
  );

  const agentFilterSelect = usedAgents.length > 0 ? (
    <Select value={agentFilter} onValueChange={setAgentFilter}>
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
  ) : null;

  const adminDeptSelector = isAdmin && departments.length > 0 ? (
    <Select
      value={selectedDepartmentId || ''}
      onValueChange={setSelectedDepartmentId}
    >
      <SelectTrigger className="w-40 h-8">
        <SelectValue placeholder="Отдел" />
      </SelectTrigger>
      <SelectContent className="bg-popover">
        {departments.map(dept => (
          <SelectItem key={dept.id} value={dept.id}>
            {dept.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;

  const agentBadges = (
    <div className="hidden lg:flex items-center gap-1">
      {availableAgents.slice(0, 3).map(agent => (
        <Badge key={agent.id} variant="secondary" className="text-xs">
          <Bot className="h-3 w-3 mr-1" />
          @{agent.mention_trigger || agent.slug}
        </Badge>
      ))}
      {availableAgents.length > 3 && (
        <Badge variant="outline" className="text-xs">
          +{availableAgents.length - 3}
        </Badge>
      )}
    </div>
  );

  const emptyHeight = isFullscreen ? "h-[60vh]" : "h-[50vh]";

  const messagesContent = (
    <ScrollArea className="flex-1 bg-chat-bg">
      <div className="max-w-4xl mx-auto py-6 px-4 lg:px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMessages.length === 0 && messages.length === 0 ? (
          <div className={cn("flex flex-col items-center justify-center text-center", emptyHeight)}>
            <div className={cn("rounded-full bg-primary/10 flex items-center justify-center mb-4", isFullscreen ? "w-16 h-16" : "w-14 h-14")}>
              <Users className={cn("text-primary", isFullscreen ? "h-8 w-8" : "h-7 w-7")} />
            </div>
            <h2 className={cn("font-semibold mb-1", isFullscreen ? "text-xl mb-2" : "text-lg")}>
              Групповой чат {currentDepartmentName ? `— ${currentDepartmentName}` : ""}
            </h2>
            <p className={cn("text-muted-foreground mb-4", isFullscreen ? "max-w-md" : "text-sm max-w-sm")}>
              Здесь можно задавать вопросы разным AI-агентам. 
              Начните сообщение с @упоминания агента.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {availableAgents.slice(0, 4).map(agent => (
                <Badge key={agent.id} variant="outline" className="text-xs">
                  @{agent.mention_trigger || agent.slug} — {agent.name}
                </Badge>
              ))}
            </div>
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
            {filteredMessages.map(message => {
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
                  onRetryMessage={retryMessage}
                  onReply={handleReply}
                  replyToMessage={replyTo}
                  onSelectReputationCompany={handleSelectReputationCompany}
                  roleProviderLabels={roleProviderLabels}
                />
              );
            })}
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Агент печатает...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </ScrollArea>
  );

  const inputContent = (
    <div className="py-4" data-tour="dept-chat-input">
      <ChatInputEnhanced
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        isLoading={isGenerating}
        onStop={stopGeneration}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={removeAttachment}
        onToggleAttachmentPii={toggleAttachmentPii}
        onToggleAttachmentKnowledgeBase={toggleAttachmentKnowledgeBase}
        showKnowledgeBaseOption={true}
        onPiiPreview={handlePiiPreview}
        availableAgents={availableAgents}
        departmentId={activeDepartmentId || undefined}
        conversationId={activeChatId || undefined}
        selectedKnowledgeDocs={selectedKnowledgeDocs}
        onKnowledgeDocsChange={setSelectedKnowledgeDocs}
        replyTo={replyToMessage}
        onClearReply={() => setReplyToMessage(null)}
        placeholder="Напишите @агент и ваш вопрос..."
      />
    </div>
  );

  const piiDialog = (
    <PiiPreviewDialog
      open={piiPreviewOpen}
      onOpenChange={setPiiPreviewOpen}
      text={piiPreviewText}
      fileName={piiPreviewFileName}
    />
  );

  const sidebarToggleBtn = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setSidebarOpen(!sidebarOpen)}
      className="h-8 w-8"
    >
      {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
    </Button>
  );

  // ── Fullscreen overlay ──
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "h-full border-r border-border transition-all duration-300 flex-shrink-0",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        )}>
          {sidebarOpen && sidebarContent}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              {sidebarToggleBtn}
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              {adminDeptSelector || (
                <span className="font-medium">{chat?.title || 'Чат отдела'}</span>
              )}
              {searchInput}
              {agentFilterSelect}
              {agentBadges}
            </div>
            <div className="flex items-center gap-2">
              {isGenerating && (
                <Button variant="destructive" size="sm" onClick={stopGeneration} className="h-8">
                  <StopCircle className="h-4 w-4 mr-1" />
                  Стоп
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(false)}
                className="h-8 w-8"
                title="Выйти из полноэкранного режима"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {messagesContent}
          {inputContent}
        </div>

        {piiDialog}
      </div>
    );
  }

  // ── Normal (inline) layout ──
  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div className={cn(
        "border-r border-border transition-all duration-300 flex-shrink-0",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        {sidebarOpen && sidebarContent}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-background">
          <div className="flex items-center gap-3">
            {sidebarToggleBtn}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-medium text-sm">{chat?.title || 'Чат отдела'}</h1>
                {isAdmin && (
                  <Badge variant="outline" className="text-xs">Админ</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Вызывайте агентов через @упоминание
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {searchInput}
            {agentFilterSelect}
            {adminDeptSelector}
            {agentBadges}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(true)}
              className="h-8 w-8"
              title="Полноэкранный режим"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {messagesContent}
        {inputContent}
      </div>

      {piiDialog}
    </div>
  );
};

export default DepartmentChat;
