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
  MoreHorizontal,
  Bot
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  conversationRolesMap?: Map<string, string[]>;
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
  conversationRolesMap = new Map(),
}: ChatSidebarEnhancedProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Get all unique roles used across all conversations (from conversation.role_id + message metadata)
  const usedRoles = useMemo(() => {
    const roleIds = new Set<string>();
    
    conversations.forEach(c => {
      if (c.role_id) roleIds.add(c.role_id);
      const messageRoles = conversationRolesMap.get(c.id) || [];
      messageRoles.forEach(rid => roleIds.add(rid));
    });
    
    return roles.filter(r => roleIds.has(r.id));
  }, [conversations, roles, conversationRolesMap]);

  // Filter conversations by search query and role (including roles used in messages)
  const filteredConversations = useMemo(() => {
    let filtered = conversations;
    
    // Filter by role - check conversation.role_id AND roles used in messages
    if (selectedRoleFilter !== "all") {
      filtered = filtered.filter(conv => {
        if (conv.role_id === selectedRoleFilter) return true;
        const messageRoles = conversationRolesMap.get(conv.id) || [];
        return messageRoles.includes(selectedRoleFilter);
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv => 
        conv.title.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [conversations, searchQuery, selectedRoleFilter, conversationRolesMap]);

  const groupedConversations = useMemo(() => 
    groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  const handleStartEdit = (conversation: Conversation, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const handleSaveEdit = (id: string) => {
    if (editingTitle.trim()) {
      onRenameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDeleteConversation(id);
  };

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      setSearchQuery("");
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header with New Chat + Search + Filter */}
      <div className="p-2 space-y-2">
        {/* Top row: New Chat + Search toggle */}
        <div className="flex items-center gap-1">
          <Button 
            onClick={onNewChat} 
            className="flex-1 justify-start gap-2 h-9"
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Новый чат
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={toggleSearch}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* Collapsible search */}
        {isSearchOpen && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="pl-8 pr-7 h-8 text-sm bg-sidebar-accent/50 border-sidebar-border"
              autoFocus
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {/* Role filter - only show if there are roles to filter */}
        {usedRoles.length > 1 && (
          <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
            <SelectTrigger className="h-8 text-xs bg-sidebar-accent/50 border-sidebar-border">
              <div className="flex items-center gap-1.5 truncate">
                <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Все помощники" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="text-sm">Все помощники</span>
              </SelectItem>
              {usedRoles.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  <span className="text-sm">{role.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      
      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="px-1.5 pb-2">
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
              <div key={group.label} className="mb-3">
                {/* Group Label */}
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
                
                {/* Group Items */}
                <div className="space-y-0.5">
                  {group.conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => onSelectConversation(conversation)}
                      className={cn(
                        "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
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
                          className="h-6 text-sm bg-background flex-1"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 truncate text-sm text-sidebar-foreground">
                          {conversation.title || "Без названия"}
                        </span>
                      )}
                      
                      {/* Three-dot menu - ChatGPT style */}
                      {editingId !== conversation.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-6 w-6 shrink-0 transition-opacity",
                                activeConversationId === conversation.id 
                                  ? "opacity-100" 
                                  : "opacity-0 group-hover:opacity-100"
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(conversation);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Переименовать
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => handleDelete(conversation.id, e)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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
