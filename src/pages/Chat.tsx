import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Bot, 
  RotateCcw, 
  History,
  PanelLeftClose,
  PanelLeft,
  StopCircle,
  Maximize2,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptimizedChat } from "@/hooks/useOptimizedChat";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatSidebarEnhanced } from "@/components/chat/ChatSidebarEnhanced";
import { ChatInputEnhanced } from "@/components/chat/ChatInputEnhanced";

export default function Chat() {
  const navigate = useNavigate();
  const { user, departmentId, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    roles,
    selectedRoleId,
    setSelectedRoleId,
    conversations,
    activeConversationId,
    messages,
    isLoading,
    rolesLoading,
    conversationsLoading,
    sendMessage,
    handleNewChat,
    handleSelectConversation,
    deleteConversation,
    renameConversation,
    stopGeneration,
    editMessage,
    regenerateResponse,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
  } = useOptimizedChat(user?.id, departmentId);

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

  // Wait for auth first, then roles
  if (authLoading || (user && rolesLoading)) {
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
          "border-r transition-all duration-300 flex-shrink-0",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        )}
      >
        <ChatSidebarEnhanced
          conversations={conversations}
          activeConversationId={activeConversationId}
          isLoading={conversationsLoading}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={deleteConversation}
          onRenameConversation={renameConversation}
          roles={roles}
        />
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
              onClick={() => navigate("/chat-fullscreen")}
              className="h-8 w-8"
              title="Полноэкранный режим"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-5xl mx-auto py-6 px-4 lg:px-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-1">
                  {selectedRole?.name || "Чат с ассистентом"}
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {selectedRole?.description || "Начните диалог, задав вопрос или выбрав тему для обсуждения"}
                </p>
                {isProjectMode && (
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

        {/* Input */}
        <div className="border-t py-4">
          <ChatInputEnhanced
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            onStop={stopGeneration}
            isLoading={isLoading}
            attachments={attachments}
            onAttach={addAttachments}
            onRemoveAttachment={removeAttachment}
            roles={roles}
            selectedRoleId={selectedRoleId}
            onRoleChange={handleRoleChange}
            placeholder="Спросите что-нибудь..."
          />
        </div>
      </div>
    </div>
  );
}
