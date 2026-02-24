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
import { Search, Building2, Copy, Bookmark, Loader2, ChevronLeft, ExternalLink, Hash, MapPin, Filter, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SearchResult {
  Id: string;
  Type: string;
  Inn?: string;
  Ogrn?: string;
  Name?: string;
  Address?: string;
  Status?: string;
  Regions?: string[];
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
  const [searchMode, setSearchMode] = useState<'company' | 'trademark'>('company');
  const [trademarkSearchResults, setTrademarkSearchResults] = useState<any[]>([]);
  const [trademarkSearchLoading, setTrademarkSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Record<string, unknown> | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [additionalData, setAdditionalData] = useState<Record<string, unknown>>({});
  const [trademarksData, setTrademarksData] = useState<any[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DATA_SECTIONS.map(s => s.key);
    } catch { return DATA_SECTIONS.map(s => s.key); }
  });
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [savedReports, setSavedReports] = useState<Array<{ id: string; name: string; inn: string; created_at: string }>>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterAddress, setFilterAddress] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);

  // Extract unique cities from addresses for filter
  const extractCity = (address?: string): string => {
    if (!address) return '';
    // Try to extract city from address patterns like "Г.МОСКВА" or "ГОРОД КАЗАНЬ"
    const match = address.match(/(?:Г\.|ГОРОД\s+|г\.\s*)([А-ЯЁа-яё\s-]+?)(?:,|\s+УЛ|\s+ПР|\s+Ш\s|\s+ПЕР|\s+НАБ|\s+ВН)/i);
    if (match) return match[1].trim();
    // Fallback: try region patterns
    const regionMatch = address.match(/(?:ОБЛАСТЬ|КРАЙ|РЕСПУБЛИКА|ОКРУГ)\s+([А-ЯЁа-яё\s-]+?)(?:,)/i);
    if (regionMatch) return regionMatch[1].trim();
    return '';
  };

  const availableCities = [...new Set(
    searchResults.map(r => extractCity(r.Address)).filter(Boolean)
  )].sort();

  const filteredResults = searchResults.filter(r => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'active' && r.Status !== 'Active') return false;
      if (filterStatus === 'terminated' && r.Status !== 'Terminated') return false;
    }
    if (filterCity !== 'all') {
      const city = extractCity(r.Address);
      if (city !== filterCity) return false;
    }
    if (filterAddress.trim()) {
      const addr = (r.Address || '').toLowerCase();
      if (!addr.includes(filterAddress.trim().toLowerCase())) return false;
    }
    return true;
  });

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

  // Normalize messy queries: extract INN/OGRN, or parse structured format:
  // ОПФ "Название", индекс, Город, ул. Улица, д. X, ... (RU)
  const normalizeSearchQuery = (raw: string): string => {
    const trimmed = raw.trim();
    
    // Try to extract INN (10 or 12 digits) from within the text
    const innMatch = trimmed.match(/\b(\d{10}|\d{12})\b/);
    if (innMatch) return innMatch[1];
    
    // Try to extract OGRN (13 or 15 digits)
    const ogrnMatch = trimmed.match(/\b(\d{13}|\d{15})\b/);
    if (ogrnMatch) return ogrnMatch[1];
    
    // Clean up: remove (RU) suffix, then split by commas
    let cleaned = trimmed.replace(/\s*\([A-Z]{2}\)\s*$/i, '');
    
    // Extract quoted company name
    const quotedMatch = cleaned.match(/"([^"]+)"/);
    if (quotedMatch) {
      const companyName = quotedMatch[1];
      
      // Split the rest by commas to find city and street
      const parts = cleaned.replace(/"[^"]+"/g, '').split(',').map(p => p.trim()).filter(Boolean);
      
      let city = '';
      let street = '';
      
      for (const part of parts) {
        // Skip postal codes (6 digits), building numbers (д. X), литера, помещение, корпус, кв, ОПФ prefixes
        if (/^\d{6}$/.test(part)) continue;
        if (/^(д\.|дом\s|лит|помещ|корп|кв|стр|оф)/i.test(part)) continue;
        if (/^(Общество|Акционерное|Закрытое|Публичное|Индивидуальный)/i.test(part)) continue;
        
        // Detect street: starts with ул./пер./пр-кт/проспект/наб./шоссе/б-р
        if (/^(ул\.?|улица|пер\.?|переулок|пр-кт\.?|проспект|наб\.?|набережная|бульвар|б-р\.?|шоссе|ш\.?)\s/i.test(part)) {
          // Extract just the street name without prefix and trailing numbers
          const streetName = part
            .replace(/^(ул\.?\s*|улица\s+|пер\.?\s*|переулок\s+|пр-кт\.?\s*|проспект\s+|наб\.?\s*|набережная\s+|бульвар\s+|б-р\.?\s*|шоссе\s+|ш\.?\s*)/i, '')
            .replace(/\s*д\..*$/i, '')
            .trim();
          if (streetName) street = streetName;
          continue;
        }
        
        // Detect city: capitalized name that's not a number or abbreviation
        if (!city && /^[А-ЯЁA-Z]/.test(part) && part.length > 2 && !/^\d/.test(part)) {
          city = part.replace(/^г\.?\s*/i, '');
        }
      }
      
      let result = companyName;
      if (city) result += ` ${city}`;
      if (street) result += ` ${street}`;
      return result;
    }
    
    // Fallback: remove legal forms, postal codes, keep first meaningful parts
    cleaned = cleaned.replace(/\b\d{6}\b/g, '');
    cleaned = cleaned.replace(/^(Общество с ограниченной ответственностью|Акционерное общество|Закрытое акционерное общество|Публичное акционерное общество|Индивидуальный предприниматель)\s*/i, '');
    const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 2) {
      return parts.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
    }
    return cleaned.replace(/\s+/g, ' ').trim();
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSelectedCompany(null);
    setSearchResults([]);
    setCurrentResultIndex(0);
    setVisibleCount(20);
    setTrademarksData([]);

    try {
      const normalizedQuery = normalizeSearchQuery(query);
      console.log(`Reputation search: "${query.trim()}" → "${normalizedQuery}"`);
      const { data, error } = await supabase.functions.invoke('reputation-api', {
        body: { query: normalizedQuery, action: 'full_report' },
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

  const handleTrademarkSearch = async () => {
    if (!query.trim()) return;
    setTrademarkSearchLoading(true);
    setTrademarkSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('reputation-api', {
        body: { query: query.trim(), action: 'trademark_search' },
      });

      if (error) throw error;

      if (data?.trademarks?.length > 0) {
        setTrademarkSearchResults(data.trademarks);
        toast({ title: `Найдено ${data.count} товарных знаков` });
      } else {
        toast({ title: 'Ничего не найдено', description: 'Попробуйте другой номер', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Ошибка поиска ТЗ', description: err.message, variant: 'destructive' });
    } finally {
      setTrademarkSearchLoading(false);
    }
  };

  const handleSelectResult = async (result: SearchResult) => {
    const entType = (result.Type || 'Company').toLowerCase();
    const cardAction = entType === 'entrepreneur' ? 'entrepreneur' : entType === 'person' ? 'person' : 'company';

    // Immediately show search data as fallback, then load full card
    setSelectedCompany(result as any);
    setEntityType(entType);
    setTrademarksData([]);
    setLoadingDetail(true);

    try {
      // Fetch full card, trademarks, and entity ID in parallel
      const [cardRes, tmRes, idRes] = await Promise.allSettled([
        supabase.functions.invoke('reputation-api', {
          body: { action: cardAction, entity_id: result.Id, entity_type: result.Type },
        }),
        supabase.functions.invoke('reputation-api', {
          body: { action: 'trademarks', entity_id: result.Id, entity_type: result.Type },
        }),
        result.Inn
          ? supabase.functions.invoke('reputation-api', {
              body: { action: 'search', query: result.Inn },
            }).then(res => {
              if (res.data) setAdditionalData(prev => ({ ...prev, entityIdInfo: res.data }));
            })
          : Promise.resolve(),
      ]);

      // Apply full card if successful
      if (cardRes.status === 'fulfilled' && cardRes.value.data && !cardRes.value.error) {
        setSelectedCompany(cardRes.value.data);
      }

      // Apply trademarks if successful
      if (tmRes.status === 'fulfilled' && tmRes.value.data?.trademarks?.length > 0) {
        setTrademarksData(tmRes.value.data.trademarks);
      }
    } catch (err: any) {
      console.error('Error loading company details:', err);
      // Fallback: keep search result data
    } finally {
      setLoadingDetail(false);
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
          <Tabs value={searchMode} onValueChange={(v) => { setSearchMode(v as 'company' | 'trademark'); setQuery(''); setTrademarkSearchResults([]); setSearchResults([]); setSelectedCompany(null); }}>
            <TabsList className="mb-4">
              <TabsTrigger value="company"><Building2 className="h-4 w-4 mr-1.5" />Компании</TabsTrigger>
              <TabsTrigger value="trademark"><FileText className="h-4 w-4 mr-1.5" />Товарные знаки</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchMode === 'company' ? 'ИНН, ОГРН или название компании (+ город)' : 'Номер заявки или номер регистрации'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (searchMode === 'company' ? handleSearch() : handleTrademarkSearch())}
                className="pl-10"
              />
            </div>
            <Button onClick={searchMode === 'company' ? handleSearch : handleTrademarkSearch} disabled={(searchMode === 'company' ? loading : trademarkSearchLoading) || !query.trim()}>
              {(searchMode === 'company' ? loading : trademarkSearchLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Найти'}
            </Button>
          </div>
          {searchMode === 'company' && !query && (
            <p className="mt-2 text-xs text-muted-foreground">
              💡 Совет: для точного поиска используйте ИНН или ОГРН. К названию можно добавить город, например: «Скат Санкт-Петербург»
            </p>
          )}
          {searchMode === 'trademark' && !query && (
            <p className="mt-2 text-xs text-muted-foreground">
              💡 Введите номер заявки или номер регистрации товарного знака для поиска в реестре ФИПС
            </p>
          )}
          {searchMode === 'company' && query && (
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
          {/* Trademark search results */}
          {searchMode === 'trademark' && trademarkSearchResults.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Найдено {trademarkSearchResults.length} товарных знаков</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { setTrademarkSearchResults([]); setQuery(''); }}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Назад
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trademarkSearchResults.map((tm: any, idx: number) => (
                    <Card key={idx} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          {tm.ImageUrl && (
                            <img src={tm.ImageUrl} alt="ТЗ" className="h-20 w-20 object-contain rounded border bg-muted shrink-0" />
                          )}
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="font-medium text-sm">{tm.Name || tm.Description || tm.WordMark || 'Без описания'}</div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {(tm.RegistrationNumber || tm.RegNumber) && (
                                <span>Рег. №: <span className="font-medium text-foreground">{tm.RegistrationNumber || tm.RegNumber}</span></span>
                              )}
                              {(tm.ApplicationNumber || tm.AppNumber) && (
                                <span>Заявка №: <span className="font-medium text-foreground">{tm.ApplicationNumber || tm.AppNumber}</span></span>
                              )}
                              {(tm.RegistrationDate || tm.RegDate) && (
                                <span>Дата рег.: {tm.RegistrationDate || tm.RegDate}</span>
                              )}
                              {(tm.ApplicationDate || tm.AppDate || tm.FilingDate) && (
                                <span>Дата подачи: {tm.ApplicationDate || tm.AppDate || tm.FilingDate}</span>
                              )}
                            </div>
                            {(tm.Owner || tm.Holder || tm.Applicant) && (
                              <div className="text-xs text-muted-foreground">
                                Правообладатель: <span className="text-foreground">{tm.Owner || tm.Holder || tm.Applicant}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {tm.Status && (
                                <Badge variant={tm.Status === 'Active' || tm.Status === 'Действует' ? 'default' : 'secondary'} className="text-[10px]">
                                  {tm.Status}
                                </Badge>
                              )}
                              {tm._source && (
                                <Badge variant="outline" className="text-[10px]">
                                  {tm._source === 'patents' ? 'Зарегистрирован' : 'Заявка'}
                                </Badge>
                              )}
                              {(tm.NiceClasses || tm.Classes) && (
                                <Badge variant="outline" className="text-[10px]">
                                  МКТУ: {Array.isArray(tm.NiceClasses || tm.Classes) ? (tm.NiceClasses || tm.Classes).join(', ') : (tm.NiceClasses || tm.Classes)}
                                </Badge>
                              )}
                            </div>
                            {(tm.RegistrationNumber || tm.RegNumber) && (
                              <a
                                href={`https://fips.ru/registers-doc-view/fips_servlet?DB=RUTM&DocNumber=${tm.RegistrationNumber || tm.RegNumber}&TypeFile=html`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                              >
                                <ExternalLink className="h-3 w-3" /> Открыть в ФИПС
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Multiple results grid */}
          {searchResults.length > 1 && !selectedCompany && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Найдено {searchResults.length} совпадений</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { setSearchResults([]); setQuery(''); setFilterStatus('all'); setFilterCity('all'); setFilterAddress(''); }}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Назад
                  </Button>
                </div>
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-8 w-[160px] text-xs">
                        <SelectValue placeholder="Статус" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все статусы</SelectItem>
                        <SelectItem value="active">Действующие</SelectItem>
                        <SelectItem value="terminated">Ликвидированные</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {availableCities.length > 1 && (
                    <Select value={filterCity} onValueChange={setFilterCity}>
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue placeholder="Город" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все города</SelectItem>
                        {availableCities.map(city => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex-1 min-w-[180px]">
                    <Input
                      placeholder="Фильтр по адресу..."
                      value={filterAddress}
                      onChange={e => setFilterAddress(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  {(filterStatus !== 'all' || filterCity !== 'all' || filterAddress) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterStatus('all'); setFilterCity('all'); setFilterAddress(''); }}>
                      Сбросить
                    </Button>
                  )}
                </div>
                {filteredResults.length !== searchResults.length && (
                  <p className="text-xs text-muted-foreground mt-2">Показано {filteredResults.length} из {searchResults.length}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredResults.slice(0, visibleCount).map((r) => (
                    <Card key={r.Id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleSelectResult(r)}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="font-medium text-sm leading-tight">{r.Name || 'Без названия'}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {r.Inn && <span>ИНН: {r.Inn}</span>}
                              {r.Ogrn && <span>ОГРН: {r.Ogrn}</span>}
                            </div>
                            {r.Address && (
                              <div className="flex items-start gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{r.Address}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              <Badge variant="outline" className="text-[10px]">
                                {r.Type === 'Company' ? 'Юр. лицо' : r.Type === 'Entrepreneur' ? 'ИП' : r.Type}
                              </Badge>
                              {r.Status && (
                                <Badge variant={r.Status === 'Active' ? 'default' : 'secondary'} className="text-[10px]">
                                  {r.Status === 'Active' ? 'Действующая' : r.Status === 'Terminated' ? 'Ликвидирована' : r.Status}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredResults.length === 0 && (
                    <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
                      Нет результатов по выбранным фильтрам
                    </div>
                  )}
                </div>
                {visibleCount < filteredResults.length && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={() => setVisibleCount(prev => prev + 20)}>
                      Показать ещё ({filteredResults.length - visibleCount} осталось)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Company detail card */}
          {selectedCompany && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedCompany(null); }}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Назад к поиску
              </Button>
              <CompanyDetailCard
                company={selectedCompany}
                entityType={entityType}
                additional={additionalData}
                selectedSections={selectedSections}
                onSave={handleSaveReport}
                onCopy={handleCopyToClipboard}
                initialTrademarks={trademarksData}
                loadingDetail={loadingDetail}
              />
            </>
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
  initialTrademarks?: any[];
  loadingDetail?: boolean;
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

function normalizeCompanyData(raw: any): any {
  const c = { ...raw };

  // Name
  if (!c.Name && c.Names?.Items?.length > 0) {
    c.Name = c.Names.Items[0].ShortName || c.Names.Items[0].FullName;
  }
  // FullName for "Полное название"
  if (!c.FullName && c.Names?.Items?.length > 0) {
    c.FullName = c.Names.Items[0].FullName;
  }

  // Address
  if (!c.Address && c.Addresses?.Items?.length > 0) {
    const actual = c.Addresses.Items.find((a: any) => a.IsActual) || c.Addresses.Items[0];
    c.Address = actual.UnsplittedAddress || actual.Address;
  }

  // ManagerName + Managers list
  if (c.Managers?.Items?.length > 0) {
    if (!c.ManagerName) {
      const director = c.Managers.Items.find((m: any) =>
        m.IsActual && m.Position?.some((p: any) => p.PositionType === '02')
      ) || c.Managers.Items.find((m: any) => m.IsActual) || c.Managers.Items[0];
      c.ManagerName = director?.Entity?.Name || director?.Name;
    }
    c._managers = c.Managers.Items;
  }

  // Founders
  if (c.Founders?.Items?.length > 0) {
    c._founders = c.Founders.Items;
  }

  // Capital
  if (c.Capital == null && c.AuthorizedCapitals?.Items?.length > 0) {
    const actual = c.AuthorizedCapitals.Items.find((a: any) => a.IsActual) || c.AuthorizedCapitals.Items[0];
    c.Capital = actual.Sum;
    c._capitalType = actual.Type;
  }

  // EmployeesCount + history
  if (c.EmployeesCount == null && c.EmployeesInfo?.Items?.length > 0) {
    const sorted = [...c.EmployeesInfo.Items].sort((a: any, b: any) => (b.Year || 0) - (a.Year || 0));
    c.EmployeesCount = sorted[0]?.Count;
    c._employeesHistory = sorted;
  }

  // ActivityTypes
  if (c.ActivityTypes?.Items) {
    c.MainActivityType = c.ActivityTypes.Items.find((a: any) => a.IsMain);
    c._activityTypes = c.ActivityTypes.Items;
    c.ActivityTypes = c.ActivityTypes.Items.filter((a: any) => !a.IsMain);
  }

  // Taxation
  if (c.Taxation?.Items?.length > 0) {
    const actual = c.Taxation.Items.find((t: any) => t.IsActual) || c.Taxation.Items[0];
    c._taxation = actual.Types || actual;
  }

  // Rsmp
  if (c.Rsmp?.Items?.length > 0) {
    const actual = c.Rsmp.Items.find((r: any) => r.IsActual) || c.Rsmp.Items[0];
    c.RsmpCategory = actual.Category;
  }

  // OtherAddresses
  if (!c.OtherAddresses && c.Addresses?.Items?.length > 1) {
    c.OtherAddresses = c.Addresses.Items
      .filter((a: any) => !a.IsActual)
      .map((a: any) => a.UnsplittedAddress || a.Address)
      .filter(Boolean);
  }

  // Phones/Emails/Sites from ContactInfo
  if (c.ContactInfo?.Items?.length > 0) {
    if (!c.Phones?.length) {
      c.Phones = c.ContactInfo.Items.filter((ci: any) => ci.Type === 'Phone').map((ci: any) => ci.Value).filter(Boolean);
    }
    if (!c.Emails?.length) {
      c.Emails = c.ContactInfo.Items.filter((ci: any) => ci.Type === 'Email').map((ci: any) => ci.Value).filter(Boolean);
    }
    if (!c.Sites?.length) {
      c.Sites = c.ContactInfo.Items.filter((ci: any) => ci.Type === 'Site' || ci.Type === 'Website').map((ci: any) => ci.Value).filter(Boolean);
    }
  }

  return c;
}

const CompanyDetailCard = ({ company, entityType, selectedSections, onSave, onCopy, initialTrademarks = [], loadingDetail }: CompanyDetailCardProps) => {
  const c = normalizeCompanyData(company);
  const otherNames = c.OtherNames && Array.isArray(c.OtherNames) ? c.OtherNames[0] : null;
  const [fipsTrademarks, setFipsTrademarks] = useState<any[]>(initialTrademarks);
  const [fipsLoading, setFipsLoading] = useState(false);

  // Update fipsTrademarks when initialTrademarks changes (from parent async load)
  useEffect(() => {
    if (initialTrademarks.length > 0) {
      setFipsTrademarks(initialTrademarks);
    }
  }, [initialTrademarks]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {c.Name || 'Компания'}
                {loadingDetail && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                {c.Inn && <span>ИНН: {c.Inn}</span>}
                {c.Ogrn && <span>ОГРН: {c.Ogrn}</span>}
                {c.Kpp && <span>КПП: {c.Kpp}</span>}
              </div>
              {c.Address && (
                <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{c.Address}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {c.Status && (
                  <Badge variant={c.Status?.StatusText === 'Действующая' || c.Status === 'Active' ? 'default' : 'destructive'}>
                    {typeof c.Status === 'object' ? (c.Status?.StatusText || c.Status?.ReasonText || 'Неизвестно') : (c.Status === 'Active' ? 'Действующая' : c.Status)}
                  </Badge>
                )}
                {c.Type && (
                  <Badge variant="secondary">
                    {c.Type === 'Company' ? 'Юр. лицо' : c.Type === 'Entrepreneur' ? 'ИП' : c.Type}
                  </Badge>
                )}
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
        <Tabs defaultValue={selectedSections[0] || 'requisites'}>
          <TabsList className="flex-wrap h-auto">
            {DATA_SECTIONS.filter(s => selectedSections.includes(s.key)).map(s => (
              <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>
            ))}
          </TabsList>

          {selectedSections.includes('requisites') && (
            <TabsContent value="requisites">
              <DataGrid data={[
                { label: 'Полное название', value: c.FullName || otherNames || c.Name },
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
              {c._taxation && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Система налогообложения</h4>
                  <div className="space-y-1">
                    {Array.isArray(c._taxation) ? c._taxation.map((t: any, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground">{t.Name || t.Code || safeString(t)}</div>
                    )) : (
                      <div className="text-sm text-muted-foreground">{safeString(c._taxation)}</div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {selectedSections.includes('management') && (
            <TabsContent value="management">
              <DataGrid data={[
                { label: 'Руководитель', value: c.ManagerName },
              ]} />
              {c._managers && c._managers.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Руководители и учредители</h4>
                  <div className="overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium text-muted-foreground">ФИО / Название</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Должность</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Дата</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c._managers.map((m: any, i: number) => {
                          const name = m.Entity?.Name || m.Name || 'Без имени';
                          const positions = m.Position || [];
                          const positionText = positions.map((p: any) => p.PositionName || p.Name).filter(Boolean).join(', ') || '—';
                          const date = m.Date || positions[0]?.Date;
                          return (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2">{name}</td>
                              <td className="p-2 text-muted-foreground">{positionText}</td>
                              <td className="p-2 text-muted-foreground">{formatDate(date) || '—'}</td>
                              <td className="p-2">
                                <Badge variant={m.IsActual ? 'default' : 'secondary'} className="text-[10px]">
                                  {m.IsActual ? 'Действующий' : 'Бывший'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {c._founders && c._founders.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Учредители</h4>
                  <div className="space-y-1">
                    {c._founders.map((f: any, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground">
                        {f.Entity?.Name || f.Name || safeString(f)}
                        {f.Share?.Percent != null && ` — ${f.Share.Percent}%`}
                      </div>
                    ))}
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
                <div className="text-sm mb-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Badge variant="default" className="text-[10px] mb-1">Основной</Badge>
                  <div className="font-medium">{c.MainActivityType.Code} — {c.MainActivityType.Name || 'Без названия'}</div>
                </div>
              ) : null}
              {c._activityTypes && c._activityTypes.filter((a: any) => !a.IsMain).length > 0 ? (
                <div className="space-y-1.5">
                  <h4 className="text-sm font-medium">Дополнительные виды деятельности:</h4>
                  {c._activityTypes.filter((a: any) => !a.IsMain).map((act: any, i: number) => (
                    <div key={i} className="text-sm text-muted-foreground">
                      <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded mr-2">{act.Code}</span>
                      {act.Name || '—'}
                    </div>
                  ))}
                </div>
              ) : c.ActivityTypes && Array.isArray(c.ActivityTypes) && c.ActivityTypes.length > 0 ? (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Дополнительные коды:</h4>
                  {c.ActivityTypes.map((act: any, i: number) => (
                    <div key={i} className="text-sm text-muted-foreground">
                      <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded mr-2">{act.Code || act}</span>
                      {act.Name || ''}
                    </div>
                  ))}
                </div>
              ) : null}
              {!c.MainActivityType && (!c.ActivityTypes || c.ActivityTypes.length === 0) && (!c._activityTypes || c._activityTypes.length === 0) && (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              )}
            </TabsContent>
          )}

          {selectedSections.includes('finances') && (
            <TabsContent value="finances">
              <DataGrid data={[
                { label: 'Уставный капитал', value: c.Capital != null ? `${Number(c.Capital).toLocaleString('ru-RU')} ₽` : null },
                { label: 'Тип капитала', value: c._capitalType },
              ]} />
              {c._employeesHistory && c._employeesHistory.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Численность сотрудников по годам</h4>
                  <div className="overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium text-muted-foreground">Год</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Количество</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c._employeesHistory.map((e: any, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2">{e.Year || '—'}</td>
                            <td className="p-2">{e.Count != null ? e.Count : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {c._taxation && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Система налогообложения</h4>
                  <div className="space-y-1">
                    {Array.isArray(c._taxation) ? c._taxation.map((t: any, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground">{t.Name || t.Code || safeString(t)}</div>
                    )) : (
                      <div className="text-sm text-muted-foreground">{safeString(c._taxation)}</div>
                    )}
                  </div>
                </div>
              )}
              {!c.Capital && !c._employeesHistory && !c._taxation && <p className="text-sm text-muted-foreground">Нет финансовых данных</p>}
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
                      const fipsUrl = regNum ? `https://fips.ru/registers-doc-view/fips_servlet?DB=RUTM&DocNumber=${regNum}&TypeFile=html` : null;
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
