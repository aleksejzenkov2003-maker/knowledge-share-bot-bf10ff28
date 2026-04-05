import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AudioSession {
  id: string;
  user_id: string;
  title: string;
  audio_file_path: string | null;
  audio_file_name: string | null;
  transcript: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AudioMessage {
  id: string;
  session_id: string;
  user_id: string;
  role_id: string | null;
  message_role: string;
  content: string;
  metadata: any;
  created_at: string;
  isStreaming?: boolean;
}

export function useAudioAnalysis() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Fetch sessions
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['audio-sessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_sessions')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as AudioSession[];
    },
    enabled: !!user,
  });

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // Fetch messages for active session
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['audio-messages', activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return [];
      const { data, error } = await supabase
        .from('audio_session_messages')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as AudioMessage[];
    },
    enabled: !!activeSessionId,
  });

  // Create session
  const createSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('audio_sessions')
        .insert({ user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as AudioSession;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audio-sessions'] });
      setActiveSessionId(data.id);
    },
  });

  // Delete session
  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from('audio_sessions').delete().eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['audio-sessions'] });
      if (activeSessionId === sessionId) setActiveSessionId(null);
    },
  });

  // Upload and transcribe
  const uploadAudio = useCallback(async (file: File) => {
    if (!user || !activeSessionId) return;
    
    setIsTranscribing(true);
    try {
      // Update status
      await supabase.from('audio_sessions').update({ status: 'uploading', audio_file_name: file.name }).eq('id', activeSessionId);
      queryClient.invalidateQueries({ queryKey: ['audio-sessions'] });

      const formData = new FormData();
      formData.append('audio', file);
      formData.append('session_id', activeSessionId);

      const { data: { session: authSession } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-transcribe`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${authSession?.access_token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Transcription failed');
      }

      await queryClient.invalidateQueries({ queryKey: ['audio-sessions'] });
      toast({ title: 'Транскрипция завершена' });
    } catch (error: any) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      await supabase.from('audio_sessions').update({ status: 'error' }).eq('id', activeSessionId);
      queryClient.invalidateQueries({ queryKey: ['audio-sessions'] });
    } finally {
      setIsTranscribing(false);
    }
  }, [user, activeSessionId, queryClient, toast]);

  // Send message to agent
  const sendMessage = useCallback(async (content: string, roleId: string) => {
    if (!user || !activeSessionId || !activeSession?.transcript) return;

    setIsSendingMessage(true);
    setStreamingContent('');

    try {
      // Save user message
      await supabase.from('audio_session_messages').insert({
        session_id: activeSessionId,
        user_id: user.id,
        role_id: roleId,
        message_role: 'user',
        content,
      });

      queryClient.invalidateQueries({ queryKey: ['audio-messages', activeSessionId] });

      // Build message history
      const prevMessages = messages.map(m => ({
        role: m.message_role,
        content: m.content,
      }));

      const messageHistory = [
        { role: 'system', content: `Транскрипт аудиозаписи "${activeSession.audio_file_name || 'аудио'}":\n\n${activeSession.transcript}` },
        ...prevMessages,
        { role: 'user', content },
      ];

      const { data: { session: authSession } } = await supabase.auth.getSession();
      
      abortRef.current = new AbortController();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-stream`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authSession?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: content,
            role_id: roleId,
            message_history: messageHistory,
          }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok) throw new Error('Stream request failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            }
          } catch {}
        }
      }

      // Save assistant message
      if (fullContent) {
        await supabase.from('audio_session_messages').insert({
          session_id: activeSessionId,
          user_id: user.id,
          role_id: roleId,
          message_role: 'assistant',
          content: fullContent,
        });
      }

      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['audio-messages', activeSessionId] });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      }
    } finally {
      setIsSendingMessage(false);
      setStreamingContent('');
    }
  }, [user, activeSessionId, activeSession, messages, queryClient, toast]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    sessions,
    sessionsLoading,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    messages,
    messagesLoading,
    isTranscribing,
    isSendingMessage,
    streamingContent,
    createSession: createSession.mutate,
    deleteSession: deleteSession.mutate,
    uploadAudio,
    sendMessage,
    stopGeneration,
  };
}
