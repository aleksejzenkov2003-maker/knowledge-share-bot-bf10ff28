import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, ImageOff } from "lucide-react";

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

const decodeUrl = (u: string | null): string | null => {
  if (!u) return null;
  let url = u.replace(/&amp;/g, "&");
  if (url.startsWith("/")) url = `https://fips.ru${url}`;
  return url;
};

const SKIP_KEYS = new Set([
  "applicant_raw",
  "classes_raw",
  "color_specification_raw",
  "correspondence_address_raw",
  "publication_date_raw",
  "submitted_date_raw",
  "unprotected_elements_raw",
]);

interface FipsApplicationDetailsRow {
  id: string;
  application_number: string | null;
  registration_number: string | null;
  title: string | null;
  applicant_name: string | null;
  applicant_inn: string | null;
  applicant_ogrn: string | null;
  applicant_address: string | null;
  file_name: string | null;
  file_path: string | null;
  source_url: string | null;
  year: number | null;
  section_code: string | null;
  status: string | null;
  submitted_at: string | null;
  thumbnail_url: string | null;
  parsed_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
};

export default function FipsApplicationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["fips-application-details", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fips_applications")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as FipsApplicationDetailsRow;
    },
    enabled: !!id,
  });

  const autoFields = useMemo(() => {
    const payload = data?.parsed_data;
    if (!payload || typeof payload !== "object") return [];

    return Object.entries(payload).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    });
  }, [data?.parsed_data]);

  const pd = data?.parsed_data || null;
  const applicant = data?.applicant_name || pickStr(pd, "applicant_raw");
  const address = data?.applicant_address || pickStr(pd, "correspondence_address_raw");
  const classes = pickStr(pd, "classes_raw");
  const colorSpec = pickStr(pd, "color_specification_raw");
  const unprotected = pickStr(pd, "unprotected_elements_raw");
  const publicationRaw = pickStr(pd, "publication_date_raw");
  const submittedRaw = pickStr(pd, "submitted_date_raw");
  const status = pickStr(pd, "processing_status_raw");
  const year = data?.year || yearFromNumber(data?.application_number || null);
  const sourceUrl = decodeUrl(data?.source_url || null);

  const autoFields = useMemo(() => {
    if (!pd) return [] as [string, unknown][];
    return Object.entries(pd).filter(([k, v]) => {
      if (SKIP_KEYS.has(k)) return false;
      if (v === null || v === undefined) return false;
      if (typeof v === "string") return v.trim().length > 0;
      return true;
    });
  }, [pd]);

  if (isLoading) return <div className="text-muted-foreground">Загрузка карточки…</div>;
  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/fips-applications")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад к списку
        </Button>
        <Card><CardContent className="py-10 text-center text-muted-foreground">Запись не найдена</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate("/fips-applications")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад к списку
        </Button>
        <div className="flex gap-2">
          {status && <Badge variant="secondary">{status}</Badge>}
          {sourceUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Открыть на fips.ru
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Заявка {data.application_number || "—"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="shrink-0 md:w-48">
              {data.thumbnail_url ? (
                <img
                  src={data.thumbnail_url}
                  alt={data.title || "Изображение знака"}
                  className="w-full h-48 object-contain rounded border bg-background"
                  onError={(e) => {
                    const t = e.target as HTMLImageElement;
                    t.style.display = "none";
                    (t.nextElementSibling as HTMLElement | null)?.style.removeProperty("display");
                  }}
                />
              ) : null}
              {!data.thumbnail_url && (
                <div className="w-full h-48 flex items-center justify-center rounded border bg-muted">
                  <ImageOff className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="flex-1 grid gap-3 md:grid-cols-2">
              <Info label="Номер заявки" value={data.application_number} />
              <Info label="Рег. номер" value={data.registration_number} />
              <Info label="Год" value={year ? String(year) : null} />
              <Info label="Раздел" value={data.section_code} />
              <Info label="Дата заявки" value={submittedRaw || (data.submitted_at ? new Date(data.submitted_at).toLocaleDateString("ru-RU") : null)} />
              <Info label="Дата публикации" value={publicationRaw} />
              <Info label="Файл" value={data.file_name} />
              <Info label="Путь" value={data.file_path} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Info label="Правообладатель" value={applicant} />
            <Info label="ИНН" value={data.applicant_inn} />
            <Info label="ОГРН" value={data.applicant_ogrn} />
            <Info label="Название" value={data.title} />
          </div>

          <Info label="Адрес для переписки" value={address} multiline />
          {classes && <Info label="Классы МКТУ / перечень товаров и услуг" value={classes} multiline />}
          {colorSpec && <Info label="Цветовое сочетание" value={colorSpec} multiline />}
          {unprotected && <Info label="Неохраняемые элементы" value={unprotected} multiline />}
        </CardContent>
      </Card>

      {autoFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Дополнительно из парсера</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {autoFields.map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground">{key}</p>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${multiline ? "whitespace-pre-wrap break-words" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}
