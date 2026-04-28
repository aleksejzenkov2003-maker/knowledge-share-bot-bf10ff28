import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, FileText } from "lucide-react";

interface FipsApplication {
  id: string;
  application_number: string | null;
  registration_number: string | null;
  title: string | null;
  applicant_name: string | null;
  applicant_inn: string | null;
  applicant_ogrn: string | null;
  file_name: string | null;
  year: number | null;
  section_code: string | null;
  status: string | null;
  submitted_at: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

const statusLabel = (status: string | null) => {
  if (!status) return { label: "Не указан", variant: "secondary" as const };
  if (status === "active") return { label: "Активна", variant: "default" as const };
  if (status === "archive") return { label: "Архив", variant: "outline" as const };
  return { label: status, variant: "secondary" as const };
};

export default function FipsApplications() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["fips-applications", search, yearFilter, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("fips_applications")
        .select(
          "id, application_number, registration_number, title, applicant_name, applicant_inn, applicant_ogrn, file_name, year, section_code, status, submitted_at, thumbnail_url, created_at",
          { count: "exact" },
        )
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        const q = search.trim();
        query = query.or(
          `application_number.ilike.%${q}%,registration_number.ilike.%${q}%,title.ilike.%${q}%,applicant_name.ilike.%${q}%,file_name.ilike.%${q}%`,
        );
      }

      if (yearFilter !== "all") query = query.eq("year", Number(yearFilter));
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows ?? []) as FipsApplication[], count: count ?? 0 };
    },
  });

  const years = useMemo(() => {
    const set = new Set<number>();
    (data?.rows ?? []).forEach((row) => {
      if (row.year) set.add(row.year);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [data?.rows]);

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Заявки ФИПС</h1>
        <p className="text-muted-foreground">
          Поиск по файлам парсера и просмотр карточек заявок
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Номер заявки, ТЗ, правообладатель, файл..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select
                value={yearFilter}
                onValueChange={(v) => {
                  setYearFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Год" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все годы</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активна</SelectItem>
                  <SelectItem value="archive">Архив</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заявка</TableHead>
                <TableHead>Правообладатель</TableHead>
                <TableHead>Файл</TableHead>
                <TableHead>Год/Раздел</TableHead>
                <TableHead>Статус</TableHead>
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
                  const st = statusLabel(row.status);
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/fips-applications/${row.id}`)}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{row.application_number || "—"}</p>
                          <p className="text-xs text-muted-foreground">{row.title || "Без названия"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{row.applicant_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            ИНН: {row.applicant_inn || "—"} · ОГРН: {row.applicant_ogrn || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{row.file_name || "—"}</TableCell>
                      <TableCell>
                        {row.year || "—"}
                        {row.section_code ? ` / ${row.section_code}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
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
          Всего: {total} · Страница {page + 1} из {totalPages}
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
  );
}
