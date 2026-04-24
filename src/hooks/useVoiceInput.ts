import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const MAX_DURATION_SEC = 60;

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setDuration(0);
    setIsRecording(false);
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'ogg';
      const file = new File([blob], `voice.${ext}`, { type: blob.type || 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('language', 'ru');

      const { data, error } = await supabase.functions.invoke('voice-transcribe', {
        body: formData,
      });

      if (error) throw error;
      const text = (data as { transcript?: string })?.transcript?.trim();
      if (text) {
        onTranscript(text);
      } else {
        toast.error('Не удалось распознать речь');
      }
    } catch (e) {
      console.error('Voice transcribe error:', e);
      toast.error('Не удалось распознать речь');
    } finally {
      setIsTranscribing(false);
    }
  }, [onTranscript]);

  const start = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        const wasCancelled = cancelledRef.current;
        cleanup();
        if (!wasCancelled && blob.size > 1000) {
          void transcribe(blob);
        }
      };

      recorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        setDuration((d) => {
          const next = d + 1;
          if (next >= MAX_DURATION_SEC) {
            try { recorder.state === 'recording' && recorder.stop(); } catch { /* ignore */ }
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      console.error('Mic permission error:', e);
      toast.error('Нет доступа к микрофону. Разрешите доступ в настройках браузера.');
      cleanup();
    }
  }, [isRecording, isTranscribing, cleanup, transcribe]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      cancelledRef.current = false;
      recorder.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      cancelledRef.current = true;
      recorder.stop();
    } else {
      cleanup();
    }
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { isRecording, isTranscribing, duration, start, stop, cancel };
}
