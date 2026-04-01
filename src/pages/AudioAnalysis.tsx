import { useState, useRef, useCallback } from 'react';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mic, Upload, Plus, Trash2, Loader2, Copy, Send, Square,
  FileAudio, CheckCircle, AlertCircle, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

const ACCEPTED_FORMATS = '.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg,.flac';

export default function AudioAnalysis() {
  const {
    sessions, sessionsLoading, activeSession, activeSessionId,
    setActiveSessionId, messages, isTranscribing, isSendingMessage,
    streamingContent, createSession, deleteSession, uploadAudio, sendMessage, stopGeneration,
  } = useAudioAnalysis();

  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [chatInput, setChatInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch chat roles
  const { data: chatRoles = [] } = useQuery({
    queryKey: ['chat-roles-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_roles')
        .select('id, name, description, slug')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadAudio(file);
  }, [uploadAudio]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAudio(file);
    e.target.value = '';
  }, [uploadAudio]);

  const handleSend = useCallback(() => {
    if (!chatInput.trim() || !selectedRoleId) return;
    sendMessage(chatInput.trim(), selectedRoleId);
    setChatInput('');
  }, [chatInput, selectedRoleId, sendMessage]);

  const copyTranscript = useCallback(() => {
    if (activeSession?.transcript) {
      navigator.clipboard.writeText(activeSession.transcript);
      toast({ title: 'Скопировано' });
    }
  }, [activeSession, toast]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'error': return <AlertCircle className="h-3 w-3 text-destructive" />;
      case 'transcribing':
      case 'uploading': return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
      default: return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Sidebar */}
      <div className="w-72 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b">
          <Button onClick={() => createSession()} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" /> Новый анализ
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center p-4">Нет сессий</p>
            ) : sessions.map(session => (
              <div
                key={session.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted text-sm group",
                  activeSessionId === session.id && "bg-muted"
                )}
                onClick={() => setActiveSessionId(session.id)}
              >
                {statusIcon(session.status)}
                <span className="flex-1 truncate">{session.title}</span>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Mic className="h-12 w-12 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">Анализ аудио</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Загрузите аудиофайл для транскрибации, затем задайте вопросы агенту по содержимому.
              </p>
              <Button onClick={() => createSession()} className="gap-2">
                <Plus className="h-4 w-4" /> Начать новый анализ
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Upload / Transcript area */}
            <div className="border-b">
              {activeSession.status === 'new' || activeSession.status === 'error' ? (
                <div
                  className={cn(
                    "p-8 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer",
                    dragOver ? "bg-primary/10 border-primary" : "bg-muted/20",
                    activeSession.status === 'error' && "border-destructive/30"
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Перетащите аудиофайл сюда или нажмите для выбора</p>
                  <p className="text-xs text-muted-foreground">MP3, WAV, M4A, OGG, FLAC, WebM • до 25 МБ</p>
                  {activeSession.status === 'error' && (
                    <Badge variant="destructive">Ошибка транскрибации. Попробуйте снова.</Badge>
                  )}
                  <input ref={fileInputRef} type="file" accept={ACCEPTED_FORMATS} className="hidden" onChange={handleFileSelect} />
                </div>
              ) : activeSession.status === 'uploading' || activeSession.status === 'transcribing' ? (
                <div className="p-8 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">
                    {activeSession.status === 'uploading' ? 'Загрузка файла...' : 'Транскрибация...'}
                  </p>
                  {activeSession.audio_file_name && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileAudio className="h-3 w-3" />
                      {activeSession.audio_file_name}
                    </div>
                  )}
                </div>
              ) : activeSession.transcript ? (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileAudio className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{activeSession.audio_file_name}</span>
                      <Badge variant="secondary" className="text-xs">Готово</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={copyTranscript} className="gap-1">
                      <Copy className="h-3 w-3" /> Копировать
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-3 text-sm">
                    {activeSession.transcript}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Chat area */}
            {activeSession.transcript && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {messages.map(msg => (
                      <div key={msg.id} className={cn("flex", msg.message_role === 'user' ? 'justify-end' : 'justify-start')}>
                        <Card className={cn(
                          "p-3 max-w-[80%]",
                          msg.message_role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        )}>
                          {msg.message_role === 'assistant' ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </Card>
                      </div>
                    ))}
                    {isSendingMessage && !streamingContent && (
                      <div className="flex justify-start">
                        <Card className="p-3 max-w-[80%] bg-muted">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Обработка запроса...</span>
                          </div>
                        </Card>
                      </div>
                    )}
                    {streamingContent && (
                      <div className="flex justify-start">
                        <Card className="p-3 max-w-[80%] bg-muted">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{streamingContent}</ReactMarkdown>
                          </div>
                        </Card>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input area */}
                <div className="border-t p-4">
                  <div className="max-w-3xl mx-auto space-y-3">
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Выберите агента..." />
                      </SelectTrigger>
                      <SelectContent>
                        {chatRoles.map(role => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                            {role.description && <span className="text-muted-foreground ml-2 text-xs">— {role.description}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Задайте вопрос по транскрипту..."
                        className="min-h-[44px] max-h-32 resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        disabled={isSendingMessage}
                      />
                      {isSendingMessage ? (
                        <Button variant="destructive" size="icon" onClick={stopGeneration}>
                          <Square className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          onClick={handleSend}
                          disabled={!chatInput.trim() || !selectedRoleId}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
