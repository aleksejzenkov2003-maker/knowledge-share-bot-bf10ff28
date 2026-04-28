import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink } from "lucide-react";

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

  if (isLoading) {
    return <div className="text-muted-foreground">Загрузка карточки...</div>;
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/fips-applications")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад к списку
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Запись не найдена
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate("/fips-applications")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад к списку
        </Button>
        <Badge variant={data.status === "active" ? "default" : "secondary"}>
          {data.status || "Не указан"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Карточка заявки {data.application_number || "—"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.thumbnail_url && (
            <div className="flex justify-center">
              <img
                src={data.thumbnail_url}
                alt={data.title || "Изображение заявки"}
                className="max-h-[220px] max-w-full rounded border object-contain p-2"
              />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Info label="Название" value={data.title} />
            <Info label="Номер заявки" value={data.application_number} />
            <Info label="Рег. номер" value={data.registration_number} />
            <Info label="Правообладатель" value={data.applicant_name} />
            <Info label="ИНН" value={data.applicant_inn} />
            <Info label="ОГРН" value={data.applicant_ogrn} />
            <Info label="Год" value={data.year ? String(data.year) : null} />
            <Info label="Раздел" value={data.section_code} />
            <Info label="Дата заявки" value={formatDate(data.submitted_at)} />
            <Info label="Добавлено в систему" value={formatDate(data.created_at)} />
            <Info label="Файл" value={data.file_name} />
            <Info label="Путь к файлу" value={data.file_path} />
          </div>

          <Info label="Адрес правообладателя" value={data.applicant_address} />

          {data.source_url && (
            <a
              href={data.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Источник
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Автоподтянутые поля из парсера</CardTitle>
        </CardHeader>
        <CardContent>
          {autoFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Дополнительные поля не найдены.</p>
          ) : (
            <div className="space-y-3">
              {autoFields.map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground">{key}</p>
                  <p className="text-sm font-medium break-words">
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
