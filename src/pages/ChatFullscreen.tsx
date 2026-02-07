import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  PanelLeftClose, 
  PanelLeft, 
  Minimize2, 
  Trash2,
  Loader2,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useOptimizedChat } from "@/hooks/useOptimizedChat";
import { ChatSidebarEnhanced } from "@/components/chat/ChatSidebarEnhanced";
import { ChatInputEnhanced } from "@/components/chat/ChatInputEnhanced";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { GoldenResponseDialog } from "@/components/chat/GoldenResponseDialog";
import { PiiPreviewDialog } from "@/components/documents/PiiPreviewDialog";
import { useConversationRolesQuery } from "@/hooks/queries/useChatQueries";
import { useAttachmentTextExtractor } from "@/hooks/useAttachmentTextExtractor";
import { Attachment } from "@/types/chat";
import { toast } from "sonner";

export default function ChatFullscreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasRestoredRef = useRef(false);
  const { user, departmentId, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    roles,
    selectedRoleId,
    setSelectedRoleId,
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    isLoading,
    conversationsLoading,
    rolesLoading,
    sendMessage,
    handleNewChat,
    handleSelectConversation,
    deleteConversation,
    renameConversation,
    pinConversation,
    stopGeneration,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    toggleAttachmentPii,
    editMessage,
    regenerateResponse,
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

  // Restore conversation from URL param only on initial load
  useEffect(() => {
    const urlConvId = searchParams.get('conversationId');
    if (!hasRestoredRef.current && urlConvId && conversations.length > 0) {
      const exists = conversations.find(c => c.id === urlConvId);
      if (exists) {
        setActiveConversationId(urlConvId);
      }
      hasRestoredRef.current = true;
    }
  }, [conversations, searchParams, setActiveConversationId]);

  // Sync URL when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      setSearchParams({ conversationId: activeConversationId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [activeConversationId, setSearchParams]);

  // Wrapper for new chat that works with URL sync
  const handleNewChatFullscreen = useCallback(() => {
    handleNewChat();
  }, [handleNewChat]);

  // Fetch roles used in messages for each conversation
  const conversationIds = useMemo(() => conversations.map(c => c.id), [conversations]);
  const { data: conversationRolesMap = new Map() } = useConversationRolesQuery(conversationIds);

  const selectedRole = useMemo(() => 
    roles.find(r => r.id === selectedRoleId), 
    [roles, selectedRoleId]
  );

  const activeConversation = useMemo(() =>
    conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const isProjectMode = selectedRole?.is_project_mode || false;

  // Auto-scroll to bottom
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

  if (authLoading || rolesLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <div 
        className={cn(
          "h-full border-r border-border transition-all duration-300 flex-shrink-0",
          sidebarOpen ? "w-64" : "w-0"
        )}
      >
        {sidebarOpen && (
          <ChatSidebarEnhanced
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChatFullscreen}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={deleteConversation}
            onRenameConversation={renameConversation}
            onPinConversation={pinConversation}
            roles={roles}
            selectedRoleFilter={selectedRoleFilter}
            onRoleFilterChange={setSelectedRoleFilter}
            conversationRolesMap={conversationRolesMap}
          />
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
              <span className="text-sm font-medium truncate max-w-[300px]">
                {activeConversation.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              onClick={() => navigate(`/chat${activeConversationId ? `?conversationId=${activeConversationId}` : ''}`)}
              className="h-8 w-8"
              title="Выйти из полноэкранного режима"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Messages Area */}
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto py-6 px-4 lg:px-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  {selectedRole?.name || "Чат с ассистентом"}
                </h2>
                <p className="text-muted-foreground max-w-md">
                  {selectedRole?.description || "Начните диалог, задав вопрос или выбрав тему для обсуждения"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage 
                    key={message.id} 
                    message={message}
                    onEditMessage={editMessage}
                    onRegenerateResponse={regenerateResponse}
                    onSaveAsGolden={handleSaveAsGolden}
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

        {/* Input Area */}
        <div className="border-t border-border bg-background py-4">
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
      </div>

      {/* Golden Response Dialog */}
      <GoldenResponseDialog
        isOpen={goldenDialogOpen}
        onClose={() => setGoldenDialogOpen(false)}
        question={goldenQuestion}
        answer={goldenAnswer}
        roleId={selectedRoleId}
        departmentId={departmentId}
      />

      {/* PII Preview Dialog */}
      <PiiPreviewDialog
        open={piiPreviewOpen}
        onOpenChange={setPiiPreviewOpen}
        text={piiPreviewText}
        fileName={piiPreviewFileName}
      />
    </div>
  );
}
