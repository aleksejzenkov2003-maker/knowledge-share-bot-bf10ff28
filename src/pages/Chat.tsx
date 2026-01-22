import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Bot, 
  RotateCcw, 
  History,
  PanelLeftClose,
  PanelLeft,
  StopCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptimizedChat } from "@/hooks/useOptimizedChat";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatInput } from "@/components/chat/ChatInput";

export default function Chat() {
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
    stopGeneration,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
  } = useOptimizedChat(user?.id, departmentId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isProjectMode = selectedRole?.is_project_mode || false;

  const handleSend = () => {
    sendMessage(inputValue, isProjectMode);
    setInputValue("");
    clearAttachments();
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
          "border-r transition-all duration-300",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        )}
      >
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          isLoading={conversationsLoading}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={deleteConversation}
          onRenameConversation={renameConversation}
        />
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
          
          <div className="flex items-center gap-2">
            {isLoading && (
              <Button variant="destructive" size="sm" onClick={stopGeneration}>
                <StopCircle className="h-4 w-4 mr-2" />
                Стоп
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleClearChat}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Очистить
            </Button>
          </div>
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
                <ChatMessage key={message.id} message={message} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isLoading={isLoading}
          attachments={attachments}
          onAttach={addAttachments}
          onRemoveAttachment={removeAttachment}
        />
      </div>
    </div>
  );
}
