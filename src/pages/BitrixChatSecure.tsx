import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, X, Bot, User, Loader2, StopCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

interface Agent {
  id: string;
  name: string;
  slug: string;
  mention: string | null;
  description: string | null;
}

interface Message {
  id: string;
  message_role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  created_at: string;
}

interface Attachment {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'ready';
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface AuthState {
  token: string;
  expiresAt: number;
  user: UserProfile | null;
}

declare global {
  interface Window {
    BX24?: {
      init: (callback: () => void) => void;
      placement: {
        info: () => {
          DOMAIN: string;
          [key: string]: any;
        };
      };
      callMethod: (method: string, params: any, callback: (result: any) => void) => void;
      getAuth: () => {
        access_token: string;
        auth_id: string;
        [key: string]: any;
      };
    };
  }
}

const BitrixChatSecure = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Get params from URL
  const params = new URLSearchParams(window.location.search);
  const portalFromUrl = params.get('portal') || '';
  const bitrixUserIdFromUrl = params.get('bitrixUserId') || '';
  const userNameFromUrl = params.get('userName') || '';
  const userEmailFromUrl = params.get('userEmail') || '';

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bitrix-chat-api`;
  
  // Storage key for persistent auth
  const authStorageKey = `bitrix_auth_v2_${portalFromUrl}_${bitrixUserIdFromUrl}`;

  // Get headers with JWT token
  const getHeaders = useCallback(() => {
    if (!authState?.token) return null;
    return {
      'Authorization': `Bearer ${authState.token}`,
      'Content-Type': 'application/json'
    };
  }, [authState?.token]);

  // Authenticate with Bitrix (with localStorage persistence)
  const authenticate = useCallback(async (portal: string, bitrixUserId: string, userName?: string, userEmail?: string, skipRestore = false) => {
    try {
      setAuthError(null);
      
      // Build storage key for this user
      const storageKey = `bitrix_auth_v2_${portal}_${bitrixUserId}`;
      
      // Try to restore from localStorage first (unless skipping)
      if (!skipRestore) {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed: AuthState & { savedAt: number } = JSON.parse(stored);
            
            // Check if token is still valid (with 1 hour buffer)
            if (parsed.expiresAt > Date.now() + 3600000) {
              // Verify token with server
              const meRes = await fetch(`${baseUrl}/me`, {
                headers: { 'Authorization': `Bearer ${parsed.token}` }
              });
              
              if (meRes.ok) {
                setAuthState(parsed);
                console.log('BitrixChatSecure: Restored session from localStorage');
                
                // Background refresh if less than 1 day remaining
                if (parsed.expiresAt - Date.now() < 24 * 3600 * 1000) {
                  refreshTokenInBackground(parsed.token, storageKey);
                }
                
                return parsed;
              }
            } else if (parsed.expiresAt > Date.now()) {
              // Token close to expiring, try refresh
              const refreshed = await refreshStoredToken(parsed.token, storageKey);
              if (refreshed) return refreshed;
            }
            
            // Token invalid - clear
            localStorage.removeItem(storageKey);
          }
        } catch (e) {
          console.error('Failed to restore from localStorage:', e);
          localStorage.removeItem(storageKey);
        }
      }
      
      // New authentication
      const response = await fetch(`${baseUrl}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal,
          bitrix_user_id: bitrixUserId,
          bitrix_user_name: userName,
          bitrix_user_email: userEmail,
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Authentication failed');
      }

      const data = await response.json();
      
      const newAuthState: AuthState = {
        token: data.token,
        expiresAt: Date.now() + (data.expires_in * 1000),
        user: data.user
      };

      setAuthState(newAuthState);
      
      // Store in localStorage for persistent sessions
      localStorage.setItem(storageKey, JSON.stringify({
        ...newAuthState,
        savedAt: Date.now(),
      }));

      // Schedule token refresh (1 day before expiration)
      const refreshIn = (data.expires_in - 86400) * 1000;
      if (refreshIn > 0) {
        refreshTimerRef.current = setTimeout(() => {
          refreshStoredToken(data.token, storageKey);
        }, refreshIn);
      }

      return newAuthState;
    } catch (error: any) {
      setAuthError(error.message);
      throw error;
    }
  }, [baseUrl]);

  // Refresh token helper
  const refreshStoredToken = async (currentToken: string, storageKey: string): Promise<AuthState | null> => {
    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const newAuthState: AuthState = {
          token: data.token,
          expiresAt: Date.now() + (data.expires_in * 1000),
          user: data.user,
        };
        
        setAuthState(newAuthState);
        localStorage.setItem(storageKey, JSON.stringify({
          ...newAuthState,
          savedAt: Date.now(),
        }));
        
        console.log('BitrixChatSecure: Token refreshed successfully');
        return newAuthState;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    return null;
  };

  // Background refresh (non-blocking)
  const refreshTokenInBackground = (currentToken: string, storageKey: string) => {
    refreshStoredToken(currentToken, storageKey).catch(console.error);
  };

  // Initialize authentication
  useEffect(() => {
    const initAuth = async () => {
      // Check if BX24 SDK is available
      if (window.BX24) {
        window.BX24.init(() => {
          const placement = window.BX24!.placement.info();
          const portal = placement.DOMAIN;
          
          window.BX24!.callMethod('user.current', {}, async (result: any) => {
            if (result.error()) {
              setAuthError('Failed to get user info from Bitrix24');
              setIsLoading(false);
              return;
            }
            
            const user = result.data();
            try {
              await authenticate(
                portal,
                user.ID,
                `${user.NAME} ${user.LAST_NAME}`.trim(),
                user.EMAIL
              );
              setIsLoading(false);
            } catch {
              setIsLoading(false);
            }
          });
        });
      } else if (portalFromUrl && bitrixUserIdFromUrl) {
        // Fallback: use URL params (for testing or non-Bitrix embedding)
        try {
          await authenticate(portalFromUrl, bitrixUserIdFromUrl, userNameFromUrl, userEmailFromUrl);
        } catch {
          // Error is already set in authenticate()
        }
        setIsLoading(false);
      } else {
        setAuthError('Не удалось определить параметры авторизации. Откройте страницу из Bitrix24.');
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for postMessage from parent (for receiving auth data securely)
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'BITRIX_AUTH') {
        const { portal, bitrixUserId, userName, userEmail } = event.data;
        if (portal && bitrixUserId) {
          try {
            await authenticate(portal, bitrixUserId, userName, userEmail);
          } catch {
            // Error handled in authenticate
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [authenticate, portalFromUrl, bitrixUserIdFromUrl, userNameFromUrl, userEmailFromUrl]);

  // Load initial data after auth
  useEffect(() => {
    if (!authState?.token) return;
    loadInitialData();
  }, [authState?.token]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadInitialData = async () => {
    const headers = getHeaders();
    if (!headers) return;

    try {
      const [messagesRes, agentsRes] = await Promise.all([
        fetch(`${baseUrl}/messages?limit=50`, { headers }),
        fetch(`${baseUrl}/agents`, { headers })
      ]);

      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.messages || []);
      }

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
    } catch (error) {
      console.error('Load error:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (isGenerating) return;

    const headers = getHeaders();
    if (!headers) {
      toast({
        title: 'Ошибка авторизации',
        description: 'Пожалуйста, перезагрузите страницу',
        variant: 'destructive'
      });
      return;
    }

    const message = input.trim();
    setInput('');
    setIsGenerating(true);
    setStreamingContent('');

    // Add user message to UI immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      message_role: 'user',
      content: message,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Prepare attachments
    const attachmentData = await Promise.all(
      attachments.map(async (att) => {
        const base64 = await fileToBase64(att.file);
        return {
          file_name: att.file.name,
          file_base64: base64,
          file_type: att.file.type
        };
      })
    );
    setAttachments([]);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(`${baseUrl}/send-message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          attachments: attachmentData.length > 0 ? attachmentData : undefined
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;
          
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              const assistantMessage: Message = {
                id: crypto.randomUUID(),
                message_role: 'assistant',
                content: fullContent,
                created_at: new Date().toISOString()
              };
              setMessages(prev => [...prev, assistantMessage]);
              setStreamingContent('');
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setStreamingContent(fullContent);
                }
              } catch {
                // Fragmented JSON, will be processed in next chunk
              }
            }
          }
        }
      }
      
      // FINALIZATION: If stream ended without [DONE], save content
      if (fullContent && streamingContent) {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          message_role: 'assistant',
          content: fullContent,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
        setStreamingContent('');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Send error:', error);
        toast({
          title: 'Ошибка',
          description: 'Не удалось отправить сообщение',
          variant: 'destructive'
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '@') {
      setShowAgents(true);
    }
  };

  const insertMention = (mention: string) => {
    setInput(prev => prev + mention + ' ');
    setShowAgents(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'ready' as const
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Инициализация...</p>
      </div>
    );
  }

  // Auth error state
  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-lg font-medium text-center mb-2">Ошибка авторизации</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">{authError}</p>
        <Button 
          className="mt-4" 
          onClick={() => window.location.reload()}
        >
          Попробовать снова
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium">AI Ассистент</span>
          {authState?.user?.full_name && (
            <Badge variant="outline" className="ml-2 text-xs">
              {authState.user.full_name}
            </Badge>
          )}
        </div>
        {agents.length > 0 && (
          <div className="flex items-center gap-1">
            {agents.slice(0, 3).map(agent => (
              <Badge 
                key={agent.id} 
                variant="secondary" 
                className="text-xs cursor-pointer hover:bg-secondary/80"
                onClick={() => insertMention(agent.mention || `@${agent.slug}`)}
              >
                {agent.mention || `@${agent.slug}`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="h-12 w-12 mb-4 opacity-50" />
            <p>Начните диалог с AI-ассистентом</p>
            {agents.length > 0 && (
              <p className="text-sm mt-2">
                Используйте @упоминание для выбора агента
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.message_role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.message_role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.message_role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.message_role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.message_role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Streaming message */}
            {streamingContent && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                  <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-1" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Agent suggestions */}
      {showAgents && agents.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4 bg-popover border rounded-lg shadow-lg p-2 z-10">
          <p className="text-xs text-muted-foreground px-2 mb-1">Выберите агента</p>
          {agents.map(agent => (
            <button
              key={agent.id}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm"
              onClick={() => insertMention(agent.mention || `@${agent.slug}`)}
            >
              <span className="font-medium">{agent.mention || `@${agent.slug}`}</span>
              {agent.description && (
                <span className="text-muted-foreground ml-2">— {agent.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-t">
          {attachments.map(att => (
            <div key={att.id} className="relative bg-muted rounded px-2 py-1 text-xs flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[100px] truncate">{att.file.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t bg-card">
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение... (@ для упоминания агента)"
            className="min-h-[40px] max-h-[120px] resize-none"
            disabled={isGenerating}
            onFocus={() => setShowAgents(false)}
          />
          {isGenerating ? (
            <Button variant="destructive" size="icon" onClick={handleStop}>
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              size="icon" 
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BitrixChatSecure;
