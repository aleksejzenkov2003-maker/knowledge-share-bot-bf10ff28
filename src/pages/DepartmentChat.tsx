import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentChat } from '@/hooks/useDepartmentChat';
import { MentionInput } from '@/components/chat/MentionInput';
import { DepartmentChatMessage } from '@/components/chat/DepartmentChatMessage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Bot } from 'lucide-react';

const DepartmentChat: React.FC = () => {
  const { user, departmentId } = useAuth();
  const {
    chat,
    messages,
    availableAgents,
    isLoading,
    isGenerating,
    sendMessage,
    stopGeneration
  } = useDepartmentChat(user?.id, departmentId);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!departmentId) {
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Users className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold">{chat?.title || 'Чат отдела'}</h1>
            <p className="text-sm text-muted-foreground">
              Вызывайте агентов через @упоминание
            </p>
          </div>
        </div>

        {/* Available agents badges */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Агенты:</span>
          <div className="flex flex-wrap gap-1">
            {availableAgents.slice(0, 5).map(agent => (
              <Badge key={agent.id} variant="secondary" className="text-xs">
                <Bot className="h-3 w-3 mr-1" />
                {agent.mention_trigger || `@${agent.slug}`}
              </Badge>
            ))}
            {availableAgents.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{availableAgents.length - 5}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">Добро пожаловать в чат отдела!</h3>
                <p className="text-muted-foreground max-w-sm">
                  Здесь вы можете задавать вопросы разным AI-агентам. 
                  Начните сообщение с @упоминания агента.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {availableAgents.slice(0, 3).map(agent => (
                    <Badge key={agent.id} variant="outline" className="text-sm">
                      {agent.mention_trigger || `@${agent.slug}`} — {agent.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(message => (
                <DepartmentChatMessage
                  key={message.id}
                  message={message}
                  currentUserId={user?.id}
                />
              ))
            )}

            {/* Generating indicator */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Агент печатает...
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input area */}
      <div className="p-4 border-t bg-background">
        <MentionInput
          availableAgents={availableAgents}
          onSend={sendMessage}
          isGenerating={isGenerating}
          onStop={stopGeneration}
        />
      </div>
    </div>
  );
};

export default DepartmentChat;
