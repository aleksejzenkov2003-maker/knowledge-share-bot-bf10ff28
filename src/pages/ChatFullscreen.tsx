import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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

export default function ChatFullscreen() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get user profile to fetch departmentId
  const departmentId = user?.user_metadata?.department_id || null;

  const {
    roles,
    selectedRoleId,
    setSelectedRoleId,
    conversations,
    activeConversationId,
    messages,
    isLoading,
    conversationsLoading,
    rolesLoading,
    sendMessage,
    handleNewChat,
    handleSelectConversation,
    deleteConversation,
    renameConversation,
    stopGeneration,
    attachments,
    addAttachments,
    removeAttachment,
    editMessage,
    regenerateResponse,
  } = useOptimizedChat(user?.id, departmentId);

  const selectedRole = useMemo(() => 
    roles.find(r => r.id === selectedRoleId), 
    [roles, selectedRoleId]
  );

  const activeConversation = useMemo(() =>
    conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim() || attachments.length > 0) {
      sendMessage(inputValue, selectedRole?.is_project_mode || false);
      setInputValue("");
    }
  };

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

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
            isLoading={conversationsLoading}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={deleteConversation}
            onRenameConversation={renameConversation}
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
              onClick={() => navigate("/chat")}
              className="h-8 w-8"
              title="Выйти из полноэкранного режима"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Messages Area */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto py-6 px-4">
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
        <div className="border-t border-border py-4">
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
