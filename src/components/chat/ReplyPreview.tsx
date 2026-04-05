import { Reply, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DepartmentChatMessage } from "@/types/departmentChat";
import { Message } from "@/types/chat";

interface ReplyPreviewProps {
  replyTo: DepartmentChatMessage | Message | null;
  onClear: () => void;
}

export function ReplyPreview({ replyTo, onClear }: ReplyPreviewProps) {
  if (!replyTo) return null;

  // Handle both department and personal chat message types
  const getUserName = () => {
    if ('metadata' in replyTo && replyTo.metadata) {
      return (replyTo.metadata as { user_name?: string; agent_name?: string }).user_name 
        || (replyTo.metadata as { agent_name?: string }).agent_name 
        || 'Сообщение';
    }
    return 'Сообщение';
  };

  const getRole = () => {
    if ('message_role' in replyTo) {
      return replyTo.message_role;
    }
    return replyTo.role;
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-l-2 border-primary rounded-t-lg">
      <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">
          Ответ на: {getRole() === 'assistant' ? '🤖 ' : ''}{getUserName()}
        </span>
        <p className="text-xs text-muted-foreground truncate">
          {replyTo.content.slice(0, 100)}{replyTo.content.length > 100 ? '...' : ''}
        </p>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 shrink-0"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
