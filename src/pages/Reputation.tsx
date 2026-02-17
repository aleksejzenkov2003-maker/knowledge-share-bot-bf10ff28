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
import { Search, Building2, Copy, Bookmark, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

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
      setSelectedCompany(result.company);
      setEntityType(result.entity_type);
      setAdditionalData(result.additional || {});

      if (!result.company && result.search_results?.length > 1) {
        toast({ title: `Найдено ${result.search_results.length} совпадений`, description: 'Выберите компанию из списка' });
      } else if (!result.company && (!result.search_results || result.search_results.length === 0)) {
        toast({ title: 'Ничего не найдено', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Ошибка поиска', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = async (result: SearchResult) => {
    setLoading(true);
    try {
      const cardType = (result.Type || 'Company').toLowerCase() === 'entrepreneur' ? 'entrepreneur' : 'company';
      const { data, error } = await supabase.functions.invoke('reputation-api', {
        body: { action: cardType, entity_id: result.Id },
      });
      if (error) throw error;
      setSelectedCompany(data);
      setEntityType(cardType);
    } catch (err: any) {
      toast({ title: 'Ошибка загрузки карточки', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
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

const CompanyDetailCard = ({ company, entityType, selectedSections, onSave, onCopy }: CompanyDetailCardProps) => {
  const c = company as any;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{c.Name || c.ShortName || c.FullName || 'Компания'}</CardTitle>
              <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                {c.Inn && <span>ИНН: {c.Inn}</span>}
                {c.Ogrn && <span>ОГРН: {c.Ogrn}</span>}
              </div>
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
        <Tabs defaultValue="requisites">
          <TabsList className="flex-wrap h-auto">
            {DATA_SECTIONS.filter(s => selectedSections.includes(s.key)).map(s => (
              <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>
            ))}
          </TabsList>

          {selectedSections.includes('requisites') && (
            <TabsContent value="requisites">
              <DataGrid data={[
                { label: 'Полное название', value: c.FullName || c.Name },
                { label: 'Краткое название', value: c.ShortName },
                { label: 'ИНН', value: c.Inn },
                { label: 'ОГРН', value: c.Ogrn },
                { label: 'КПП', value: c.Kpp },
                { label: 'Дата регистрации', value: c.RegistrationDate },
                { label: 'Статус', value: c.Status || c.State },
                { label: 'Тип', value: entityType },
              ]} />
            </TabsContent>
          )}

          {selectedSections.includes('management') && (
            <TabsContent value="management">
              {c.Director ? (
                <DataGrid data={[
                  { label: 'Руководитель', value: typeof c.Director === 'string' ? c.Director : c.Director?.Name || c.Director?.Fio },
                  { label: 'Должность', value: c.Director?.Position },
                ]} />
              ) : c.Heads ? (
                <div className="space-y-2">
                  {(Array.isArray(c.Heads) ? c.Heads : []).map((h: any, i: number) => (
                    <div key={i} className="text-sm"><span className="text-muted-foreground">{h.Position}: </span>{h.Name || h.Fio}</div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Нет данных</p>}
              {c.Founders && Array.isArray(c.Founders) && c.Founders.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Учредители</h4>
                  {c.Founders.map((f: any, i: number) => (
                    <div key={i} className="text-sm">{f.Name || f.Fio} {f.Share ? `(${f.Share}%)` : ''}</div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {selectedSections.includes('address') && (
            <TabsContent value="address">
              <DataGrid data={[
                { label: 'Юридический адрес', value: c.LegalAddress || c.Address },
                { label: 'Фактический адрес', value: c.ActualAddress },
              ]} />
            </TabsContent>
          )}

          {selectedSections.includes('activities') && (
            <TabsContent value="activities">
              {c.MainOkved ? (
                <div className="text-sm mb-3">
                  <span className="font-medium">Основной: </span>
                  {typeof c.MainOkved === 'string' ? c.MainOkved : `${c.MainOkved.Code} — ${c.MainOkved.Name}`}
                </div>
              ) : null}
              {c.AdditionalOkveds && Array.isArray(c.AdditionalOkveds) && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Дополнительные:</h4>
                  {c.AdditionalOkveds.slice(0, 10).map((o: any, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {typeof o === 'string' ? o : `${o.Code} — ${o.Name}`}
                    </div>
                  ))}
                  {c.AdditionalOkveds.length > 10 && (
                    <div className="text-xs text-muted-foreground">...ещё {c.AdditionalOkveds.length - 10}</div>
                  )}
                </div>
              )}
              {!c.MainOkved && !c.AdditionalOkveds && <p className="text-sm text-muted-foreground">Нет данных</p>}
            </TabsContent>
          )}

          {selectedSections.includes('finances') && (
            <TabsContent value="finances">
              <DataGrid data={[
                { label: 'Уставный капитал', value: c.AuthorizedCapital || c.Capital },
                { label: 'Выручка', value: c.Revenue },
                { label: 'Прибыль', value: c.Profit },
              ]} />
            </TabsContent>
          )}

          {selectedSections.includes('trademarks') && (
            <TabsContent value="trademarks">
              {c.Trademarks && Array.isArray(c.Trademarks) && c.Trademarks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {c.Trademarks.map((tm: any, i: number) => (
                    <Card key={i} className="p-3">
                      <div className="text-sm font-medium">{tm.Name || tm.Description || `ТЗ №${tm.Number || i + 1}`}</div>
                      {tm.Number && <div className="text-xs text-muted-foreground">№ {tm.Number}</div>}
                      {tm.RegistrationDate && <div className="text-xs text-muted-foreground">Регистрация: {tm.RegistrationDate}</div>}
                      {tm.Classes && <div className="text-xs text-muted-foreground">Классы МКТУ: {Array.isArray(tm.Classes) ? tm.Classes.join(', ') : tm.Classes}</div>}
                    </Card>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Нет данных о товарных знаках</p>}
            </TabsContent>
          )}

          {selectedSections.includes('arbitration') && (
            <TabsContent value="arbitration">
              {c.Arbitration ? (
                <DataGrid data={[
                  { label: 'Истец (кол-во дел)', value: c.Arbitration.PlaintiffCount || c.Arbitration.AsPlaintiff },
                  { label: 'Ответчик (кол-во дел)', value: c.Arbitration.DefendantCount || c.Arbitration.AsDefendant },
                  { label: 'Общая сумма', value: c.Arbitration.TotalSum || c.Arbitration.TotalAmount },
                ]} />
              ) : <p className="text-sm text-muted-foreground">Нет данных</p>}
            </TabsContent>
          )}

          {selectedSections.includes('contacts') && (
            <TabsContent value="contacts">
              <DataGrid data={[
                { label: 'Телефон', value: c.Phone || c.Phones },
                { label: 'Email', value: c.Email || c.Emails },
                { label: 'Сайт', value: c.Website || c.Sites },
              ]} />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};

const DataGrid = ({ data }: { data: { label: string; value: unknown }[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {data.filter(d => d.value != null && d.value !== '').map((d, i) => (
      <div key={i}>
        <div className="text-xs text-muted-foreground">{d.label}</div>
        <div className="text-sm font-medium">{String(d.value)}</div>
      </div>
    ))}
  </div>
);

function formatCompanyText(company: Record<string, unknown>, sections: string[]): string {
  const c = company as any;
  const lines: string[] = [];
  lines.push(`📋 ${c.Name || c.ShortName || c.FullName || 'Компания'}`);
  if (sections.includes('requisites')) {
    if (c.Inn) lines.push(`ИНН: ${c.Inn}`);
    if (c.Ogrn) lines.push(`ОГРН: ${c.Ogrn}`);
    if (c.Kpp) lines.push(`КПП: ${c.Kpp}`);
  }
  if (sections.includes('address') && (c.LegalAddress || c.Address)) {
    lines.push(`Адрес: ${c.LegalAddress || c.Address}`);
  }
  if (sections.includes('management') && c.Director) {
    const dir = typeof c.Director === 'string' ? c.Director : c.Director?.Name || c.Director?.Fio;
    if (dir) lines.push(`Руководитель: ${dir}`);
  }
  return lines.join('\n');
}

export default Reputation;
