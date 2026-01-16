import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Eye, Download } from "lucide-react";

interface ChatLog {
  id: string;
  prompt: string | null;
  response: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  response_time_ms: number | null;
  created_at: string;
  user_id: string | null;
  department_id: string | null;
  provider_id: string | null;
  metadata: any;
  department?: { name: string } | null;
  provider?: { name: string } | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Department {
  id: string;
  name: string;
}

const PAGE_SIZE = 20;

export default function ChatLogs() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filterDepartment, setFilterDepartment] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<ChatLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, filterDepartment]);

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("id, name").order("name");
    setDepartments(data || []);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("chat_logs")
        .select(`
          *,
          department:departments(name),
          provider:ai_providers(name)
        `, { count: "exact" });

      if (filterDepartment) {
        query = query.eq("department_id", filterDepartment);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      setLogs(data || []);
      setTotalCount(count || 0);

      // Fetch profiles for user_ids
      const userIds = [...new Set((data || []).map((l) => l.user_id).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        
        const profilesMap = new Map<string, Profile>();
        (profilesData || []).forEach((p) => profilesMap.set(p.id, p));
        setProfiles(profilesMap);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (log: ChatLog) => {
    setSelectedLog(log);
    setDetailsOpen(true);
  };

  const handleExportCSV = () => {
    const headers = ["Дата", "Пользователь", "Отдел", "Промпт", "Ответ", "Токены", "Время (мс)"];
    const rows = logs.map((log) => {
      const profile = log.user_id ? profiles.get(log.user_id) : null;
      return [
        format(new Date(log.created_at), "dd.MM.yyyy HH:mm"),
        profile?.full_name || profile?.email || "-",
        log.department?.name || "-",
        `"${(log.prompt || "").replace(/"/g, '""')}"`,
        `"${(log.response || "").replace(/"/g, '""')}"`,
        log.total_tokens || 0,
        log.response_time_ms || 0,
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  const truncateText = (text: string | null, maxLength: number = 100) => {
    if (!text) return "-";
    return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Логи чатов</h1>
          <p className="text-muted-foreground">
            История запросов к AI
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Экспорт CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>История запросов</CardTitle>
              <CardDescription>
                Всего записей: {totalCount}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Input
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48"
              />
              <Select
                value={filterDepartment || "_all"}
                onValueChange={(value) => {
                  setFilterDepartment(value === "_all" ? "" : value);
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Все отделы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Все отделы</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Записи не найдены
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Отдел</TableHead>
                    <TableHead>Промпт</TableHead>
                    <TableHead>Токены</TableHead>
                    <TableHead>Время</TableHead>
                    <TableHead className="w-16">Детали</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs
                    .filter((log) => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      const profile = log.user_id ? profiles.get(log.user_id) : null;
                      return (
                        log.prompt?.toLowerCase().includes(q) ||
                        log.response?.toLowerCase().includes(q) ||
                        profile?.full_name?.toLowerCase().includes(q) ||
                        profile?.email?.toLowerCase().includes(q)
                      );
                    })
                    .map((log) => {
                      const profile = log.user_id ? profiles.get(log.user_id) : null;
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                          </TableCell>
                          <TableCell>
                            {profile?.full_name || profile?.email || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        <TableCell>
                          {log.department ? (
                            <Badge variant="outline">{log.department.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm">
                          {truncateText(log.prompt, 80)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span>{log.total_tokens || 0}</span>
                            <span className="text-muted-foreground">
                              {log.prompt_tokens || 0} / {log.completion_tokens || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.response_time_ms ? `${log.response_time_ms}ms` : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewDetails(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}

                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Страница {page + 1} из {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Детали запроса</DialogTitle>
          </DialogHeader>
          {selectedLog && (() => {
            const selectedProfile = selectedLog.user_id ? profiles.get(selectedLog.user_id) : null;
            return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Дата:</span>{" "}
                  {format(new Date(selectedLog.created_at), "dd.MM.yyyy HH:mm:ss", { locale: ru })}
                </div>
                <div>
                  <span className="font-medium">Пользователь:</span>{" "}
                  {selectedProfile?.full_name || selectedProfile?.email || "-"}
                </div>
                <div>
                  <span className="font-medium">Отдел:</span>{" "}
                  {selectedLog.department?.name || "-"}
                </div>
                <div>
                  <span className="font-medium">Провайдер:</span>{" "}
                  {selectedLog.provider?.name || "-"}
                </div>
                <div>
                  <span className="font-medium">Токены:</span>{" "}
                  {selectedLog.total_tokens || 0} (промпт: {selectedLog.prompt_tokens || 0}, ответ: {selectedLog.completion_tokens || 0})
                </div>
                <div>
                  <span className="font-medium">Время ответа:</span>{" "}
                  {selectedLog.response_time_ms ? `${selectedLog.response_time_ms}ms` : "-"}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Промпт</h4>
                <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedLog.prompt || "-"}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Ответ</h4>
                <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {selectedLog.response || "-"}
                </div>
              </div>

              {selectedLog.metadata && (
                <div className="space-y-2">
                  <h4 className="font-medium">Метаданные</h4>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
