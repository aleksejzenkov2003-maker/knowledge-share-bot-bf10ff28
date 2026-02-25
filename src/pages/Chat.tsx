import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  RotateCcw, 
  History,
  PanelLeftClose,
  PanelLeft,
  StopCircle,
  Maximize2,
  Minimize2,
  MessageSquare,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptimizedChat } from "@/hooks/useOptimizedChat";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatSidebarEnhanced } from "@/components/chat/ChatSidebarEnhanced";
import { ChatInputEnhanced } from "@/components/chat/ChatInputEnhanced";
import { GoldenResponseDialog } from "@/components/chat/GoldenResponseDialog";
import { PiiPreviewDialog } from "@/components/documents/PiiPreviewDialog";
import { useConversationRolesQuery } from "@/hooks/queries/useChatQueries";
import { useAttachmentTextExtractor } from "@/hooks/useAttachmentTextExtractor";
import { Attachment, ReputationSearchResult } from "@/types/chat";
import { toast } from "sonner";

export default function Chat() {
  const [searchParams] = useSearchParams();
  const { user, departmentId, isLoading: authLoading } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initialConversationId = searchParams.get('conversationId');

  const {
    roles,
    selectedRoleId,
    setSelectedRoleId,
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    isLoading,
    rolesLoading,
    conversationsLoading,
    sendMessage,
    handleNewChat,
    handleSelectConversation,
    deleteConversation,
    renameConversation,
    pinConversation,
    stopGeneration,
    editMessage,
    regenerateResponse,
    retryMessage,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    toggleAttachmentPii,
  } = useOptimizedChat(user?.id, departmentId);

  // Golden response dialog state
  const [goldenDialogOpen, setGoldenDialogOpen] = useState(false);
  const [goldenQuestion, setGoldenQuestion] = useState("");
  const [goldenAnswer, setGoldenAnswer] = useState("");

  // PII preview state
  const [piiPreviewOpen, setPiiPreviewOpen] = useState(false);
  const [piiPreviewText, setPiiPreviewText] = useState("");
  const [piiPreviewFileName, setPiiPreviewFileName] = useState("");
  const { extractText } = useAttachmentTextExtractor();

  // Restore conversation from URL param on mount
  useEffect(() => {
    if (initialConversationId && !activeConversationId && conversations.length > 0) {
      const exists = conversations.find(c => c.id === initialConversationId);
      if (exists) {
        setActiveConversationId(initialConversationId);
      }
    }
  }, [initialConversationId, activeConversationId, conversations, setActiveConversationId]);

  // Check URL for fullscreen flag
  useEffect(() => {
    if (searchParams.get('fullscreen') === 'true') {
      setIsFullscreen(true);
    }
  }, [searchParams]);

  // Fetch roles used in messages for each conversation
  const conversationIds = useMemo(() => conversations.map(c => c.id), [conversations]);
  const { data: conversationRolesMap = new Map() } = useConversationRolesQuery(conversationIds);

  const selectedRole = useMemo(() => 
    roles.find((r) => r.id === selectedRoleId),
    [roles, selectedRoleId]
  );

  const activeConversation = useMemo(() =>
    conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const isProjectMode = selectedRole?.is_project_mode || false;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim() || attachments.length > 0) {
      sendMessage(inputValue, isProjectMode);
      setInputValue("");
    }
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

  const handleClearChat = () => {
    if (activeConversationId) {
      deleteConversation(activeConversationId);
    }
  };

  // Handle saving a response as golden/reference
  const handleSaveAsGolden = useCallback((messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const message = messages[messageIndex];
    if (message.role !== "assistant") return;
    
    let questionContent = "";
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        questionContent = messages[i].content;
        break;
      }
    }
    
    if (!questionContent) {
      questionContent = "(Вопрос не найден)";
    }
    
    setGoldenQuestion(questionContent);
    setGoldenAnswer(message.content);
    setGoldenDialogOpen(true);
  }, [messages]);

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

  // Handle reputation company selection from carousel
  const handleSelectReputationCompany = useCallback((result: ReputationSearchResult) => {
    const entityType = (result.Type || 'Company').toLowerCase() === 'entrepreneur' ? 'entrepreneur' : 
                       (result.Type || 'Company').toLowerCase() === 'person' ? 'person' : 'company';
    const selectMessage = `[REPUTATION_SELECT:${result.Id}:${entityType}] Покажи полное досье на компанию "${result.Name}"`;
    sendMessage(selectMessage, isProjectMode);
  }, [sendMessage, isProjectMode]);

  if (authLoading || (user && rolesLoading)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Shared chat content (used in both normal and fullscreen modes)
  const sidebarContent = (
    <ChatSidebarEnhanced
      conversations={conversations}
      activeConversationId={activeConversationId}
      onNewChat={handleNewChat}
      onSelectConversation={handleSelectConversation}
      onDeleteConversation={deleteConversation}
      onRenameConversation={renameConversation}
      onPinConversation={pinConversation}
      roles={roles}
      selectedRoleFilter={selectedRoleFilter}
      onRoleFilterChange={setSelectedRoleFilter}
      conversationRolesMap={conversationRolesMap}
    />
  );

  const messagesContent = (
    <ScrollArea className="flex-1">
      <div className="max-w-4xl mx-auto py-6 px-4 lg:px-8">
        {messages.length === 0 ? (
          <div className={cn(
            "flex flex-col items-center justify-center text-center",
            isFullscreen ? "h-[60vh]" : "h-[50vh]"
          )}>
            <div className={cn(
              "rounded-full bg-primary/10 flex items-center justify-center mb-4",
              isFullscreen ? "w-16 h-16" : "w-14 h-14"
            )}>
              <MessageSquare className={cn("text-primary", isFullscreen ? "h-8 w-8" : "h-7 w-7")} />
            </div>
            <h2 className={cn("font-semibold mb-1", isFullscreen ? "text-xl mb-2" : "text-lg")}>
              {selectedRole?.name || "Чат с ассистентом"}
            </h2>
            <p className={cn("text-muted-foreground", isFullscreen ? "max-w-md" : "text-sm max-w-sm")}>
              {selectedRole?.description || "Начните диалог, задав вопрос или выбрав тему для обсуждения"}
            </p>
            {isProjectMode && !isFullscreen && (
              <Badge variant="secondary" className="mt-3">
                <History className="h-3 w-3 mr-1" />
                История сохраняется в контексте
              </Badge>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message}
                onEditMessage={editMessage}
                onRegenerateResponse={regenerateResponse}
                onRetryMessage={retryMessage}
                onSaveAsGolden={handleSaveAsGolden}
                onSelectReputationCompany={handleSelectReputationCompany}
                availableRoles={roles}
                currentRoleId={selectedRoleId}
              />
            ))}
            {isLoading && (
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
  );

  const inputContent = (
    <div className="border-t bg-background py-4" data-tour="chat-input">
      <ChatInputEnhanced
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onStop={stopGeneration}
        isLoading={isLoading}
        attachments={attachments}
        onAttach={addAttachments}
        onRemoveAttachment={removeAttachment}
        onToggleAttachmentPii={toggleAttachmentPii}
        onPiiPreview={handlePiiPreview}
        roles={roles}
        selectedRoleId={selectedRoleId}
        onRoleChange={handleRoleChange}
        placeholder="Спросите что-нибудь..."
      />
    </div>
  );

  const dialogs = (
    <>
      <GoldenResponseDialog
        isOpen={goldenDialogOpen}
        onClose={() => setGoldenDialogOpen(false)}
        question={goldenQuestion}
        answer={goldenAnswer}
        roleId={selectedRoleId}
        departmentId={departmentId}
      />
      <PiiPreviewDialog
        open={piiPreviewOpen}
        onOpenChange={setPiiPreviewOpen}
        text={piiPreviewText}
        fileName={piiPreviewFileName}
      />
    </>
  );

  // ── Fullscreen overlay ──
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex overflow-hidden">
        {/* Sidebar */}
        <div 
          className={cn(
            "h-full border-r border-border transition-all duration-300 flex-shrink-0",
            sidebarOpen ? "w-64" : "w-0"
          )}
        >
          {sidebarOpen && sidebarContent}
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Fullscreen Header */}
          <header className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="h-8 w-8"
              >
                {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
              </Button>
              {activeConversation && (
                <span className="text-sm font-medium truncate max-w-[300px]">
                  {activeConversation.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isLoading && (
                <Button variant="destructive" size="sm" onClick={stopGeneration} className="h-8">
                  <StopCircle className="h-4 w-4 mr-1" />
                  Стоп
                </Button>
              )}
              {activeConversation && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteConversation(activeConversation.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
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

        {dialogs}
      </div>
    );
  }

  // ── Normal (inline) layout ──
  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div 
        data-tour="chat-sidebar"
        className={cn(
          "border-r transition-all duration-300 flex-shrink-0",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        )}
      >
        {sidebarContent}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8 flex-shrink-0"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>
            
            {activeConversation && (
              <span className="text-sm font-medium truncate max-w-[200px]">
                {activeConversation.title}
              </span>
            )}
            
            {isProjectMode && (
              <Badge variant="outline" className="text-xs hidden sm:flex">
                <History className="h-3 w-3 mr-1" />
                Режим проекта
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {isLoading && (
              <Button variant="destructive" size="sm" onClick={stopGeneration} className="h-8">
                <StopCircle className="h-4 w-4 mr-1" />
                Стоп
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClearChat}
              className="h-8 w-8"
              title="Очистить чат"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
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

      {dialogs}
    </div>
  );
}
