import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Building2, MapPin, Phone, Mail, Globe, Calendar, Users, Shield,
  AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Copy,
  Briefcase, Hash, FileText, Scale
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ReputationCompanyData {
  // Basic info
  Name?: string;
  ShortName?: string;
  FullName?: string;
  Inn?: string;
  Ogrn?: string;
  Kpp?: string;
  Status?: string;
  StatusText?: string;
  Type?: string;
  RegistrationDate?: string;
  LiquidationDate?: string;
  Address?: string;
  
  // Capital
  AuthorizedCapital?: number | string;
  Capital?: { Value?: number; Date?: string } | any;
  
  // Activity
  MainActivityCode?: string;
  MainActivityName?: string;
  MainActivity?: { Code?: string; Name?: string } | any;
  ActivityTypes?: any[];
  Okved?: string;
  OkvedName?: string;
  
  // People
  Director?: string;
  DirectorName?: string;
  DirectorTitle?: string;
  Managers?: any[];
  Head?: { Name?: string; Position?: string } | any;
  Founders?: any[];
  
  // Contacts
  Phones?: string[];
  Phone?: string;
  Emails?: string[];
  Email?: string;
  Website?: string;
  Websites?: string[];
  
  // Scores / risks
  ReliabilityScore?: number;
  RiskLevel?: string;
  Score?: number;
  
  // Raw data for copying
  [key: string]: any;
}

interface ReputationCompanyCardProps {
  data: ReputationCompanyData;
  compact?: boolean;
}

function getStatusColor(status?: string): string {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes('действ') || s === 'active') return "default";
  if (s.includes('ликвид') || s.includes('прекращ') || s === 'liquidated') return "destructive";
  return "secondary";
}

function getStatusIcon(status?: string) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes('действ') || s === 'active') return <CheckCircle className="h-3.5 w-3.5" />;
  if (s.includes('ликвид') || s.includes('прекращ')) return <XCircle className="h-3.5 w-3.5" />;
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

function extractField(data: any, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = data[key];
    if (val !== undefined && val !== null && val !== '') {
      if (typeof val === 'object' && val.Name) return val.Name;
      if (typeof val === 'object' && val.Value) return String(val.Value);
      return String(val);
    }
  }
  return undefined;
}

function InfoRow({ icon: Icon, label, value, mono }: { icon?: any; label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className={cn("text-foreground", mono && "font-mono text-xs")}>{value}</span>
      </div>
    </div>
  );
}

export function ReputationCompanyCard({ data, compact = false }: ReputationCompanyCardProps) {
  const [expanded, setExpanded] = useState(!compact);

  const name = extractField(data, 'Name', 'ShortName', 'FullName') || 'Без названия';
  const inn = extractField(data, 'Inn');
  const ogrn = extractField(data, 'Ogrn');
  const kpp = extractField(data, 'Kpp');
  const status = extractField(data, 'StatusText', 'Status');
  const address = extractField(data, 'Address');
  const regDate = extractField(data, 'RegistrationDate');
  const entityType = extractField(data, 'Type');

  // Director
  const director = extractField(data, 'DirectorName', 'Director')
    || (data.Head?.Name)
    || (data.Managers?.[0]?.Name);
  const directorTitle = extractField(data, 'DirectorTitle')
    || (data.Head?.Position)
    || (data.Managers?.[0]?.Position)
    || 'Руководитель';

  // Activity
  const activityCode = extractField(data, 'MainActivityCode', 'Okved')
    || (data.MainActivity?.Code);
  const activityName = extractField(data, 'MainActivityName', 'OkvedName')
    || (data.MainActivity?.Name);

  // Capital
  const capital = data.AuthorizedCapital
    || (data.Capital?.Value)
    || extractField(data, 'Capital');

  // Contacts
  const phones = data.Phones || (data.Phone ? [data.Phone] : []);
  const emails = data.Emails || (data.Email ? [data.Email] : []);
  const websites = data.Websites || (data.Website ? [data.Website] : []);

  // Founders
  const founders = data.Founders || [];

  // Additional OKVED
  const additionalActivities = data.ActivityTypes?.slice(0, 5) || [];

  const handleCopyAll = () => {
    const lines = [
      name,
      inn && `ИНН: ${inn}`,
      ogrn && `ОГРН: ${ogrn}`,
      kpp && `КПП: ${kpp}`,
      status && `Статус: ${status}`,
      address && `Адрес: ${address}`,
      director && `${directorTitle}: ${director}`,
      activityCode && `ОКВЭД: ${activityCode} — ${activityName || ''}`,
      capital && `Уставный капитал: ${typeof capital === 'number' ? capital.toLocaleString('ru-RU') + ' ₽' : capital}`,
      phones.length > 0 && `Телефоны: ${phones.join(', ')}`,
      emails.length > 0 && `Email: ${emails.join(', ')}`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      toast.success('Данные скопированы');
    }).catch(() => {
      toast.error('Ошибка копирования');
    });
  };

  return (
    <Card className="my-3 overflow-hidden border-primary/20 bg-card">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base leading-tight text-foreground">
                {name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {status && (
                  <Badge variant={getStatusColor(status) as any} className="text-xs gap-1">
                    {getStatusIcon(status)}
                    {status}
                  </Badge>
                )}
                {entityType && (
                  <Badge variant="outline" className="text-xs">
                    {entityType === 'Company' ? 'Юр. лицо' : entityType === 'Entrepreneur' ? 'ИП' : entityType === 'Person' ? 'Физ. лицо' : entityType}
                  </Badge>
                )}
                {regDate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {regDate}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyAll} title="Скопировать данные">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {compact && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Requisites - always visible */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          <InfoRow icon={Hash} label="ИНН" value={inn} mono />
          <InfoRow icon={Hash} label="ОГРН" value={ogrn} mono />
          {kpp && <InfoRow icon={Hash} label="КПП" value={kpp} mono />}
          {address && <InfoRow icon={MapPin} label="Адрес" value={address} />}
        </div>
      </div>

      {/* Expandable sections */}
      {expanded && (
        <>
          <Separator />

          {/* Director / Management */}
          {director && (
            <div className="px-4 py-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Руководство
              </h4>
              <div className="space-y-1">
                <div className="text-sm">
                  <span className="text-muted-foreground">{directorTitle}: </span>
                  <span className="font-medium text-foreground">{director}</span>
                </div>
                {data.Managers && data.Managers.length > 1 && data.Managers.slice(1, 4).map((m: any, i: number) => (
                  <div key={i} className="text-sm">
                    <span className="text-muted-foreground">{m.Position || 'Участник'}: </span>
                    <span className="text-foreground">{m.Name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Founders */}
          {founders.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5" />
                  Учредители
                </h4>
                <div className="space-y-1">
                  {founders.slice(0, 5).map((f: any, i: number) => (
                    <div key={i} className="text-sm flex items-center justify-between">
                      <span className="text-foreground">{f.Name || f.FullName || 'Без имени'}</span>
                      {f.Share && (
                        <Badge variant="outline" className="text-xs ml-2">
                          {typeof f.Share === 'number' ? `${f.Share}%` : f.Share}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Activity */}
          {(activityCode || activityName) && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Деятельность
                </h4>
                <div className="space-y-1">
                  <div className="text-sm">
                    {activityCode && <Badge variant="outline" className="text-xs mr-2 font-mono">{activityCode}</Badge>}
                    <span className="text-foreground">{activityName}</span>
                  </div>
                  {additionalActivities.length > 0 && additionalActivities.map((a: any, i: number) => (
                    <div key={i} className="text-sm text-muted-foreground">
                      {a.Code && <span className="font-mono text-xs mr-1">{a.Code}</span>}
                      {a.Name || a.name}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Capital */}
          {capital && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Уставный капитал
                </h4>
                <p className="text-sm font-medium text-foreground">
                  {typeof capital === 'number' ? capital.toLocaleString('ru-RU') + ' ₽' : capital}
                </p>
              </div>
            </>
          )}

          {/* Contacts */}
          {(phones.length > 0 || emails.length > 0 || websites.length > 0) && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Контакты
                </h4>
                <div className="space-y-1">
                  {phones.map((p: string, i: number) => (
                    <InfoRow key={`p-${i}`} icon={Phone} label="Тел" value={p} />
                  ))}
                  {emails.map((e: string, i: number) => (
                    <InfoRow key={`e-${i}`} icon={Mail} label="Email" value={e} />
                  ))}
                  {websites.map((w: string, i: number) => (
                    <div key={`w-${i}`} className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={w.startsWith('http') ? w : `https://${w}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        {w}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Risk / Score */}
          {(data.ReliabilityScore !== undefined || data.RiskLevel || data.Score !== undefined) && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Надежность
                </h4>
                <div className="flex items-center gap-3">
                  {(data.ReliabilityScore !== undefined || data.Score !== undefined) && (
                    <Badge variant="outline" className="text-sm font-medium">
                      Рейтинг: {data.ReliabilityScore ?? data.Score}
                    </Badge>
                  )}
                  {data.RiskLevel && (
                    <Badge 
                      variant={data.RiskLevel.toLowerCase().includes('высок') ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {data.RiskLevel}
                    </Badge>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}