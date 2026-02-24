import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Search, Building2, Copy, Bookmark, Loader2, ChevronLeft, ChevronRight, ExternalLink, Hash, Calendar, ImageIcon } from 'lucide-react';

interface SearchResult {
  Id: string;
  Type: string;
  Inn?: string;
  Ogrn?: string;
  Name?: string;
  Address?: string;
}

interface ReportData {
  search_results: SearchResult[];
  company: Record<string, unknown> | null;
  entity_type: string | null;
  additional: Record<string, unknown>;
}

const DATA_SECTIONS = [
  { key: 'requisites', label: 'Реквизиты', description: 'ИНН, ОГРН, КПП, дата регистрации' },
  { key: 'management', label: 'Руководство', description: 'ФИО директора, учредители' },
  { key: 'address', label: 'Адрес', description: 'Юридический и фактический адрес' },
  { key: 'activities', label: 'ОКВЭД', description: 'Виды деятельности' },
  { key: 'finances', label: 'Финансы', description: 'Уставный капитал, выручка' },
  { key: 'trademarks', label: 'Товарные знаки', description: 'FIPS данные' },
  { key: 'arbitration', label: 'Арбитраж', description: 'Судебные дела' },
  { key: 'contacts', label: 'Контакты', description: 'Телефон, email, сайт' },
] as const;

const STORAGE_KEY = 'reputation-selected-sections';

const Reputation = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Record<string, unknown> | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [additionalData, setAdditionalData] = useState<Record<string, unknown>>({});
  const [selectedSections, setSelectedSections] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DATA_SECTIONS.map(s => s.key);
    } catch { return DATA_SECTIONS.map(s => s.key); }
  });
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [savedReports, setSavedReports] = useState<Array<{ id: string; name: string; inn: string; created_at: string }>>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedSections));
  }, [selectedSections]);

  useEffect(() => {
    loadSavedReports();
  }, []);

  const loadSavedReports = async () => {
    const { data } = await supabase
      .from('reputation_reports')
      .select('id, name, inn, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setSavedReports(data as any);
  };

  const detectQueryType = (q: string): string => {
    const clean = q.replace(/\s/g, '');
    if (/^\d{10}$/.test(clean) || /^\d{12}$/.test(clean)) return 'ИНН';
    if (/^\d{13}$/.test(clean) || /^\d{15}$/.test(clean)) return 'ОГРН';
    return 'Название';
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSelectedCompany(null);
    setSearchResults([]);
    setCurrentResultIndex(0);

    try {
      const { data, error } = await supabase.functions.invoke('reputation-api', {
        body: { query: query.trim(), action: 'full_report' },
      });

      if (error) throw error;

      const result = data as ReportData;
      setSearchResults(result.search_results || []);
      setAdditionalData(result.additional || {});

      if (result.company) {
        setSelectedCompany(result.company);
        setEntityType(result.entity_type);
      } else if (result.search_results?.length > 1) {
        // Multiple results — show carousel, but also allow using search result data directly
        setSelectedCompany(null);
        setEntityType(null);
        toast({ title: `Найдено ${result.search_results.length} совпадений`, description: 'Выберите компанию из списка' });
      } else if (result.search_results?.length === 1) {
        // Single search result — use it directly as company data
        setSelectedCompany(result.search_results[0] as any);
        setEntityType((result.search_results[0].Type || 'Company').toLowerCase());
      } else {
        toast({ title: 'Ничего не найдено', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Ошибка поиска', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    // Search results already contain full data — use directly
    setSelectedCompany(result as any);
    setEntityType((result.Type || 'Company').toLowerCase());
  };

  const handleSaveReport = async () => {
    if (!selectedCompany || !user) return;
    const companyData = selectedCompany as any;
    try {
      const { error } = await supabase.from('reputation_reports').insert({
        user_id: user.id,
        entity_id: companyData.Id || companyData.id || '',
        entity_type: entityType || 'company',
        query: query,
        name: companyData.Name || companyData.ShortName || '',
        inn: companyData.Inn || '',
        ogrn: companyData.Ogrn || '',
        report_data: selectedCompany as any,
        selected_sections: selectedSections,
      });
      if (error) throw error;
      toast({ title: 'Отчёт сохранён' });
      loadSavedReports();
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err.message, variant: 'destructive' });
    }
  };

  const handleCopyToClipboard = () => {
    if (!selectedCompany) return;
    const text = formatCompanyText(selectedCompany, selectedSections);
    navigator.clipboard.writeText(text);
    toast({ title: 'Скопировано в буфер' });
  };

  const toggleSection = (key: string) => {
    setSelectedSections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reputation API</h1>
        <p className="text-muted-foreground">Поиск компаний, проверка контрагентов, товарные знаки</p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ИНН, ОГРН или название компании..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Найти'}
            </Button>
          </div>
          {query && (
            <div className="mt-2">
              <Badge variant="secondary">{detectQueryType(query)}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Отображаемые данные</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DATA_SECTIONS.map(section => (
              <label key={section.key} className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={selectedSections.includes(section.key)}
                  onCheckedChange={() => toggleSection(section.key)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{section.label}</div>
                  <div className="text-xs text-muted-foreground">{section.description}</div>
                </div>
              </label>
            ))}
          </CardContent>

          {savedReports.length > 0 && (
            <>
              <Separator />
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Сохранённые отчёты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {savedReports.map(r => (
                  <div key={r.id} className="text-sm p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted" onClick={() => {/* TODO: load saved report */}}>
                    <div className="font-medium truncate">{r.name || 'Без названия'}</div>
                    <div className="text-xs text-muted-foreground">{r.inn}</div>
                  </div>
                ))}
              </CardContent>
            </>
          )}
        </Card>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Multiple results carousel */}
          {searchResults.length > 1 && !selectedCompany && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Найдено {searchResults.length} совпадений</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" disabled={currentResultIndex === 0} onClick={() => setCurrentResultIndex(i => i - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {searchResults.slice(currentResultIndex, currentResultIndex + 3).map(r => (
                      <Card key={r.Id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleSelectResult(r)}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{r.Name}</div>
                              {r.Inn && <div className="text-xs text-muted-foreground">ИНН: {r.Inn}</div>}
                              {r.Ogrn && <div className="text-xs text-muted-foreground">ОГРН: {r.Ogrn}</div>}
                              {r.Address && <div className="text-xs text-muted-foreground truncate">{r.Address}</div>}
                              <Badge variant="outline" className="mt-1 text-xs">{r.Type}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Button variant="outline" size="icon" disabled={currentResultIndex + 3 >= searchResults.length} onClick={() => setCurrentResultIndex(i => i + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Company detail card */}
          {selectedCompany && (
            <CompanyDetailCard
              company={selectedCompany}
              entityType={entityType}
              additional={additionalData}
              selectedSections={selectedSections}
              onSave={handleSaveReport}
              onCopy={handleCopyToClipboard}
            />
          )}

          {!loading && !selectedCompany && searchResults.length === 0 && (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              Введите запрос для поиска компании
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface CompanyDetailCardProps {
  company: Record<string, unknown>;
  entityType: string | null;
  additional: Record<string, unknown>;
  selectedSections: string[];
  onSave: () => void;
  onCopy: () => void;
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('ru-RU'); } catch { return d; }
};

const formatArray = (v: unknown): string | null => {
  if (!v) return null;
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : null;
  return String(v);
};

const CompanyDetailCard = ({ company, entityType, selectedSections, onSave, onCopy }: CompanyDetailCardProps) => {
  const c = company as any;
  const otherNames = c.OtherNames && Array.isArray(c.OtherNames) ? c.OtherNames[0] : null;
  const [fipsTrademarks, setFipsTrademarks] = useState<any[]>([]);
  const [fipsLoading, setFipsLoading] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{c.Name || 'Компания'}</CardTitle>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                {c.Inn && <span>ИНН: {c.Inn}</span>}
                {c.Ogrn && <span>ОГРН: {c.Ogrn}</span>}
                {c.Kpp && <span>КПП: {c.Kpp}</span>}
              </div>
              {c.Status && (
                <Badge variant={c.Status?.StatusText === 'Действующая' || c.Status === 'Active' ? 'default' : 'destructive'} className="mt-1">
                  {typeof c.Status === 'object' ? (c.Status?.StatusText || c.Status?.ReasonText || 'Неизвестно') : (c.Status === 'Active' ? 'Действующая' : c.Status)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCopy}>
              <Copy className="h-4 w-4 mr-1" /> Копировать
            </Button>
            <Button variant="outline" size="sm" onClick={onSave}>
              <Bookmark className="h-4 w-4 mr-1" /> Сохранить
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={selectedSections[0] || 'requisites'}>
          <TabsList className="flex-wrap h-auto">
            {DATA_SECTIONS.filter(s => selectedSections.includes(s.key)).map(s => (
              <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>
            ))}
          </TabsList>

          {selectedSections.includes('requisites') && (
            <TabsContent value="requisites">
              <DataGrid data={[
                { label: 'Полное название', value: otherNames || c.Name },
                { label: 'Краткое название', value: c.Name },
                { label: 'ИНН', value: c.Inn },
                { label: 'ОГРН', value: c.Ogrn },
                { label: 'КПП', value: c.Kpp },
                { label: 'ОКПО', value: c.Okpo },
                { label: 'ОКТМО', value: c.Oktmo },
                { label: 'ОКАТО', value: c.Okato },
                { label: 'Дата регистрации', value: formatDate(c.RegistrationDate) },
                { label: 'Статус', value: typeof c.Status === 'object' ? (c.Status?.StatusText || c.Status?.ReasonText || 'Неизвестно') : (c.Status === 'Active' ? 'Действующая' : c.Status) },
                { label: 'Тип', value: c.Type === 'Company' ? 'Компания' : c.Type === 'Entrepreneur' ? 'ИП' : c.Type },
                { label: 'Категория МСП', value: c.RsmpCategory },
                { label: 'ПФР', value: c.Pfr },
                { label: 'ФСС', value: c.Fss },
              ]} />
            </TabsContent>
          )}

          {selectedSections.includes('management') && (
            <TabsContent value="management">
              <DataGrid data={[
                { label: 'Руководитель', value: c.ManagerName },
              ]} />
              {c.Founders && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Учредители</h4>
                  <div className="text-sm text-muted-foreground">
                    {typeof c.Founders === 'string'
                      ? c.Founders.split(';').filter(Boolean).map((f: string, i: number) => (
                          <div key={i}>{f.trim()}</div>
                        ))
                      : Array.isArray(c.Founders) && c.Founders.map((f: any, i: number) => (
                          <div key={i}>{f.Name || f}</div>
                        ))
                    }
                  </div>
                </div>
              )}
              {c.EmployeesCount != null && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground">Сотрудников</div>
                  <div className="text-sm font-medium">{c.EmployeesCount}</div>
                </div>
              )}
            </TabsContent>
          )}

          {selectedSections.includes('address') && (
            <TabsContent value="address">
              <DataGrid data={[
                { label: 'Юридический адрес', value: c.Address },
              ]} />
              {c.OtherAddresses && Array.isArray(c.OtherAddresses) && c.OtherAddresses.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Другие адреса</h4>
                  {c.OtherAddresses.map((a: string, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground mb-1">{a}</div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {selectedSections.includes('activities') && (
            <TabsContent value="activities">
              {c.MainActivityType ? (
                <div className="text-sm mb-3">
                  <span className="font-medium">Основной: </span>
                  {`${c.MainActivityType.Code} — ${c.MainActivityType.Name}`}
                </div>
              ) : null}
              {c.ActivityTypes && Array.isArray(c.ActivityTypes) && c.ActivityTypes.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Дополнительные коды:</h4>
                  {c.ActivityTypes.map((code: string, i: number) => (
                    <Badge key={i} variant="outline" className="mr-1 mb-1 text-xs">{code}</Badge>
                  ))}
                </div>
              )}
              {!c.MainActivityType && (!c.ActivityTypes || c.ActivityTypes.length === 0) && (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              )}
            </TabsContent>
          )}

          {selectedSections.includes('finances') && (
            <TabsContent value="finances">
              <DataGrid data={[
                { label: 'Уставный капитал', value: c.Capital != null ? `${Number(c.Capital).toLocaleString('ru-RU')} ₽` : null },
              ]} />
              {!c.Capital && <p className="text-sm text-muted-foreground">Нет финансовых данных</p>}
            </TabsContent>
          )}

          {selectedSections.includes('trademarks') && (
            <TabsContent value="trademarks">
              {(() => {
                const allTM = [...(c.Trademarks && Array.isArray(c.Trademarks) ? c.Trademarks : []), ...fipsTrademarks];
                return allTM.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allTM.map((tm: any, i: number) => {
                      const regNum = tm.Number || tm.RegistrationNumber || tm.reg_number;
                      const appNum = tm.ApplicationNumber || tm.app_number;
                      const fipsUrl = regNum ? `https://fips.ru/registers/trademark/${regNum}` : null;
                      const title = tm.Topic || tm.Name || tm.Description || `ТЗ №${regNum || appNum || i + 1}`;
                      const regDate = tm.RegistrationDate || tm.patent_date_begin;
                      const expDate = tm.ExpirationDate || tm.patent_date_end;
                      const statusText = tm.Status
                        ? (typeof tm.Status === 'object' ? tm.Status.StatusText : tm.Status)
                        : (tm.patent_status != null ? (tm.patent_status ? 'Действующий' : 'Недействующий') : null);
                      const isActive = statusText === 'Действующий' || statusText === 'Active';
                      const imageUrl = tm.ImageUrl || tm.image_url;

                      return (
                        <Card key={i} className="overflow-hidden hover:shadow-md transition-shadow">
                          <CardContent className="p-0">
                            <div className="flex gap-3">
                              {/* Image preview */}
                              <div className="w-24 h-24 shrink-0 bg-muted flex items-center justify-center border-r">
                                {imageUrl ? (
                                  <img src={imageUrl} alt={title} className="w-full h-full object-contain p-1.5"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <Hash className="h-5 w-5" />
                                    <span className="text-[10px] mt-0.5">ТЗ</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 py-2.5 pr-3 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-semibold text-sm leading-tight line-clamp-2">{title}</h4>
                                  {statusText && (
                                    <Badge variant={isActive ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                                      {statusText}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  {regNum && <span>№ {regNum}</span>}
                                  {appNum && <span>Заявка: {appNum}</span>}
                                  {regDate && <span>Рег: {formatDate(regDate)}</span>}
                                  {expDate && <span>До: {formatDate(expDate)}</span>}
                                </div>
                                {tm._source && <Badge variant="outline" className="text-[10px]">{tm._source === 'patents' ? 'Реестр' : 'Заявка'}</Badge>}
                                {fipsUrl && (
                                  <a href={fipsUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                    <ExternalLink className="h-3 w-3" /> Открыть в ФИПС
                                  </a>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Нет данных о товарных знаках.</p>
                  </div>
                );
              })()}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={fipsLoading}
                onClick={async () => {
                  const inn = c.Inn || c.Name;
                  if (!inn) return;
                  setFipsLoading(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('reputation-api', {
                      body: { action: 'trademarks', entity_id: c.Id || c.Inn, entity_type: c.Type || 'Company' },
                    });
                    if (error) throw error;
                    if (data?.trademarks?.length > 0) {
                      setFipsTrademarks(data.trademarks);
                      toast({ title: `Найдено ${data.count} товарных знаков (FIPS)` });
                    } else {
                      toast({ title: 'Товарные знаки не найдены в FIPS' });
                    }
                  } catch (err: any) {
                    toast({ title: 'Ошибка FIPS', description: err.message, variant: 'destructive' });
                  } finally {
                    setFipsLoading(false);
                  }
                }}
              >
                {fipsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                Поиск в FIPS
              </Button>
            </TabsContent>
          )}

          {selectedSections.includes('arbitration') && (
            <TabsContent value="arbitration">
              {c.Arbitration ? (
                <DataGrid data={[
                  { label: 'Истец (кол-во)', value: c.Arbitration.PlaintiffCount },
                  { label: 'Ответчик (кол-во)', value: c.Arbitration.DefendantCount },
                  { label: 'Общая сумма', value: c.Arbitration.TotalSum },
                ]} />
              ) : <p className="text-sm text-muted-foreground">Нет данных об арбитраже в базовом поиске</p>}
            </TabsContent>
          )}

          {selectedSections.includes('contacts') && (
            <TabsContent value="contacts">
              <DataGrid data={[
                { label: 'Телефоны', value: formatArray(c.Phones) },
                { label: 'Email', value: formatArray(c.Emails) },
                { label: 'Сайты', value: formatArray(c.Sites) },
              ]} />
              {(!c.Phones?.length && !c.Emails?.length && !c.Sites?.length) && (
                <p className="text-sm text-muted-foreground">Нет контактных данных</p>
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};

const safeString = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(safeString).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return String(obj.Name || obj.StatusText || obj.Value || obj.Description || JSON.stringify(v));
  }
  return String(v);
};

const DataGrid = ({ data }: { data: { label: string; value: unknown }[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {data.filter(d => d.value != null && d.value !== '' && d.value !== 'null').map((d, i) => (
      <div key={i}>
        <div className="text-xs text-muted-foreground">{d.label}</div>
        <div className="text-sm font-medium">{safeString(d.value)}</div>
      </div>
    ))}
  </div>
);

function formatCompanyText(company: Record<string, unknown>, sections: string[]): string {
  const c = company as any;
  const lines: string[] = [];
  lines.push(`📋 ${c.Name || 'Компания'}`);
  if (sections.includes('requisites')) {
    if (c.Inn) lines.push(`ИНН: ${c.Inn}`);
    if (c.Ogrn) lines.push(`ОГРН: ${c.Ogrn}`);
    if (c.Kpp) lines.push(`КПП: ${c.Kpp}`);
  }
  if (sections.includes('address') && c.Address) {
    lines.push(`Адрес: ${c.Address}`);
  }
  if (sections.includes('management') && c.ManagerName) {
    lines.push(`Руководитель: ${c.ManagerName}`);
  }
  if (sections.includes('contacts')) {
    if (c.Sites?.length) lines.push(`Сайт: ${c.Sites.join(', ')}`);
  }
  return lines.join('\n');
}

export default Reputation;
