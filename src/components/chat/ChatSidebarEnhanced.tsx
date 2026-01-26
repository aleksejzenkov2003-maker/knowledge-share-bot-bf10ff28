import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  X, 
  Filter,
  Pin,
  PinOff,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRole, Conversation } from "@/types/chat";

interface ChatSidebarEnhancedProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onPinConversation?: (id: string, isPinned: boolean) => void;
  roles: ChatRole[];
  selectedRoleFilter: string;
  onRoleFilterChange: (roleId: string) => void;
  conversationRolesMap?: Map<string, string[]>;
}

// Date grouping helper
function getDateGroup(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  if (date >= today) return "Сегодня";
  if (date >= yesterday) return "Вчера";
  if (date >= weekAgo) return "Последние 7 дней";
  if (date >= monthAgo) return "Последние 30 дней";
  return "Ранее";
}

// Group conversations by date
function groupByDate(conversations: Conversation[]): Map<string, Conversation[]> {
  const groups = new Map<string, Conversation[]>();
  const order = ["Сегодня", "Вчера", "Последние 7 дней", "Последние 30 дней", "Ранее"];
  
  // Initialize groups in order
  order.forEach(group => groups.set(group, []));
  
  conversations.forEach(conv => {
    const group = getDateGroup(conv.updated_at);
    const existing = groups.get(group) || [];
    existing.push(conv);
    groups.set(group, existing);
  });
  
  // Remove empty groups
  order.forEach(group => {
    if (groups.get(group)?.length === 0) {
      groups.delete(group);
    }
  });
  
  return groups;
}

export function ChatSidebarEnhanced({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  roles,
  selectedRoleFilter,
  onRoleFilterChange,
  conversationRolesMap = new Map(),
}: ChatSidebarEnhancedProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  // Filter conversations by search and role
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv =>
        conv.title.toLowerCase().includes(query)
      );
    }

    // Filter by role - check both conversation role_id AND message metadata role_ids
    if (selectedRoleFilter !== "all") {
      filtered = filtered.filter(conv => {
        // Check conversation's own role_id
        if (conv.role_id === selectedRoleFilter) return true;
        
        // Check role_ids from messages in this conversation
        const messageRoles = conversationRolesMap.get(conv.id) || [];
        return messageRoles.includes(selectedRoleFilter);
      });
    }

    return filtered;
  }, [conversations, searchQuery, selectedRoleFilter, conversationRolesMap]);

  // Separate pinned and unpinned conversations
  const { pinnedConversations, unpinnedConversations } = useMemo(() => {
    const pinned = filteredConversations.filter(c => c.is_pinned);
    const unpinned = filteredConversations.filter(c => !c.is_pinned);
    return { pinnedConversations: pinned, unpinnedConversations: unpinned };
  }, [filteredConversations]);

  // Group unpinned conversations by date
  const groupedConversations = useMemo(() => {
    return groupByDate(unpinnedConversations);
  }, [unpinnedConversations]);

  const handleStartRename = useCallback((conv: Conversation, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }, []);

  const handleSaveRename = useCallback(() => {
    if (editingId && editingTitle.trim()) {
      onRenameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  }, [editingId, editingTitle, onRenameConversation]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
  }, []);

  const handleDeleteClick = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete);
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  }, [conversationToDelete, onDeleteConversation]);

  const handleTogglePin = useCallback((id: string, isPinned: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onPinConversation?.(id, isPinned);
  }, [onPinConversation]);

  const renderConversationItem = (conversation: Conversation) => {
    const isEditing = editingId === conversation.id;
    const isActive = activeConversationId === conversation.id;

    return (
      <div
        key={conversation.id}
        className={cn(
          "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/50"
        )}
        onClick={() => !isEditing && onSelectConversation(conversation)}
      >
        {isEditing ? (
          <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename();
                if (e.key === "Escape") handleCancelRename();
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleSaveRename}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleCancelRename}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            {conversation.is_pinned && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 min-w-0 truncate text-sm text-sidebar-foreground">
              {conversation.title || "Без названия"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6 shrink-0 relative z-10",
                    isActive 
                      ? "opacity-70 hover:opacity-100" 
                      : "opacity-0 group-hover:opacity-70 hover:!opacity-100"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin(conversation.id, !conversation.is_pinned);
                }}>
                  {conversation.is_pinned ? (
                    <>
                      <PinOff className="h-4 w-4 mr-2" />
                      Открепить
                    </>
                  ) : (
                    <>
                      <Pin className="h-4 w-4 mr-2" />
                      Закрепить
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(conversation);
                }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Переименовать
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => handleDeleteClick(conversation.id, e)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header with new chat button */}
      <div className="p-3 border-b border-sidebar-border">
        <Button
          onClick={onNewChat}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          Новый чат
        </Button>
      </div>

      {/* Search and Filter Controls */}
      <div className="p-2 space-y-2 border-b border-sidebar-border">
        {/* Search toggle and input */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (isSearchOpen) setSearchQuery("");
            }}
          >
            {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
          
          {isSearchOpen && (
            <Input
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          )}
          
          {!isSearchOpen && (
            <Select value={selectedRoleFilter} onValueChange={onRoleFilterChange}>
              <SelectTrigger className="h-8 flex-1 text-sm">
                <div className="flex items-center gap-2">
                  <Filter className="h-3 w-3" />
                  <SelectValue placeholder="Все ассистенты" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все ассистенты</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {/* Pinned conversations section */}
          {pinnedConversations.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Pin className="h-3 w-3" />
                Закреплённые
              </div>
              <div className="space-y-0.5">
                {pinnedConversations.map(renderConversationItem)}
              </div>
            </div>
          )}

          {/* Grouped conversations by date */}
          {Array.from(groupedConversations.entries()).map(([group, convs]) => (
            <div key={group}>
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {group}
              </div>
              <div className="space-y-0.5">
                {convs.map(renderConversationItem)}
              </div>
            </div>
          ))}

          {filteredConversations.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{searchQuery ? "Чаты не найдены" : "Нет чатов"}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить чат?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Чат и вся история сообщений будут удалены навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
