import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  History, 
  Pencil,
  Loader2,
  Search,
  X,
  Filter,
  Bot
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Conversation, ChatRole } from "@/types/chat";
import { isToday, isYesterday, subDays } from "date-fns";

interface ChatSidebarEnhancedProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  roles?: ChatRole[];
}

interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

function groupConversationsByDate(conversations: Conversation[]): ConversationGroup[] {
  const groups: ConversationGroup[] = [
    { label: "Сегодня", conversations: [] },
    { label: "Вчера", conversations: [] },
    { label: "Последние 7 дней", conversations: [] },
    { label: "Этот месяц", conversations: [] },
    { label: "Ранее", conversations: [] },
  ];

  const sevenDaysAgo = subDays(new Date(), 7);
  const thirtyDaysAgo = subDays(new Date(), 30);

  conversations.forEach((conv) => {
    const date = new Date(conv.updated_at || conv.created_at);
    
    if (isToday(date)) {
      groups[0].conversations.push(conv);
    } else if (isYesterday(date)) {
      groups[1].conversations.push(conv);
    } else if (date > sevenDaysAgo) {
      groups[2].conversations.push(conv);
    } else if (date > thirtyDaysAgo) {
      groups[3].conversations.push(conv);
    } else {
      groups[4].conversations.push(conv);
    }
  });

  // Return only non-empty groups
  return groups.filter(g => g.conversations.length > 0);
}

export function ChatSidebarEnhanced({
  conversations,
  activeConversationId,
  isLoading,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  roles = [],
}: ChatSidebarEnhancedProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");

  // Get unique roles used in conversations
  const usedRoles = useMemo(() => {
    const roleIds = new Set(conversations.map(c => c.role_id).filter(Boolean));
    return roles.filter(r => roleIds.has(r.id));
  }, [conversations, roles]);

  // Filter conversations by search query and role
  const filteredConversations = useMemo(() => {
    let filtered = conversations;
    
    // Filter by role
    if (selectedRoleFilter !== "all") {
      filtered = filtered.filter(conv => conv.role_id === selectedRoleFilter);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv => 
        conv.title.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [conversations, searchQuery, selectedRoleFilter]);

  // Group filtered conversations by date
  const groupedConversations = useMemo(() => 
    groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

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

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return null;
    const role = roles.find(r => r.id === roleId);
    return role?.name || null;
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* New Chat Button */}
      <div className="p-3">
        <Button 
          onClick={onNewChat} 
          className="w-full justify-start gap-2 rounded-lg"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          Новый чат
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск в чатах..."
            className="pl-9 pr-8 h-9 bg-sidebar-accent/50 border-sidebar-border rounded-lg"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Role Filter */}
      {usedRoles.length > 0 && (
        <div className="px-3 pb-2">
          <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
            <SelectTrigger className="h-9 bg-sidebar-accent/50 border-sidebar-border rounded-lg">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Все помощники" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <span>Все помощники</span>
                </div>
              </SelectItem>
              {usedRoles.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span>{role.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{searchQuery || selectedRoleFilter !== "all" ? "Ничего не найдено" : "Нет диалогов"}</p>
            </div>
          ) : (
            groupedConversations.map((group) => (
              <div key={group.label} className="mb-4">
                {/* Group Label */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
                
                {/* Group Items */}
                <div className="space-y-0.5">
                  {group.conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => onSelectConversation(conversation)}
                      className={cn(
                        "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                        "hover:bg-sidebar-accent",
                        activeConversationId === conversation.id && "bg-sidebar-accent"
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
                          className="h-6 text-sm bg-background"
                          autoFocus
                        />
                      ) : (
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-sm text-sidebar-foreground">
                            {conversation.title || "Без названия"}
                          </span>
                          {/* Show role name as subtle badge */}
                          {getRoleName(conversation.role_id) && (
                            <span className="text-xs text-muted-foreground truncate">
                              {getRoleName(conversation.role_id)}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Actions - always visible on active, hover on others */}
                      <div className={cn(
                        "flex items-center gap-0.5 transition-opacity",
                        activeConversationId === conversation.id 
                          ? "opacity-100" 
                          : "opacity-0 group-hover:opacity-100"
                      )}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-background/50"
                          onClick={(e) => handleStartEdit(conversation, e)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => handleDelete(conversation.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}