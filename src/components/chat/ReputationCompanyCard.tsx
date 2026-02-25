import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Building2, MapPin, Phone, Mail, Globe, Calendar, Users, Shield,
  AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Copy,
  Briefcase, Hash, FileText, Scale, Award, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Safe string converter — handles objects, arrays, primitives
function safeString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val.Name) return String(val.Name);
    if (val.Value) return String(val.Value);
    if (val.Text) return String(val.Text);
    if (val.Description) return String(val.Description);
    if (Array.isArray(val)) return val.map(safeString).join(', ');
    try { return JSON.stringify(val); } catch { return '[object]'; }
  }
  return String(val);
}

interface ReputationCompanyData {
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
  AuthorizedCapital?: number | string;
  Capital?: { Value?: number; Date?: string } | any;
  MainActivityCode?: string;
  MainActivityName?: string;
  MainActivity?: { Code?: string; Name?: string } | any;
  ActivityTypes?: any[];
  Okved?: string;
  OkvedName?: string;
  Director?: string;
  DirectorName?: string;
  DirectorTitle?: string;
  Managers?: any[];
  Head?: { Name?: string; Position?: string } | any;
  Founders?: any[];
  Phones?: string[];
  Phone?: string;
  Emails?: string[];
  Email?: string;
  Website?: string;
  Websites?: string[];
  ReliabilityScore?: number;
  RiskLevel?: string;
  Score?: number;
  _trademarks?: any[];
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
      return safeString(val);
    }
  }
  return undefined;
}

// Build FIPS URL for intellectual property
function buildFipsUrl(item: any): string {
  const regNum = item.RegistrationNumber || item.Number || item.RegNumber;
  if (!regNum) return '';
  const registry = item.Registry || '';
  const dbMap: Record<string, string> = {
    RUTM: 'RUTM', RUPM: 'RUPM', RUDE: 'RUDE', RSPODB: 'RSPODB',
  };
  const db = dbMap[registry] || (item._source === 'patents' ? 'RUTM' : 'RUTM');
  return `https://fips.ru/registers-doc-view/fips_servlet?DB=${db}&DocNumber=${encodeURIComponent(regNum)}&TypeFile=html`;
}

function LinkableValue({ label, value, href, mono, icon: Icon }: { label: string; value: string; href?: string; mono?: boolean; icon?: any }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("text-primary hover:underline inline-flex items-center gap-1", mono && "font-mono text-xs")}
          >
            {value}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className={cn("text-foreground", mono && "font-mono text-xs")}>{value}</span>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono }: { icon?: any; label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className={cn("text-foreground break-words", mono && "font-mono text-xs")}>{value}</span>
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
  const status = extractField(data, 'StatusText', 'StatusName') || (typeof data.Status === 'string' ? data.Status : (data.Status && typeof data.Status === 'object' ? safeString(data.Status) : undefined));
  const address = extractField(data, 'Address');
  const regDate = extractField(data, 'RegistrationDate');
  const liqDate = extractField(data, 'LiquidationDate');
  const entityType = extractField(data, 'Type');

  const director = extractField(data, 'DirectorName', 'Director')
    || (data.Head && typeof data.Head === 'object' ? safeString(data.Head.Name || data.Head.Fio || data.Head) : undefined)
    || (Array.isArray(data.Managers) && data.Managers[0] ? safeString(data.Managers[0].Name) : undefined);
  const directorTitle = extractField(data, 'DirectorTitle')
    || (data.Head && typeof data.Head === 'object' ? data.Head.Position : undefined)
    || (Array.isArray(data.Managers) && data.Managers[0] ? data.Managers[0].Position : undefined)
    || 'Руководитель';

  const activityCode = extractField(data, 'MainActivityCode', 'Okved')
    || (data.MainActivity && typeof data.MainActivity === 'object' ? data.MainActivity.Code : undefined);
  const activityName = extractField(data, 'MainActivityName', 'OkvedName')
    || (data.MainActivity && typeof data.MainActivity === 'object' ? data.MainActivity.Name : undefined);

  const capital = data.AuthorizedCapital
    || (data.Capital && typeof data.Capital === 'object' ? data.Capital.Value : data.Capital);

  const phones = Array.isArray(data.Phones) ? data.Phones : (data.Phone ? [data.Phone] : []);
  const emails = Array.isArray(data.Emails) ? data.Emails : (data.Email ? [data.Email] : []);
  const websites = Array.isArray(data.Websites) ? data.Websites : (data.Website ? [data.Website] : []);

  const founders = Array.isArray(data.Founders) ? data.Founders : [];
  const additionalActivities = Array.isArray(data.ActivityTypes) ? data.ActivityTypes.slice(0, 5) : [];
  const trademarks = Array.isArray(data._trademarks) ? data._trademarks : [];

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
                {liqDate && (
                  <span className="text-xs text-destructive font-medium">
                    Ликвидация: {liqDate}
                  </span>
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

      {/* Requisites - always visible, with clickable links */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {inn && (
            <LinkableValue
              icon={Hash}
              label="ИНН"
              value={inn}
              href={`https://reputation.ru/company/inn-${inn}`}
              mono
            />
          )}
          {ogrn && (
            <LinkableValue
              icon={Hash}
              label="ОГРН"
              value={ogrn}
              href={`https://reputation.ru/company/ogrn-${ogrn}`}
              mono
            />
          )}
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
                  <span className="text-muted-foreground">{safeString(directorTitle)}: </span>
                  <span className="font-medium text-foreground">{safeString(director)}</span>
                </div>
                {Array.isArray(data.Managers) && data.Managers.length > 1 && data.Managers.slice(1, 4).map((m: any, i: number) => (
                  <div key={i} className="text-sm">
                    <span className="text-muted-foreground">{safeString(m?.Position) || 'Участник'}: </span>
                    <span className="text-foreground">{safeString(m?.Name)}</span>
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
                      <span className="text-foreground">{safeString(f?.Name || f?.FullName) || 'Без имени'}</span>
                      {f?.Share && (
                        <Badge variant="outline" className="text-xs ml-2">
                          {typeof f.Share === 'number' ? `${f.Share}%` : safeString(f.Share)}
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
                      {a?.Code && <span className="font-mono text-xs mr-1">{safeString(a.Code)}</span>}
                      {safeString(a?.Name || a?.name)}
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
                  {typeof capital === 'number' ? capital.toLocaleString('ru-RU') + ' ₽' : safeString(capital)}
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
                    <InfoRow key={`p-${i}`} icon={Phone} label="Тел" value={safeString(p)} />
                  ))}
                  {emails.map((e: string, i: number) => (
                    <InfoRow key={`e-${i}`} icon={Mail} label="Email" value={safeString(e)} />
                  ))}
                  {websites.map((w: string, i: number) => {
                    const url = safeString(w);
                    return (
                      <div key={`w-${i}`} className="flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                          {url}
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Intellectual Property */}
          {trademarks.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5" />
                  Интеллектуальная собственность ({trademarks.length})
                </h4>
                <div className="space-y-2">
                  {trademarks.slice(0, 15).map((tm: any, i: number) => {
                    const regNum = tm.RegistrationNumber || tm.Number || tm.RegNumber;
                    const tmName = tm.Name || tm.Title || '';
                    const tmStatus = tm.Status || tm.StatusText;
                    const fipsUrl = buildFipsUrl(tm);
                    const source = tm._source === 'patents' ? 'Патент' : tm._source === 'applications' ? 'Заявка' : '';

                    return (
                      <div key={i} className="flex items-start justify-between gap-2 text-sm border border-border/50 rounded-md px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {regNum && fipsUrl ? (
                              <a
                                href={fipsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono text-xs inline-flex items-center gap-1"
                              >
                                №{safeString(regNum)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : regNum ? (
                              <span className="font-mono text-xs text-foreground">№{safeString(regNum)}</span>
                            ) : null}
                            {source && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {source}
                              </Badge>
                            )}
                          </div>
                          {tmName && (
                            <p className="text-foreground mt-0.5 break-words">{safeString(tmName)}</p>
                          )}
                        </div>
                        {tmStatus && (
                          <Badge
                            variant={String(tmStatus).toLowerCase().includes('действ') ? 'default' : 'secondary'}
                            className="text-[10px] shrink-0"
                          >
                            {safeString(tmStatus)}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {trademarks.length > 15 && (
                    <p className="text-xs text-muted-foreground">…и ещё {trademarks.length - 15} объектов</p>
                  )}
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
                      Рейтинг: {safeString(data.ReliabilityScore ?? data.Score)}
                    </Badge>
                  )}
                  {data.RiskLevel && (
                    <Badge
                      variant={String(data.RiskLevel).toLowerCase().includes('высок') ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {safeString(data.RiskLevel)}
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
