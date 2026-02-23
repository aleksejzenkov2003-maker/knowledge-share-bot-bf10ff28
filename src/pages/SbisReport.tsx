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
import { Search, Building2, Copy, Bookmark, Loader2, ChevronLeft, ChevronRight, TrendingUp, Users, Gavel, FileCheck, Phone, ShieldCheck } from 'lucide-react';

const DATA_SECTIONS = [
  { key: 'requisites', label: 'Реквизиты', description: 'ИНН, ОГРН, КПП, адрес, статус', icon: Building2 },
  { key: 'finance', label: 'Финансы', description: 'Выручка, прибыль, отчётность', icon: TrendingUp },
  { key: 'owners', label: 'Связи', description: 'Учредители, руководство, аффилированные', icon: Users },
  { key: 'tenders', label: 'Госзакупки', description: 'Контракты, торги', icon: Gavel },
  { key: 'trademarks', label: 'Товарные знаки', description: 'Зарегистрированные ТЗ', icon: FileCheck },
  { key: 'courts', label: 'Суды', description: 'Арбитраж, статистика', icon: ShieldCheck },
  { key: 'reliability', label: 'Надёжность', description: 'Оценка надёжности', icon: ShieldCheck },
  { key: 'contacts', label: 'Контакты', description: 'Телефоны, email, сайт', icon: Phone },
] as const;

const STORAGE_KEY = 'sbis-selected-sections';

const SbisReport = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [extraData, setExtraData] = useState<Record<string, any>>({});
  const [currentInn, setCurrentInn] = useState<string | null>(null);
  const [currentOgrn, setCurrentOgrn] = useState<string | null>(null);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [selectedSections, setSelectedSections] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DATA_SECTIONS.map(s => s.key);
    } catch { return DATA_SECTIONS.map(s => s.key); }
  });
  const [savedReports, setSavedReports] = useState<Array<{ id: string; name: string; inn: string; created_at: string }>>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedSections));
  }, [selectedSections]);

  useEffect(() => { loadSavedReports(); }, []);

  const loadSavedReports = async () => {
    const { data } = await supabase
      .from('reputation_reports')
      .select('id, name, inn, created_at, entity_type')
      .eq('entity_type', 'sbis')
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
    setCompany(null);
    setSearchResults([]);
    setExtraData({});
    setCurrentResultIndex(0);

    try {
      const { data, error } = await supabase.functions.invoke('sbis-api', {
        body: { action: 'full_report', query: query.trim() },
      });
      if (error) throw error;

      if (data.search_results?.length > 1) {
        setSearchResults(data.search_results);
        toast({ title: `Найдено ${data.search_results.length} совпадений`, description: 'Выберите компанию из списка' });
      } else if (data.company) {
        setCompany(data.company);
        setCurrentInn(data.inn || data.company?.inn);
        setCurrentOgrn(data.ogrn || data.company?.ogrn);
      } else {
        toast({ title: 'Ничего не найдено', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Ошибка поиска СБИС', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = async (result: any) => {
    const inn = result.inn || result.INN;
    const ogrn = result.ogrn || result.OGRN;
    setLoading(true);
    setSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('sbis-api', {
        body: { action: 'req', inn, ogrn },
      });
      if (error) throw error;
      setCompany(data);
      setCurrentInn(inn);
      setCurrentOgrn(ogrn);
    } catch (err: any) {
      toast({ title: 'Ошибка загрузки', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadSection = async (sectionAction: string) => {
    if (!currentInn && !currentOgrn) return;
    setSectionLoading(sectionAction);
    try {
      const { data, error } = await supabase.functions.invoke('sbis-api', {
        body: { action: sectionAction, inn: currentInn, ogrn: currentOgrn },
      });
      if (error) throw error;
      setExtraData(prev => ({ ...prev, [sectionAction]: data }));
    } catch (err: any) {
      toast({ title: `Ошибка загрузки ${sectionAction}`, description: err.message, variant: 'destructive' });
    } finally {
      setSectionLoading(null);
    }
  };

  const handleSaveReport = async () => {
    if (!company || !user) return;
    try {
      const { error } = await supabase.from('reputation_reports').insert({
        user_id: user.id,
        entity_id: currentInn || currentOgrn || '',
        entity_type: 'sbis',
        query,
        name: company?.name || company?.full_name || '',
        inn: currentInn || '',
        ogrn: currentOgrn || '',
        report_data: { company, extra: extraData } as any,
        selected_sections: selectedSections,
      });
      if (error) throw error;
      toast({ title: 'Отчёт СБИС сохранён' });
      loadSavedReports();
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err.message, variant: 'destructive' });
    }
  };

  const handleCopyToClipboard = () => {
    if (!company) return;
    const lines: string[] = [];
    lines.push(`📋 ${company.name || company.full_name || 'Компания'}`);
    if (company.inn) lines.push(`ИНН: ${company.inn}`);
    if (company.ogrn) lines.push(`ОГРН: ${company.ogrn}`);
    if (company.kpp) lines.push(`КПП: ${company.kpp}`);
    if (company.address) lines.push(`Адрес: ${typeof company.address === 'object' ? company.address.value : company.address}`);
    if (company.manager) lines.push(`Руководитель: ${typeof company.manager === 'object' ? company.manager.name : company.manager}`);
    navigator.clipboard.writeText(lines.join('\n'));
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
        <h1 className="text-2xl font-bold">СБИС — Всё о компаниях</h1>
        <p className="text-muted-foreground">Поиск контрагентов, финансы, госзакупки, товарные знаки</p>
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
            <CardTitle className="text-sm">Разделы данных</CardTitle>
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
                  <div key={r.id} className="text-sm p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted">
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
          {searchResults.length > 1 && !company && (
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
                    {searchResults.slice(currentResultIndex, currentResultIndex + 3).map((r, idx) => (
                      <Card key={idx} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleSelectResult(r)}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{r.company_name || r.name || r.full_name || r.Name}</div>
                              {(r.inn || r.INN) && <div className="text-xs text-muted-foreground">ИНН: {r.inn || r.INN}</div>}
                              {(r.ogrn || r.OGRN) && <div className="text-xs text-muted-foreground">ОГРН: {r.ogrn || r.OGRN}</div>}
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

          {/* Company detail */}
          {company && (
            <SbisCompanyCard
              company={company}
              extraData={extraData}
              selectedSections={selectedSections}
              sectionLoading={sectionLoading}
              onLoadSection={loadSection}
              onSave={handleSaveReport}
              onCopy={handleCopyToClipboard}
            />
          )}

          {!loading && !company && searchResults.length === 0 && (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              Введите ИНН, ОГРН или название для поиска
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

// ─── Company Detail Card ─────────────────────────────────────────

interface SbisCompanyCardProps {
  company: any;
  extraData: Record<string, any>;
  selectedSections: string[];
  sectionLoading: string | null;
  onLoadSection: (action: string) => void;
  onSave: () => void;
  onCopy: () => void;
}

const SbisCompanyCard = ({ company, extraData, selectedSections, sectionLoading, onLoadSection, onSave, onCopy }: SbisCompanyCardProps) => {
  const c = company;
  const name = c?.name || c?.full_name || c?.Name || 'Компания';
  const inn = c?.inn || c?.INN || '';
  const ogrn = c?.ogrn || c?.OGRN || '';
  const kpp = c?.kpp || c?.KPP || '';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{name}</CardTitle>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                {inn && <span>ИНН: {inn}</span>}
                {ogrn && <span>ОГРН: {ogrn}</span>}
                {kpp && <span>КПП: {kpp}</span>}
              </div>
              {c?.status && (
                <Badge variant="default" className="mt-1">
                  {typeof c.status === 'object' ? c.status.text || c.status.value : c.status}
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
              <SbisDataGrid data={flattenForDisplay(c)} />
            </TabsContent>
          )}

          {selectedSections.includes('finance') && (
            <TabsContent value="finance">
              <LazySection
                data={extraData.finance}
                loading={sectionLoading === 'finance'}
                onLoad={() => onLoadSection('finance')}
                label="финансовые данные"
              />
            </TabsContent>
          )}

          {selectedSections.includes('owners') && (
            <TabsContent value="owners">
              <LazySection
                data={extraData.owners}
                loading={sectionLoading === 'owners'}
                onLoad={() => onLoadSection('owners')}
                label="данные о связях"
              />
            </TabsContent>
          )}

          {selectedSections.includes('tenders') && (
            <TabsContent value="tenders">
              <LazySection
                data={extraData.tenders}
                loading={sectionLoading === 'tenders'}
                onLoad={() => onLoadSection('tenders')}
                label="данные о госзакупках"
              />
            </TabsContent>
          )}

          {selectedSections.includes('trademarks') && (
            <TabsContent value="trademarks">
              <LazySection
                data={extraData.trademarks}
                loading={sectionLoading === 'trademarks'}
                onLoad={() => onLoadSection('trademarks')}
                label="товарные знаки"
              />
            </TabsContent>
          )}

          {selectedSections.includes('courts') && (
            <TabsContent value="courts">
              <LazySection
                data={extraData.courts}
                loading={sectionLoading === 'courts'}
                onLoad={() => onLoadSection('courts')}
                label="судебную статистику"
              />
            </TabsContent>
          )}

          {selectedSections.includes('reliability') && (
            <TabsContent value="reliability">
              <LazySection
                data={extraData.reliability}
                loading={sectionLoading === 'reliability'}
                onLoad={() => onLoadSection('reliability')}
                label="данные о надёжности"
              />
            </TabsContent>
          )}

          {selectedSections.includes('contacts') && (
            <TabsContent value="contacts">
              <LazySection
                data={extraData.contacts}
                loading={sectionLoading === 'contacts'}
                onLoad={() => onLoadSection('contacts')}
                label="контактные данные"
              />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};

// ─── Lazy Section Loader ─────────────────────────────────────────

const LazySection = ({ data, loading, onLoad, label }: { data: any; loading: boolean; onLoad: () => void; label: string }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-3">Нажмите для загрузки</p>
        <Button variant="outline" onClick={onLoad}>
          <Search className="h-4 w-4 mr-1" /> Загрузить {label}
        </Button>
      </div>
    );
  }

  // Render loaded data
  if (typeof data === 'object' && !Array.isArray(data)) {
    // Check if it has items array
    if (data.items && Array.isArray(data.items)) {
      return (
        <div className="space-y-3">
          {data.items.map((item: any, i: number) => (
            <Card key={i} className="p-3">
              <SbisDataGrid data={flattenForDisplay(item)} />
            </Card>
          ))}
          {data.items.length === 0 && <p className="text-sm text-muted-foreground">Нет данных</p>}
        </div>
      );
    }
    return <SbisDataGrid data={flattenForDisplay(data)} />;
  }

  if (Array.isArray(data)) {
    return (
      <div className="space-y-3">
        {data.map((item: any, i: number) => (
          <Card key={i} className="p-3">
            <SbisDataGrid data={flattenForDisplay(item)} />
          </Card>
        ))}
        {data.length === 0 && <p className="text-sm text-muted-foreground">Нет данных</p>}
      </div>
    );
  }

  return <pre className="text-xs overflow-auto max-h-96">{JSON.stringify(data, null, 2)}</pre>;
};

// ─── Helpers ─────────────────────────────────────────────────────

function flattenForDisplay(obj: any, prefix = ''): { label: string; value: string }[] {
  if (!obj || typeof obj !== 'object') return [];
  const result: { label: string; value: string }[] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (val == null || val === '') continue;
    const label = prefix ? `${prefix}.${key}` : key;

    if (typeof val === 'object' && !Array.isArray(val)) {
      // Flatten one level deep
      const nested = flattenForDisplay(val, label);
      result.push(...nested.slice(0, 10)); // limit nested
    } else if (Array.isArray(val)) {
      if (val.length > 0) {
        if (typeof val[0] === 'string' || typeof val[0] === 'number') {
          result.push({ label, value: val.join(', ') });
        } else {
          result.push({ label, value: `[${val.length} элементов]` });
        }
      }
    } else {
      result.push({ label, value: String(val) });
    }
  }

  return result;
}

const SbisDataGrid = ({ data }: { data: { label: string; value: string }[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {data.filter(d => d.value && d.value !== 'null' && d.value !== 'undefined').map((d, i) => (
      <div key={i}>
        <div className="text-xs text-muted-foreground">{d.label}</div>
        <div className="text-sm font-medium break-words">{d.value}</div>
      </div>
    ))}
    {data.filter(d => d.value && d.value !== 'null').length === 0 && (
      <p className="text-sm text-muted-foreground col-span-2">Нет данных</p>
    )}
  </div>
);

export default SbisReport;
