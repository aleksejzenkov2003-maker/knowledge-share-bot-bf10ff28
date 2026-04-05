
-- Create audio_sessions table
CREATE TABLE public.audio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Новая запись',
  audio_file_path text,
  audio_file_name text,
  transcript text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audio sessions" ON public.audio_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own audio sessions" ON public.audio_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own audio sessions" ON public.audio_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own audio sessions" ON public.audio_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Create audio_session_messages table
CREATE TABLE public.audio_session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audio_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.chat_roles(id),
  message_role text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_session_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audio messages" ON public.audio_session_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own audio messages" ON public.audio_session_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own audio messages" ON public.audio_session_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', false);

-- Storage RLS: users can upload to their own folder
CREATE POLICY "Users can upload audio files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own audio files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'audio-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own audio files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audio-files' AND (storage.foldername(name))[1] = auth.uid()::text);
