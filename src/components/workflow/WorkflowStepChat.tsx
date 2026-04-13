import React from 'react';
import { ProjectStepMessage } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2, Send, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WorkflowStepChatProps {
  stepId: string;
  messages: ProjectStepMessage[];
  onSendMessage: (message: string) => void;
  isExecuting: boolean;
  streamingContent: string;
}

export const WorkflowStepChat: React.FC<WorkflowStepChatProps> = ({
  stepId,
  messages,
  onSendMessage,
  isExecuting,
  streamingContent,
}) => {
  const [inputValue, setInputValue] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = () => {
    if (!inputValue.trim() || isExecuting) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  return (
    <div className="flex min-h-0 h-full min-w-0 flex-col overflow-hidden rounded-md border">
      <div className="min-h-0 flex-1 overflow-auto p-4 min-w-0">
        <div className="space-y-3 min-w-0 max-w-full">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2',
                msg.message_role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.message_role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
              <Card className={cn(
                'p-3 max-w-[80%] text-sm min-w-0 overflow-hidden',
                msg.message_role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                <div className="prose prose-sm dark:prose-invert max-w-none break-words min-w-0 [overflow-wrap:anywhere]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="my-3 overflow-x-auto">
                          <table className="min-w-full border-collapse text-xs">{children}</table>
                        </div>
                      ),
                      th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
                      td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </Card>
              {msg.message_role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-3 w-3" />
                </div>
              )}
            </div>
          ))}

          {isExecuting && streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <Card className="p-3 max-w-[80%] text-sm bg-muted min-w-0 overflow-hidden">
                <div className="prose prose-sm dark:prose-invert max-w-none break-words min-w-0 [overflow-wrap:anywhere]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="my-3 overflow-x-auto">
                          <table className="min-w-full border-collapse text-xs">{children}</table>
                        </div>
                      ),
                      th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
                      td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
                    }}
                  >
                    {streamingContent}
                  </ReactMarkdown>
                </div>
              </Card>
            </div>
          )}

          {isExecuting && !streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <Card className="p-3 bg-muted">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Агент работает...
                </div>
              </Card>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-3 border-t flex gap-2 shrink-0">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Уточнение для агента..."
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={isExecuting}
        />
        <Button size="icon" onClick={handleSend} disabled={isExecuting || !inputValue.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};