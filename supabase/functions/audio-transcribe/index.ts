import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const sessionId = formData.get('session_id') as string;

    if (!audioFile || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing audio file or session_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file size (25MB limit for Whisper)
    if (audioFile.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum 25MB.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowedTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a', 'audio/mp3', 'audio/flac', 'video/mp4', 'video/webm'];
    const allowedExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];
    const ext = '.' + audioFile.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(audioFile.type) && !allowedExtensions.includes(ext)) {
      return new Response(JSON.stringify({ error: 'Unsupported audio format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update session status to transcribing
    await supabase.from('audio_sessions').update({ status: 'transcribing' }).eq('id', sessionId);

    // Upload to storage
    const filePath = `${user.id}/${sessionId}/${audioFile.name}`;
    const { error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(filePath, audioFile, { contentType: audioFile.type, upsert: true });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      await supabase.from('audio_sessions').update({ status: 'error' }).eq('id', sessionId);
      return new Response(JSON.stringify({ error: 'Failed to upload audio file' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call OpenAI Whisper API
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      await supabase.from('audio_sessions').update({ status: 'error' }).eq('id', sessionId);
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, audioFile.name);
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'ru');
    whisperForm.append('response_format', 'text');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: whisperForm,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.error('Whisper API error:', errText);
      await supabase.from('audio_sessions').update({ status: 'error' }).eq('id', sessionId);
      return new Response(JSON.stringify({ error: 'Transcription failed', details: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transcript = await whisperResponse.text();

    // Update session with transcript
    const title = transcript.substring(0, 60).trim() + (transcript.length > 60 ? '...' : '');
    await supabase.from('audio_sessions').update({
      transcript,
      title,
      status: 'ready',
      audio_file_path: filePath,
      audio_file_name: audioFile.name,
    }).eq('id', sessionId);

    return new Response(JSON.stringify({ transcript, title }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Audio transcribe error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
