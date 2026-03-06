import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Building2, MapPin, Phone, Mail, Globe, Calendar, Users, Shield,
  AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Copy,
  Briefcase, Hash, FileText, Scale, Award, ExternalLink, TrendingUp,
  Receipt, Landmark, Download, DollarSign, Search, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarkdownWithCitations } from "./MarkdownWithCitations";

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

// Unwrap {Items: [...]} → flat array
function unwrapItems(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (val.Items && Array.isArray(val.Items)) return val.Items;
  return [];
}

interface ReputationCompanyData {
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

function SectionHeader({ icon: Icon, title, badge }: { icon: any; title: string; badge?: string }) {
  return (
    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {title}
      {badge && <Badge variant="outline" className="text-[10px] ml-1">{badge}</Badge>}
    </h4>
  );
}

export function ReputationCompanyCard({ data, compact = false }: ReputationCompanyCardProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [webResult, setWebResult] = useState<string | null>(null);
  const [webCitations, setWebCitations] = useState<string[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  const name = extractField(data, 'Name', 'ShortName', 'FullName') || 'Без названия';
  const inn = extractField(data, 'Inn');
  const ogrn = extractField(data, 'Ogrn');
  const kpp = extractField(data, 'Kpp');
  const status = extractField(data, 'StatusText', 'StatusName') || (typeof data.Status === 'string' ? data.Status : (data.Status && typeof data.Status === 'object' ? safeString(data.Status) : undefined));
  
  // Address: try Addresses.Items first, then flat fields
  let address = extractField(data, 'Address');
  if (!address) {
    const addresses = unwrapItems(data.Addresses);
    const actual = addresses.find((a: any) => a.IsActual) || addresses[0];
    if (actual) address = actual.UnsplittedAddress || actual.Address || safeString(actual);
  }

  const regDate = extractField(data, 'RegistrationDate');
  const liqDate = extractField(data, 'LiquidationDate');
  const entityType = extractField(data, 'Type');

  // Director: try Managers.Items[0].Entity first
  let director: string | undefined;
  let directorTitle = 'Руководитель';
  const rawManagers = unwrapItems(data.Managers);
  
  if (data.DirectorName) {
    director = safeString(data.DirectorName);
    directorTitle = safeString(data.DirectorTitle) || 'Руководитель';
  } else if (rawManagers.length > 0 && rawManagers[0].Entity) {
    director = safeString(rawManagers[0].Entity?.Name || rawManagers[0].Entity?.Fio);
    const pos = Array.isArray(rawManagers[0].Position) ? rawManagers[0].Position[0]?.PositionName : rawManagers[0].Position?.PositionName;
    directorTitle = pos || 'Руководитель';
  } else if (rawManagers.length > 0 && rawManagers[0].Name) {
    director = safeString(rawManagers[0].Name);
    directorTitle = safeString(rawManagers[0].Position) || 'Руководитель';
  } else {
    director = extractField(data, 'DirectorName', 'Director')
      || (data.Head && typeof data.Head === 'object' ? safeString(data.Head.Name || data.Head.Fio || data.Head) : undefined);
    directorTitle = extractField(data, 'DirectorTitle')
      || (data.Head && typeof data.Head === 'object' ? data.Head.Position : undefined)
      || 'Руководитель';
  }

  // Managers flat array
  let managers: { Name: string; Position: string }[] = [];
  if (Array.isArray(data.Managers) && data.Managers.length > 0) {
    if (data.Managers[0].Entity) {
      managers = data.Managers.map((m: any) => ({
        Name: safeString(m.Entity?.Name || m.Name),
        Position: (Array.isArray(m.Position) ? m.Position[0]?.PositionName : m.Position?.PositionName) || safeString(m.PositionName) || '',
      }));
    } else {
      managers = data.Managers.map((m: any) => ({
        Name: safeString(m.Name || m.Fio || m),
        Position: safeString(m.Position) || '',
      }));
    }
  }

  const activityCode = extractField(data, 'MainActivityCode', 'Okved')
    || (data.MainActivity && typeof data.MainActivity === 'object' ? data.MainActivity.Code : undefined);
  const activityName = extractField(data, 'MainActivityName', 'OkvedName')
    || (data.MainActivity && typeof data.MainActivity === 'object' ? data.MainActivity.Name : undefined);

  const capital = data.AuthorizedCapital
    || (data.Capital && typeof data.Capital === 'object' ? data.Capital.Value : data.Capital);

  const phones = Array.isArray(data.Phones) ? data.Phones : (data.Phone ? [data.Phone] : []);
  const emails = Array.isArray(data.Emails) ? data.Emails : (data.Email ? [data.Email] : []);
  const websites = Array.isArray(data.Websites) ? data.Websites 
    : (Array.isArray(data.Sites) ? data.Sites 
    : (data.Website ? [data.Website] : []));

  // Founders from Shareholders.Items or flat Founders
  let founders: { Name: string; Share?: number | string }[] = [];
  const rawShareholders = unwrapItems(data.Shareholders);
  if (rawShareholders.length > 0) {
    founders = rawShareholders.map((s: any) => {
      // Share is an ARRAY [{Size, FaceValue, IsActual}]
      const shareArr = Array.isArray(s.Share) ? s.Share : (s.Share ? [s.Share] : []);
      const actualShare = shareArr.find((sh: any) => sh.IsActual) || shareArr[0];
      return {
        Name: safeString(s.Entity?.Name || s.Name || s.FullName),
        Share: actualShare?.Size ?? actualShare?.Percent ?? undefined,
      };
    });
  } else if (Array.isArray(data.Founders)) {
    founders = data.Founders.map((f: any) => ({
      Name: safeString(f.Name || f.Fio || f.FullName || f),
      Share: f.Share,
    }));
  }

  const additionalActivities = Array.isArray(data.ActivityTypes)
    ? data.ActivityTypes.slice(0, 5)
    : unwrapItems(data.ActivityTypes).slice(0, 5);
  const trademarks = Array.isArray(data._trademarks) ? data._trademarks : [];
  
  // Financial history
  const financialHistory = Array.isArray(data.FinancialHistory) ? data.FinancialHistory : [];
  
  // Link for reputation.ru
  const repLink = data.Link;

  // Employees
  const employeesHistory = Array.isArray(data.EmployeesHistory) ? data.EmployeesHistory : [];
  const employeesCount = data.EmployeesCount;
  const rawEmployees = unwrapItems(data.EmployeesInfo);
  const empHistory = employeesHistory.length > 0
    ? employeesHistory
    : rawEmployees.map((e: any) => {
        let year = e.Year || '';
        if (!year && e.Date) { const m = String(e.Date).match(/^(\d{4})/); if (m) year = m[1]; }
        if (!year && e.Period) year = String(e.Period);
        return { Year: year, Count: e.Count ?? e.Number ?? e.Value ?? '' };
      }).sort((a: any, b: any) => String(b.Year).localeCompare(String(a.Year)));

  // RSMP
  const rsmpCategory = data.RsmpCategory || (() => {
    const raw = unwrapItems(data.Rsmp);
    return raw[0]?.Category || raw[0]?.CategoryName || '';
  })();
  const rsmpDate = data.RsmpDate || (() => {
    const raw = unwrapItems(data.Rsmp);
    return raw[0]?.InclusionDate || raw[0]?.Date || '';
  })();

  // Taxation
  let taxationTypes: string[] = Array.isArray(data.TaxationTypes) ? data.TaxationTypes : [];
  if (taxationTypes.length === 0) {
    const rawTax = unwrapItems(data.Taxation);
    if (rawTax.length > 0) {
      const types = rawTax[0].Types || rawTax[0].TaxTypes;
      taxationTypes = Array.isArray(types) ? types.map((t: any) => typeof t === 'object' ? (t.Name || t.Type || '') : String(t)) : [];
      if (!taxationTypes.length && rawTax[0].Name) taxationTypes = [rawTax[0].Name];
    }
  }

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

  const handleWebSearch = async () => {
    setWebLoading(true);
    setWebError(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('reputation-web-search', {
        body: { companyName: name, inn, ogrn },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setWebResult(result.content || '');
      setWebCitations(result.citations || []);
    } catch (err: any) {
      setWebError(err.message || 'Ошибка поиска');
    } finally {
      setWebLoading(false);
    }
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
            {(ogrn || inn) && (
              <a href={`https://egrul.nalog.ru/index.html?query=${ogrn || inn}`} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Выписка ЕГРЮЛ">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
            {repLink && (
              <a href={`https://reputation.ru/${repLink}`} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Reputation.ru">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
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
          {inn && (
            <LinkableValue icon={Hash} label="ИНН" value={inn}
              href={`https://reputation.ru/company/inn-${inn}`} mono />
          )}
          {ogrn && (
            <LinkableValue icon={Hash} label="ОГРН" value={ogrn}
              href={`https://reputation.ru/company/ogrn-${ogrn}`} mono />
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
          {(director || managers.length > 0) && (
            <div className="px-4 py-3">
              <SectionHeader icon={Users} title="Руководство" />
              <div className="space-y-1">
                {director && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">{safeString(directorTitle)}: </span>
                    <span className="font-medium text-foreground">{safeString(director)}</span>
                  </div>
                )}
                {managers.slice(director ? 1 : 0, 4).map((m, i) => (
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
                <SectionHeader icon={Scale} title="Учредители" badge={String(founders.length)} />
                <div className="space-y-1">
                  {founders.slice(0, 5).map((f, i) => (
                    <div key={i} className="text-sm flex items-center justify-between">
                      <span className="text-foreground">{f.Name || 'Без имени'}</span>
                      {f.Share !== undefined && f.Share !== null && (
                        <Badge variant="outline" className="text-xs ml-2">
                          {typeof f.Share === 'number' ? `${f.Share.toFixed(2)}%` : safeString(f.Share)}
                        </Badge>
                      )}
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
                <SectionHeader icon={FileText} title="Уставный капитал" />
                <p className="text-sm font-medium text-foreground">
                  {typeof capital === 'number' ? capital.toLocaleString('ru-RU') + ' ₽' : safeString(capital)}
                </p>
              </div>
            </>
          )}

          {/* Employees */}
          {(employeesCount !== undefined || empHistory.length > 0) && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <SectionHeader icon={TrendingUp} title="Сотрудники" 
                  badge={employeesCount !== undefined ? `${safeString(employeesCount)} чел.` : undefined} />
                {empHistory.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {empHistory.slice(0, 6).map((e: any, i: number) => (
                      <div key={i} className="text-sm bg-muted/50 rounded-md px-2.5 py-1.5 text-center">
                        <div className="text-muted-foreground text-xs">{safeString(e.Year)}</div>
                        <div className="font-medium text-foreground">{safeString(e.Count)} чел.</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Financial History */}
          {financialHistory.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <SectionHeader icon={DollarSign} title="Финансы" badge={`${financialHistory.length} лет`} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left text-xs font-medium text-muted-foreground py-1.5 pr-4">Год</th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-1.5 px-2">Выручка</th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-1.5 pl-2">Прибыль</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financialHistory.slice(0, 8).map((f: any, i: number) => {
                        const revenue = f.Revenue !== undefined && f.Revenue !== null ? Number(f.Revenue) : null;
                        const profit = f.Profit !== undefined && f.Profit !== null ? Number(f.Profit) : null;
                        const formatMoney = (v: number | null) => {
                          if (v === null) return '—';
                          if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)} млрд ₽`;
                          if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)} млн ₽`;
                          if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)} тыс ₽`;
                          return `${v.toLocaleString('ru-RU')} ₽`;
                        };
                        return (
                          <tr key={i} className="border-b border-border/30 last:border-0">
                            <td className="py-1.5 pr-4 text-foreground font-medium">{safeString(f.Year)}</td>
                            <td className="py-1.5 px-2 text-right text-foreground">{formatMoney(revenue)}</td>
                            <td className={cn("py-1.5 pl-2 text-right font-medium", profit !== null && profit < 0 ? "text-destructive" : "text-foreground")}>
                              {formatMoney(profit)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* RSMP (МСП) */}
          {rsmpCategory && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <SectionHeader icon={Landmark} title="Категория МСП" />
                <div className="text-sm">
                  <Badge variant="outline" className="text-xs">{safeString(rsmpCategory)}</Badge>
                  {rsmpDate && <span className="text-muted-foreground ml-2 text-xs">с {safeString(rsmpDate)}</span>}
                </div>
              </div>
            </>
          )}

          {/* Taxation */}
          {taxationTypes.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <SectionHeader icon={Receipt} title="Налогообложение" />
                <div className="flex flex-wrap gap-1.5">
                  {taxationTypes.map((t, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
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
                <SectionHeader icon={Briefcase} title="Деятельность" />
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

          {/* Contacts */}
          {(phones.length > 0 || emails.length > 0 || websites.length > 0) && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <SectionHeader icon={Phone} title="Контакты" />
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
                <SectionHeader icon={Award} title="Интеллектуальная собственность" badge={String(trademarks.length)} />
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
                              <a href={fipsUrl} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline font-mono text-xs inline-flex items-center gap-1">
                                №{safeString(regNum)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : regNum ? (
                              <span className="font-mono text-xs text-foreground">№{safeString(regNum)}</span>
                            ) : null}
                            {source && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{source}</Badge>
                            )}
                          </div>
                          {tmName && <p className="text-foreground mt-0.5 break-words">{safeString(tmName)}</p>}
                        </div>
                        {tmStatus && (
                          <Badge
                            variant={String(tmStatus).toLowerCase().includes('действ') ? 'default' : 'secondary'}
                            className="text-[10px] shrink-0">
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
                <SectionHeader icon={Shield} title="Надежность" />
                <div className="flex items-center gap-3">
                  {(data.ReliabilityScore !== undefined || data.Score !== undefined) && (
                    <Badge variant="outline" className="text-sm font-medium">
                      Рейтинг: {safeString(data.ReliabilityScore ?? data.Score)}
                    </Badge>
                  )}
                  {data.RiskLevel && (
                    <Badge
                      variant={String(data.RiskLevel).toLowerCase().includes('высок') ? 'destructive' : 'secondary'}
                      className="text-xs">
                      {safeString(data.RiskLevel)}
                    </Badge>
                  )}
                </div>
              </div>
            </>
          )}
          {/* Web Search */}
          <Separator />
          <div className="px-4 py-3">
            <SectionHeader icon={Globe} title="Интернет" />
            {!webResult && !webLoading && !webError && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWebSearch}
                className="gap-2"
              >
                <Search className="h-3.5 w-3.5" />
                Найти в интернете
              </Button>
            )}
            {webLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Поиск информации...
              </div>
            )}
            {webError && (
              <div className="text-sm text-destructive py-1">{webError}</div>
            )}
            {webResult && (
              <div className="text-sm mt-2 prose-sm max-w-none">
                <MarkdownWithCitations
                  content={webResult}
                  perplexityCitations={webCitations}
                />
                {webCitations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {webCitations.map((url, i) => {
                      let domain = '';
                      try { domain = new URL(url).hostname.replace('www.', ''); } catch { domain = url; }
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs bg-muted hover:bg-muted/80 px-2 py-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        >
                          [{i + 1}] {domain}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
