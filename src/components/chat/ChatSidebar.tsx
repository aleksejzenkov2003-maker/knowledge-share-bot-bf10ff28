import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  History, 
  Pencil,
  Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation } from "@/types/chat";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  isLoading,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const handleStartEdit = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const handleSaveEdit = (id: string) => {
    if (editingTitle.trim()) {
      onRenameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteConversation(id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button 
          onClick={onNewChat} 
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          Новый диалог
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Нет диалогов</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-accent transition-colors",
                  activeConversationId === conversation.id && "bg-accent"
                )}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                
                {editingId === conversation.id ? (
                  <Input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleSaveEdit(conversation.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(conversation.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 text-sm"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 truncate text-sm">{conversation.title}</span>
                )}
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => handleStartEdit(conversation, e)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => handleDelete(conversation.id, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
