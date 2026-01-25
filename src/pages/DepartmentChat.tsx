import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOptimizedDepartmentChat } from '@/hooks/useOptimizedDepartmentChat';
import { MentionInput } from '@/components/chat/MentionInput';
import { DepartmentChatMessage } from '@/components/chat/DepartmentChatMessage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, Bot, Maximize2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Department {
  id: string;
  name: string;
}

const DepartmentChat: React.FC = () => {
  const navigate = useNavigate();
  const { user, departmentId: userDepartmentId, isAdmin, isLoading: authLoading } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    removeAttachment
  } = useOptimizedDepartmentChat(user?.id, activeDepartmentId || undefined);

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
            // Auto-select first department or user's department
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

  // Wait for auth to complete first
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No department assigned and not admin
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

  // Admin loading departments
  if (isAdmin && loadingDepartments) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Admin but no departments exist
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

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-background">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-3">
          {/* Admin department selector */}
          {isAdmin && departments.length > 0 && (
            <Select
              value={selectedDepartmentId || ''}
              onValueChange={setSelectedDepartmentId}
            >
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Отдел" />
              </SelectTrigger>
              <SelectContent>
                {departments.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Available agents badges */}
          <div className="hidden md:flex items-center gap-1">
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

          {/* Fullscreen button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/department-chat-fullscreen")}
            className="h-8 w-8"
            title="Полноэкранный режим"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto py-6 px-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-1">
                Групповой чат {currentDepartmentName ? `— ${currentDepartmentName}` : ""}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
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
          ) : (
            <div className="space-y-4">
              {messages.map(message => (
                <DepartmentChatMessage
                  key={message.id}
                  message={message}
                  currentUserId={user?.id}
                />
              ))}
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

      {/* Input area */}
      <div className="border-t p-4 bg-background">
        <div className="max-w-3xl mx-auto">
          <MentionInput
            availableAgents={availableAgents}
            onSend={sendMessage}
            isGenerating={isGenerating}
            onStop={stopGeneration}
            attachments={attachments}
            onAttach={handleAttach}
            onRemoveAttachment={removeAttachment}
          />
        </div>
      </div>
    </div>
  );
};

export default DepartmentChat;
