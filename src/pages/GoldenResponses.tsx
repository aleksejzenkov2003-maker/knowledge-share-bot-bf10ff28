import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star, Search, Trash2, Eye, BarChart3, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface GoldenResponse {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[] | null;
  notes: string | null;
  usage_count: number;
  is_active: boolean;
  created_at: string;
  role_id: string | null;
  chat_roles?: { name: string } | null;
}

export default function GoldenResponses() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedGolden, setSelectedGolden] = useState<GoldenResponse | null>(null);

  // Fetch golden responses
  const { data: goldenResponses = [], isLoading } = useQuery({
    queryKey: ["golden-responses", categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("golden_responses")
        .select("*, chat_roles(name)")
        .order("created_at", { ascending: false });

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as GoldenResponse[];
    },
  });

  // Fetch categories for filter
  const { data: categories = [] } = useQuery({
    queryKey: ["golden-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("golden_responses")
        .select("category")
        .not("category", "is", null);

      if (data) {
        return [...new Set(data.map((d) => d.category).filter(Boolean))] as string[];
      }
      return [];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("golden_responses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["golden-responses"] });
      queryClient.invalidateQueries({ queryKey: ["golden-categories"] });
      toast({ title: "Эталон удалён" });
    },
    onError: () => {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("golden_responses")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["golden-responses"] });
      toast({ title: "Статус обновлён" });
    },
  });

  // Filter by search
  const filteredResponses = goldenResponses.filter((g) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.question.toLowerCase().includes(q) ||
      g.answer.toLowerCase().includes(q) ||
      g.category?.toLowerCase().includes(q) ||
      g.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  // Stats
  const totalCount = goldenResponses.length;
  const activeCount = goldenResponses.filter((g) => g.is_active).length;
  const totalUsage = goldenResponses.reduce((sum, g) => sum + (g.usage_count || 0), 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-yellow-500" />
            Эталонные ответы
          </h1>
          <p className="text-muted-foreground">
            Библиотека образцовых ответов для обучения AI
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Всего эталонов</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Активных</CardDescription>
            <CardTitle className="text-3xl text-green-600">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Использований</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              {totalUsage}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по вопросу, ответу, тегам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredResponses.length === 0 ? (
        <Card className="p-8 text-center">
          <Star className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {searchQuery || categoryFilter !== "all"
              ? "Эталоны не найдены"
              : "Нет сохранённых эталонных ответов"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Сохраните ответ ассистента как эталон, нажав кнопку "⭐ Эталон" в чате
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Вопрос</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Теги</TableHead>
                  <TableHead>Агент</TableHead>
                  <TableHead className="text-center">Исп.</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResponses.map((golden) => (
                  <TableRow key={golden.id} className={!golden.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      <div className="max-w-[280px] truncate" title={golden.question}>
                        {golden.question}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(golden.created_at), "d MMM yyyy", { locale: ru })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {golden.category && (
                        <Badge variant="outline">{golden.category}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {golden.tags?.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {golden.tags && golden.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{golden.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {golden.chat_roles?.name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{golden.usage_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={golden.is_active ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            id: golden.id,
                            is_active: !golden.is_active,
                          })
                        }
                      >
                        {golden.is_active ? "Активен" : "Неактивен"}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedGolden(golden)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить эталон?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Это действие нельзя отменить. Эталонный ответ будет
                                удалён из библиотеки.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(golden.id)}
                              >
                                Удалить
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* View Dialog */}
      <Dialog open={!!selectedGolden} onOpenChange={() => setSelectedGolden(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Просмотр эталона
            </DialogTitle>
          </DialogHeader>
          {selectedGolden && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Вопрос
                  </h4>
                  <p className="bg-muted p-3 rounded-md">{selectedGolden.question}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Эталонный ответ
                  </h4>
                  <div className="bg-muted p-3 rounded-md whitespace-pre-wrap text-sm">
                    {selectedGolden.answer}
                  </div>
                </div>
                {selectedGolden.notes && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Заметка
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedGolden.notes}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Категория: </span>
                    <Badge variant="outline">{selectedGolden.category || "—"}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Использований: </span>
                    <span className="font-medium">{selectedGolden.usage_count}</span>
                  </div>
                </div>
                {selectedGolden.tags && selectedGolden.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedGolden.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
