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
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DepartmentChat, AgentMention } from "@/types/departmentChat";

interface DepartmentChatSidebarProps {
  departmentChats: DepartmentChat[];
  activeChatId: string | null;
  onSelectChat: (chat: DepartmentChat) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onPinChat?: (id: string, isPinned: boolean) => void;
  availableAgents: AgentMention[];
  selectedAgentFilter: string;
  onAgentFilterChange: (agentId: string) => void;
  chatAgentsMap?: Map<string, string[]>;
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

// Group chats by date
function groupByDate(chats: DepartmentChat[]): Map<string, DepartmentChat[]> {
  const groups = new Map<string, DepartmentChat[]>();
  const order = ["Сегодня", "Вчера", "Последние 7 дней", "Последние 30 дней", "Ранее"];
  
  // Initialize groups in order
  order.forEach(group => groups.set(group, []));
  
  chats.forEach(chat => {
    const group = getDateGroup(chat.updated_at);
    const existing = groups.get(group) || [];
    existing.push(chat);
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

export function DepartmentChatSidebar({
  departmentChats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onPinChat,
  availableAgents,
  selectedAgentFilter,
  onAgentFilterChange,
  chatAgentsMap = new Map(),
}: DepartmentChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // Filter chats by search and agent
  const filteredChats = useMemo(() => {
    let filtered = departmentChats;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(chat =>
        chat.title.toLowerCase().includes(query)
      );
    }

    // Filter by agent - check agents used in messages
    if (selectedAgentFilter !== "all") {
      filtered = filtered.filter(chat => {
        const messageAgents = chatAgentsMap.get(chat.id) || [];
        return messageAgents.includes(selectedAgentFilter);
      });
    }

    return filtered;
  }, [departmentChats, searchQuery, selectedAgentFilter, chatAgentsMap]);

  // Separate pinned and unpinned chats
  const { pinnedChats, unpinnedChats } = useMemo(() => {
    const pinned = filteredChats.filter(c => c.is_pinned);
    const unpinned = filteredChats.filter(c => !c.is_pinned);
    return { pinnedChats: pinned, unpinnedChats: unpinned };
  }, [filteredChats]);

  // Group unpinned chats by date
  const groupedChats = useMemo(() => {
    return groupByDate(unpinnedChats);
  }, [unpinnedChats]);

  const handleStartRename = useCallback((chat: DepartmentChat, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(chat.id);
    setEditingTitle(chat.title);
  }, []);

  const handleSaveRename = useCallback(() => {
    if (editingId && editingTitle.trim()) {
      onRenameChat(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  }, [editingId, editingTitle, onRenameChat]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
  }, []);

  const handleDeleteClick = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setChatToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (chatToDelete) {
      onDeleteChat(chatToDelete);
    }
    setDeleteDialogOpen(false);
    setChatToDelete(null);
  }, [chatToDelete, onDeleteChat]);

  const handleTogglePin = useCallback((id: string, isPinned: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onPinChat?.(id, isPinned);
  }, [onPinChat]);

  const renderChatItem = (chat: DepartmentChat) => {
    const isEditing = editingId === chat.id;
    const isActive = activeChatId === chat.id;

    return (
      <div
        key={chat.id}
        className={cn(
          "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors overflow-hidden",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/50"
        )}
        onClick={() => !isEditing && onSelectChat(chat)}
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
            {chat.is_pinned && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 text-sm text-sidebar-foreground min-w-0 truncate">
              {chat.title || "Чат отдела"}
            </span>
            <div className="shrink-0 w-6 flex-none">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-50 hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 bg-popover">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePin(chat.id, !chat.is_pinned);
                  }}>
                    {chat.is_pinned ? (
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
                    handleStartRename(chat);
                  }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Переименовать
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => handleDeleteClick(chat.id, e)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
            <Select value={selectedAgentFilter} onValueChange={onAgentFilterChange}>
              <SelectTrigger className="h-8 flex-1 text-sm">
                <div className="flex items-center gap-2">
                  <Filter className="h-3 w-3" />
                  <SelectValue placeholder="Все агенты" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">Все агенты</SelectItem>
                {availableAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    @{agent.mention_trigger || agent.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Chats list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {/* Pinned chats section */}
          {pinnedChats.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Pin className="h-3 w-3" />
                Закреплённые
              </div>
              <div className="space-y-0.5">
                {pinnedChats.map(renderChatItem)}
              </div>
            </div>
          )}

          {/* Grouped chats by date */}
          {Array.from(groupedChats.entries()).map(([group, chats]) => (
            <div key={group}>
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {group}
              </div>
              <div className="space-y-0.5">
                {chats.map(renderChatItem)}
              </div>
            </div>
          ))}

          {filteredChats.length === 0 && (
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
            <AlertDialogTitle>Удалить чат отдела?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Чат и вся история сообщений будут удалены для всех участников отдела.
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
