import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, FileText, ImageOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FipsApplication {
  id: string;
  application_number: string | null;
  registration_number: string | null;
  title: string | null;
  applicant_name: string | null;
  applicant_inn: string | null;
  applicant_ogrn: string | null;
  applicant_address: string | null;
  file_name: string | null;
  year: number | null;
  section_code: string | null;
  status: string | null;
  submitted_at: string | null;
  thumbnail_url: string | null;
  created_at: string;
  parsed_data: Record<string, unknown> | null;
}

const PAGE_SIZE = 50;
const YEARS: { year: number; count: number }[] = [
  { year: 2026, count: 56961 },
  { year: 2025, count: 109445 },
  { year: 2024, count: 146926 },
  { year: 2023, count: 37774 },
];

const pickStr = (obj: Record<string, unknown> | null | undefined, key: string): string | null => {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

const yearFromNumber = (n: string | null): number | null => {
  if (!n) return null;
  const m = n.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
};

export default function FipsApplications() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null);

  const runRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshProgress("Запуск…");
    try {
      let totalUpdated = 0;
      let iter = 0;
      while (iter < 60) {
        iter++;
        const { data: r, error } = await supabase.functions.invoke("fips-app-refresh", {
          body: { limit: 50, year: yearFilter === "all" ? null : yearFilter },
        });
        if (error) throw error;
        if (!r?.success) throw new Error(r?.error || "unknown");
        totalUpdated += r.updated || 0;
        setRefreshProgress(`Обновлено: ${totalUpdated} · осталось пустых: ${r.remaining ?? "?"}`);
        if ((r.processed || 0) === 0) break;
      }
      toast.success(`Готово. Восстановлено заявок: ${totalUpdated}`);
    } catch (e) {
      toast.error(`Ошибка: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshProgress(null), 5000);
    }
  };

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["fips-applications", debouncedSearch, yearFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("fips_applications")
        .select(
          "id, application_number, registration_number, title, applicant_name, applicant_inn, applicant_ogrn, applicant_address, file_name, year, section_code, status, submitted_at, thumbnail_url, created_at, parsed_data",
          { count: "estimated" },
        )
        .order("application_number", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (yearFilter !== "all") query = query.eq("year", yearFilter);

      if (debouncedSearch) {
        const q = debouncedSearch.replace(/[%,()]/g, "");
        if (/^\d+$/.test(q)) {
          // Префиксный поиск по номеру — использует индекс по application_number
          query = query.ilike("application_number", `${q}%`);
        } else {
          query = query.ilike("applicant_name", `%${q}%`);
        }
      }

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows ?? []) as FipsApplication[], count: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex gap-4">
      {/* Sidebar with years */}
      <aside className="w-48 shrink-0 hidden md:block">
        <Card>
          <CardContent className="p-3 space-y-1">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground uppercase">Годы</p>
            <button
              onClick={() => { setYearFilter("all"); setPage(0); }}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded text-sm flex justify-between items-center hover:bg-muted",
                yearFilter === "all" && "bg-muted font-medium",
              )}
            >
              <span>Все</span>
              <span className="text-xs text-muted-foreground">{YEARS.reduce((s, y) => s + y.count, 0)}</span>
            </button>
            {YEARS.map((y) => (
              <button
                key={y.year}
                onClick={() => { setYearFilter(y.year); setPage(0); }}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded text-sm flex justify-between items-center hover:bg-muted",
                  yearFilter === y.year && "bg-muted font-medium",
                )}
              >
                <span>{y.year}</span>
                <span className="text-xs text-muted-foreground">{y.count.toLocaleString("ru-RU")}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </aside>

      <div className="flex-1 space-y-4 min-w-0">
        <div>
          <h1 className="text-2xl font-bold">Заявки ФИПС</h1>
          <p className="text-muted-foreground">
            {yearFilter === "all" ? "Все годы" : `Год: ${yearFilter}`} · поиск по номеру или правообладателю
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Номер заявки (например, 2024) или название правообладателя"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Button onClick={runRefresh} disabled={refreshing} variant="outline" className="shrink-0">
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? (refreshProgress || "Восстановление…") : "Восстановить пустые"}
          </Button>
        </div>
        {refreshProgress && !refreshing && (
          <p className="text-xs text-muted-foreground">{refreshProgress}</p>
        )}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Знак</TableHead>
                  <TableHead>Заявка</TableHead>
                  <TableHead>Правообладатель</TableHead>
                  <TableHead className="hidden lg:table-cell">Дата</TableHead>
                  <TableHead>Год</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : (data?.rows?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      Ничего не найдено
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.rows.map((row) => {
                    const applicant = row.applicant_name || pickStr(row.parsed_data, "applicant_raw");
                    const year = row.year || yearFromNumber(row.application_number);
                    const submitted = row.submitted_at || pickStr(row.parsed_data, "submitted_date_raw");
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/fips-applications/${row.id}`)}
                      >
                        <TableCell>
                          {row.thumbnail_url ? (
                            <img
                              src={row.thumbnail_url}
                              alt=""
                              loading="lazy"
                              className="h-12 w-12 object-contain rounded border bg-background"
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                          ) : (
                            <div className="h-12 w-12 flex items-center justify-center rounded border bg-muted">
                              <ImageOff className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{row.application_number || "—"}</p>
                          {row.registration_number && (
                            <p className="text-xs text-muted-foreground">Рег: {row.registration_number}</p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[400px]">
                          <p className="truncate">{applicant || "—"}</p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {submitted ? (typeof submitted === "string" && submitted.includes("-") ? new Date(submitted).toLocaleDateString("ru-RU") : submitted) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{year || "—"}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {isFetching ? "Загрузка… " : ""}Всего: ~{total.toLocaleString("ru-RU")} · Страница {page + 1} из {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
