import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Search, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, X, Eraser, ExternalLink, ChevronDown, Download, Loader2, SlidersHorizontal } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface Trademark {
  id: string;
  registration_number: string | null;
  registration_date: string | null;
  well_known_trademark_date: string | null;
  legally_related_registrations: string | null;
  right_holder_name: string | null;
  foreign_right_holder_name: string | null;
  right_holder_address: string | null;
  right_holder_country_code: string | null;
  right_holder_ogrn: string | null;
  right_holder_inn: string | null;
  correspondence_address: string | null;
  collective: boolean | null;
  collective_users: string | null;
  extraction_from_charter: string | null;
  color_specification: string | null;
  unprotected_elements: string | null;
  kind_specification: string | null;
  threedimensional: boolean | null;
  holographic: boolean | null;
  sound: boolean | null;
  olfactory: boolean | null;
  color: boolean | null;
  light: boolean | null;
  changing: boolean | null;
  positional: boolean | null;
  actual: boolean | null;
  fips_updated: boolean;
  metadata: any;
  created_at: string;
  updated_at: string;
  description_element: string | null;
  description_image: string | null;
  transliteration: string | null;
  translation: string | null;
  note: string | null;
  publication_url: string | null;
  threedimensional_specification: string | null;
  holographic_specification: string | null;
  sound_specification: string | null;
  olfactory_specification: string | null;
  color_trademark_specification: string | null;
  light_specification: string | null;
  changing_specification: string | null;
  positional_specification: string | null;
  place_name_specification: string | null;
  phonetics_specification: string | null;
  change_right_holder_name_history: string | null;
  change_right_holder_address_history: string | null;
  change_correspondence_address_history: string | null;
  change_legal_related_registrations_history: string | null;
  change_color_specification_history: string | null;
  change_disclaimer_history: string | null;
  change_description_element_history: string | null;
  change_description_image_history: string | null;
  change_note_history: string | null;
}

const PAGE_SIZE = 50;

const parseCSVLine = (line: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
};

// Normalize header: lowercase, replace spaces/hyphens with underscores
const normalizeHeader = (h: string): string =>
  h.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '');

const FIELD_MAP: Record<string, string> = {
  registration_number: 'registration_number',
  registration_date: 'registration_date',
  well_known_trademark_date: 'well_known_trademark_date',
  legally_related_registrations: 'legally_related_registrations',
  right_holder_name: 'right_holder_name',
  foreign_right_holder_name: 'foreign_right_holder_name',
  right_holder_address: 'right_holder_address',
  right_holder_country_code: 'right_holder_country_code',
  right_holder_ogrn: 'right_holder_ogrn',
  right_holder_inn: 'right_holder_inn',
  correspondence_address: 'correspondence_address',
  collective: 'collective',
  collective_users: 'collective_users',
  extraction_from_charter_of_the_collective_trademark: 'extraction_from_charter',
  extraction_from_charter: 'extraction_from_charter',
  color_specification: 'color_specification',
  unprotected_elements: 'unprotected_elements',
  disclaimer: 'unprotected_elements',
  kind_specification: 'kind_specification',
  threedimensional: 'threedimensional',
  holographic: 'holographic',
  sound: 'sound',
  olfactory: 'olfactory',
  color: 'color',
  light: 'light',
  changing: 'changing',
  positional: 'positional',
  actual: 'actual',
  description_element: 'description_element',
  description_image: 'description_image',
  transliteration: 'transliteration',
  translation: 'translation',
  note: 'note',
  publication_url: 'publication_url',
  threedimensional_specification: 'threedimensional_specification',
  holographic_specification: 'holographic_specification',
  sound_specification: 'sound_specification',
  olfactory_specification: 'olfactory_specification',
  color_trademark_specification: 'color_trademark_specification',
  light_specification: 'light_specification',
  changing_specification: 'changing_specification',
  positional_specification: 'positional_specification',
  place_name_specification: 'place_name_specification',
  phonetics_specification: 'phonetics_specification',
  change_right_holder_name_history: 'change_right_holder_name_history',
  change_right_holder_address_history: 'change_right_holder_address_history',
  change_correspondence_address_history: 'change_correspondence_address_history',
  change_legal_related_registrations_history: 'change_legal_related_registrations_history',
  change_color_specification_history: 'change_color_specification_history',
  change_disclaimer_history: 'change_disclaimer_history',
  change_description_element_history: 'change_description_element_history',
  change_description_image_history: 'change_description_image_history',
  change_note_history: 'change_note_history',
};

const BOOLEAN_FIELDS = new Set([
  'collective', 'threedimensional', 'holographic', 'sound',
  'olfactory', 'color', 'light', 'changing', 'positional', 'actual',
]);

const DATE_FIELDS = new Set(['registration_date', 'well_known_trademark_date']);

export default function Trademarks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advSearchName, setAdvSearchName] = useState('');
  const [advSearchAddress, setAdvSearchAddress] = useState('');
  const [advSearchInn, setAdvSearchInn] = useState('');
  const [advSearchOgrn, setAdvSearchOgrn] = useState('');
  const [advSearchRegNum, setAdvSearchRegNum] = useState('');
  const [advSearchForeignName, setAdvSearchForeignName] = useState('');
  const [advSearchCorrAddress, setAdvSearchCorrAddress] = useState('');
  const [advSearchWellKnownDate, setAdvSearchWellKnownDate] = useState('');
  const [appliedAdvSearch, setAppliedAdvSearch] = useState<{name: string; address: string; inn: string; ogrn: string; regNum: string; foreignName: string; corrAddress: string; wellKnownDate: string}>({name: '', address: '', inn: '', ogrn: '', regNum: '', foreignName: '', corrAddress: '', wellKnownDate: ''});
  const [page, setPage] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, any>[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailTm, setDetailTm] = useState<Trademark | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [fipsData, setFipsData] = useState<Record<string, any> | null>(null);
  const [fipsLoading, setFipsLoading] = useState<string | null>(null);
  const [fipsPreviewOpen, setFipsPreviewOpen] = useState(false);
  const [fipsTargetId, setFipsTargetId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const hasAdvancedFilters = !!(appliedAdvSearch.name || appliedAdvSearch.address || appliedAdvSearch.inn || appliedAdvSearch.ogrn || appliedAdvSearch.regNum);

  const handleAdvancedSearch = () => {
    setAppliedAdvSearch({ name: advSearchName.trim(), address: advSearchAddress.trim(), inn: advSearchInn.trim(), ogrn: advSearchOgrn.trim(), regNum: advSearchRegNum.trim() });
    setPage(0);
  };

  const handleAdvancedReset = () => {
    setAdvSearchName(''); setAdvSearchAddress(''); setAdvSearchInn(''); setAdvSearchOgrn(''); setAdvSearchRegNum('');
    setAppliedAdvSearch({ name: '', address: '', inn: '', ogrn: '', regNum: '' });
    setPage(0);
  };

  const LIST_FIELDS = 'id, registration_number, right_holder_name, right_holder_inn, right_holder_ogrn, right_holder_address, registration_date, actual, fips_updated, metadata, created_at';

  const applyFilters = (query: any, searchTerm: string, status: string, adv: typeof appliedAdvSearch) => {
    // Quick search: prefix match on registration_number only
    if (searchTerm) {
      query = query.ilike('registration_number', `${searchTerm}%`);
    }
    // Advanced field-specific filters (AND)
    if (adv.name) {
      query = query.ilike('right_holder_name', `%${adv.name}%`);
    }
    if (adv.address) {
      query = query.ilike('right_holder_address', `%${adv.address}%`);
    }
    if (adv.inn) {
      query = query.eq('right_holder_inn', adv.inn);
    }
    if (adv.ogrn) {
      query = query.eq('right_holder_ogrn', adv.ogrn);
    }
    if (adv.regNum) {
      query = query.eq('registration_number', adv.regNum);
    }
    // Status filter
    if (status === 'active') {
      query = query.eq('actual', true);
    } else if (status === 'inactive') {
      query = query.eq('actual', false);
    } else if (status === 'fips_updated') {
      query = query.eq('fips_updated', true);
    } else if (status === 'not_updated') {
      query = query.eq('fips_updated', false);
    }
    return query;
  };

  const { data: queryResult, isLoading } = useQuery({
    queryKey: ['trademarks', debouncedSearch, statusFilter, page, appliedAdvSearch],
    queryFn: async () => {
      let query = supabase
        .from('trademarks')
        .select(LIST_FIELDS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      query = applyFilters(query, debouncedSearch, statusFilter, appliedAdvSearch);

      const { data, count, error } = await query;
      if (error) throw error;
      return { data: data as unknown as Trademark[], count: count ?? 0 };
    },
  });

  const trademarks = queryResult?.data;
  const totalCount = queryResult?.count ?? 0;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trademarks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trademarks'] });
      toast({ title: 'Запись удалена' });
      setDeleteId(null);
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadProgress(null);

    const slice = file.slice(0, 64 * 1024);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast({ title: 'Файл пуст', variant: 'destructive' }); return; }
      const delimiter = lines[0].includes(';') ? ';' : ',';
      const rawHeaders = parseCSVLine(lines[0], delimiter).map(h => h.replace(/^"|"$/g, '').trim());
      const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));
      const rows: Record<string, any>[] = [];
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const values = parseCSVLine(lines[i], delimiter);
        const row: Record<string, any> = {};
        rawHeaders.forEach((h, idx) => { row[h] = values[idx] || ''; });
        rows.push(row);
      }
      const mappedCount = normalizedHeaders.filter(h => FIELD_MAP[h]).length;
      setPreviewData(rows);
      toast({ title: `Распознано ${mappedCount} из ${rawHeaders.length} полей для импорта` });
    };
    reader.readAsText(slice, 'utf-8');
  }, [toast]);

  const parseCSVRows = useCallback((text: string, headers: string[], delimiter: string): { rows: Record<string, any>[]; remainder: string } => {
    const rows: Record<string, any>[] = [];
    const lines: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') inQ = !inQ;
      if ((c === '\n' || c === '\r') && !inQ) {
        if (cur.trim()) lines.push(cur);
        cur = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else { cur += c; }
    }
    let remainder = '';
    if (cur.trim()) { if (inQ) remainder = cur; else lines.push(cur); }

    for (const line of lines) {
      const values = parseCSVLine(line, delimiter);
      if (values.length < 2) continue;
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        const dbField = FIELD_MAP[h];
        if (!dbField || !values[idx]) return;
        const val = values[idx];
        if (BOOLEAN_FIELDS.has(dbField)) {
          row[dbField] = val === '1' || val.toLowerCase() === 'true' || val.toLowerCase() === 'yes';
        } else if (DATE_FIELDS.has(dbField)) {
          if (/^\d{4}-\d{2}-\d{2}/.test(val)) row[dbField] = val.substring(0, 10);
          else if (/^\d{2}\.\d{2}\.\d{4}/.test(val)) { const [d, m, y] = val.split('.'); row[dbField] = `${y}-${m}-${d}`; }
          else if (/^\d{8}$/.test(val)) row[dbField] = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
          else row[dbField] = null;
        } else { row[dbField] = val; }
      });
      if (Object.keys(row).length > 0) rows.push(row);
    }
    return { rows, remainder };
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFile.size });
    try {
      const CHUNK = 512 * 1024;
      const DB_BATCH = 500;
      let total = 0, headers: string[] | null = null, delim = ';', left = '';
      const sz = selectedFile.size, chunks = Math.ceil(sz / CHUNK);

      for (let ci = 0; ci < chunks; ci++) {
        const s = ci * CHUNK, e = Math.min(s + CHUNK, sz);
        let ct = await selectedFile.slice(s, e).text();
        if (ci === 0) ct = ct.replace(/^\uFEFF/, '');
        ct = left + ct; left = '';

        if (!headers) {
          const nl = ct.indexOf('\n');
          if (nl === -1) continue;
          const hl = ct.substring(0, nl).replace(/\r$/, '');
          delim = hl.includes(';') ? ';' : ',';
          headers = parseCSVLine(hl, delim).map(h => normalizeHeader(h.replace(/^"|"$/g, '').trim()));
          ct = ct.substring(nl + 1);
        }

        const { rows, remainder } = parseCSVRows(ct, headers, delim);
        left = remainder;

        for (let i = 0; i < rows.length; i += DB_BATCH) {
          const batch = rows.slice(i, i + DB_BATCH);
          if (batch.length > 0) {
            const { error } = await supabase.from('trademarks').insert(batch);
            if (error) throw error;
            total += batch.length;
          }
        }
        setUploadProgress({ current: e, total: sz });
        await new Promise(r => setTimeout(r, 0));
      }

      if (left.trim() && headers) {
        const { rows } = parseCSVRows(left, headers, delim);
        if (rows.length > 0) {
          const { error } = await supabase.from('trademarks').insert(rows);
          if (error) throw error;
          total += rows.length;
        }
      }

      toast({ title: `Импортировано ${total} записей` });
      queryClient.invalidateQueries({ queryKey: ['trademarks'] });
      setUploadOpen(false);
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err: any) {
      toast({ title: 'Ошибка импорта', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }, [selectedFile, toast, queryClient, parseCSVRows]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      const { error } = await supabase.from('trademarks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['trademarks'] });
      toast({ title: 'База очищена' });
      setClearAllOpen(false);
      setPage(0);
    } catch (err: any) {
      toast({ title: 'Ошибка очистки', description: err.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  }, [queryClient, toast]);

  const handleFipsFetch = useCallback(async (tm: Trademark) => {
    if (!tm.registration_number) {
      toast({ title: 'Нет номера регистрации', variant: 'destructive' });
      return;
    }
    setFipsLoading(tm.id);
    try {
      const { data, error } = await supabase.functions.invoke('fips-parse', {
        body: { registration_number: tm.registration_number },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFipsData(data.data);
      setFipsTargetId(tm.id);
      setFipsPreviewOpen(true);
    } catch (err: any) {
      toast({ title: 'Ошибка загрузки с ФИПС', description: err.message, variant: 'destructive' });
    } finally {
      setFipsLoading(null);
    }
  }, [toast]);

  const handleFipsSave = useCallback(async () => {
    if (!fipsData || !fipsTargetId) return;
    try {
      const updateData: Record<string, any> = {};
      
      // Map all direct DB fields
      if (fipsData.right_holder_name) updateData.right_holder_name = fipsData.right_holder_name;
      if (fipsData.right_holder_country_code) updateData.right_holder_country_code = fipsData.right_holder_country_code;
      if (fipsData.correspondence_address) updateData.correspondence_address = fipsData.correspondence_address;
      if (fipsData.registration_date) updateData.registration_date = fipsData.registration_date;
      if (fipsData.color_specification) updateData.color_specification = fipsData.color_specification;
      if (fipsData.unprotected_elements) updateData.unprotected_elements = fipsData.unprotected_elements;
      if (fipsData.kind_specification) updateData.kind_specification = fipsData.kind_specification;
      if (fipsData.transliteration) updateData.transliteration = fipsData.transliteration;
      if (fipsData.translation) updateData.translation = fipsData.translation;
      if (fipsData.actual !== undefined) updateData.actual = fipsData.actual;
      if (fipsData.publication_url) updateData.publication_url = fipsData.publication_url;
      
      // Merge metadata preserving existing data
      const existingTm = trademarks?.find(t => t.id === fipsTargetId);
      const existingMeta = (existingTm?.metadata && typeof existingTm.metadata === 'object') ? existingTm.metadata : {};
      const meta: Record<string, any> = { ...existingMeta };
      
      if (fipsData.image_url) meta.fips_image_url = fipsData.image_url;
      if (fipsData.image_url_full) meta.fips_image_url_full = fipsData.image_url_full;
      if (fipsData.expiry_date) meta.expiry_date = fipsData.expiry_date;
      if (fipsData.classes_mktu) meta.classes_mktu = fipsData.classes_mktu;
      if (fipsData.application_number) meta.application_number = fipsData.application_number;
      if (fipsData.application_date) meta.application_date = fipsData.application_date;
      if (fipsData.priority_date) meta.priority_date = fipsData.priority_date;
      if (fipsData.publication_date) meta.publication_date = fipsData.publication_date;
      if (fipsData.bulletin_number) meta.bulletin_number = fipsData.bulletin_number;
      if (fipsData.fips_url) meta.fips_url = fipsData.fips_url;
      meta.fips_updated_at = new Date().toISOString();
      
      updateData.metadata = meta;
      updateData.fips_updated = true;

      const { error } = await supabase.from('trademarks').update(updateData).eq('id', fipsTargetId);
      if (error) throw error;

      // Refresh detailTm with saved data so the card updates immediately
      const { data: refreshed } = await supabase.from('trademarks').select('*').eq('id', fipsTargetId).single();
      if (refreshed) setDetailTm(refreshed as Trademark);

      toast({ title: 'Данные с ФИПС сохранены' });
      queryClient.invalidateQueries({ queryKey: ['trademarks'] });
      
      setFipsPreviewOpen(false);
      setFipsData(null);
      setFipsTargetId(null);
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err.message, variant: 'destructive' });
    }
  }, [fipsData, fipsTargetId, toast, queryClient, trademarks]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">База товарных знаков</h1>
          <p className="text-muted-foreground">
            {totalCount !== undefined ? `${totalCount} записей` : 'Загрузка...'}
          </p>
        </div>
        <div className="flex gap-2">
          {(totalCount ?? 0) > 0 && (
            <Button variant="outline" onClick={() => setClearAllOpen(true)} className="gap-2 text-destructive">
              <Eraser className="h-4 w-4" />
              Очистить
            </Button>
          )}
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Импорт CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Быстрый поиск по номеру ТЗ..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
              {search && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Действующие</SelectItem>
                <SelectItem value="inactive">Недействующие</SelectItem>
                <SelectItem value="fips_updated">Обновлены с ФИПС</SelectItem>
                <SelectItem value="not_updated">Не обновлены</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground px-0">
                <SlidersHorizontal className="h-4 w-4" />
                Расширенный поиск
                {hasAdvancedFilters && <Badge variant="secondary" className="text-xs px-1.5 py-0">Активен</Badge>}
                <ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Правообладатель</label>
                  <Input placeholder="Название компании..." value={advSearchName} onChange={(e) => setAdvSearchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdvancedSearch()} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Адрес правообладателя</label>
                  <Input placeholder="Город, улица..." value={advSearchAddress} onChange={(e) => setAdvSearchAddress(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdvancedSearch()} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Номер ТЗ (точный)</label>
                  <Input placeholder="123456" value={advSearchRegNum} onChange={(e) => setAdvSearchRegNum(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdvancedSearch()} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">ИНН (точный)</label>
                  <Input placeholder="1234567890" value={advSearchInn} onChange={(e) => setAdvSearchInn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdvancedSearch()} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">ОГРН (точный)</label>
                  <Input placeholder="1234567890123" value={advSearchOgrn} onChange={(e) => setAdvSearchOgrn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdvancedSearch()} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="ghost" size="sm" onClick={handleAdvancedReset} disabled={!hasAdvancedFilters && !advSearchName && !advSearchAddress && !advSearchInn && !advSearchOgrn && !advSearchRegNum}>
                  Сбросить
                </Button>
                <Button size="sm" onClick={handleAdvancedSearch} className="gap-1">
                  <Search className="h-3 w-3" />
                  Найти
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Рег. номер</TableHead>
                <TableHead>Правообладатель</TableHead>
                <TableHead className="w-[120px]">ИНН</TableHead>
                <TableHead className="w-[120px]">ОГРН</TableHead>
                <TableHead className="w-[100px]">Дата рег.</TableHead>
                <TableHead className="w-[80px]">Статус</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : trademarks?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Нет записей. Импортируйте CSV-файл.
                  </TableCell>
                </TableRow>
              ) : trademarks?.map((tm) => (
                <TableRow
                  key={tm.id}
                  className={`cursor-pointer ${tm.fips_updated ? 'bg-primary/5 hover:bg-primary/10' : ''}`}
                  onClick={async () => {
                    // Fetch fresh data to ensure metadata is up-to-date
                    const { data: fresh } = await supabase.from('trademarks').select('*').eq('id', tm.id).single();
                    setDetailTm((fresh || tm) as Trademark);
                  }}
                >
                  <TableCell className="font-mono text-sm">{tm.registration_number || '—'}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{tm.right_holder_name || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{tm.right_holder_inn || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{tm.right_holder_ogrn || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {tm.registration_date ? new Date(tm.registration_date).toLocaleDateString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={tm.actual ? 'default' : 'secondary'}>
                        {tm.actual ? 'Действ.' : 'Недейств.'}
                      </Badge>
                      {tm.fips_updated && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/30 text-primary">
                          ФИПС
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Загрузить с ФИПС"
                        disabled={fipsLoading === tm.id || !tm.registration_number}
                        onClick={(e) => { e.stopPropagation(); handleFipsFetch(tm); }}
                      >
                        {fipsLoading === tm.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(tm.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Стр. {page + 1} из {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) { setPreviewData(null); setSelectedFile(null); } }}>
        <DialogContent className="max-w-[90vw] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Импорт CSV</DialogTitle>
            <DialogDescription>
              Загрузите CSV-файл с товарными знаками. Поддерживаются разделители ; и ,
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <Input type="file" accept=".csv" onChange={handleFileSelect} disabled={uploading} />

            {selectedFile && (
              <p className="text-xs text-muted-foreground">
                Размер файла: {(selectedFile.size / (1024 * 1024)).toFixed(1)} МБ
              </p>
            )}

            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Импорт...</span>
                  <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                </div>
                <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
              </div>
            )}

            {previewData && previewData.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Превью (первые {previewData.length} записей):</p>
                <p className="text-xs text-muted-foreground">Всего колонок в CSV: {Object.keys(previewData[0] || {}).length}</p>
                <div className="rounded border overflow-auto flex-1 min-h-0" style={{ maxHeight: '400px' }}>
                  <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-2 py-1 border-b text-left font-medium text-muted-foreground">#</th>
                        {Object.keys(previewData[0] || {}).map((key) => (
                          <th key={key} className="px-2 py-1 border-b text-left font-medium text-muted-foreground whitespace-nowrap max-w-[120px] truncate" title={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                          {Object.keys(previewData[0] || {}).map((key) => (
                            <td key={key} className="px-2 py-1 whitespace-nowrap max-w-[120px] truncate" title={row[key] != null ? String(row[key]) : ''}>
                              {row[key] != null && String(row[key]).length > 0 ? String(row[key]) : <span className="text-muted-foreground">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Отмена</Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? 'Импорт...' : 'Импортировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailTm} onOpenChange={(open) => { if (!open) setDetailTm(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ТЗ №{detailTm?.registration_number || '—'}</DialogTitle>
            <DialogDescription>
              {detailTm?.actual ? 'Действующий' : 'Недействующий'} товарный знак
            </DialogDescription>
          </DialogHeader>
          {detailTm && (
            <div className="space-y-4 text-sm">
              {/* FIPS updated badge */}
              {detailTm.metadata?.fips_updated_at && (
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                  <Badge variant="default" className="text-xs">ФИПС</Badge>
                  <span className="text-xs text-muted-foreground">
                    Карточка обновлена из реестра ФИПС: {new Date(detailTm.metadata.fips_updated_at).toLocaleString('ru-RU')}
                  </span>
                </div>
              )}

              {/* FIPS Image */}
              {detailTm.metadata?.fips_image_url && (
                <div className="flex justify-center">
                  <img
                    src={detailTm.metadata.fips_image_url}
                    alt="Изображение товарного знака"
                    className="max-h-[180px] max-w-full object-contain rounded border p-2"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}

              {/* Основная информация */}
              <div>
                <h4 className="font-semibold text-base mb-2 text-foreground">Основная информация</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InfoRow label="Рег. номер" value={detailTm.registration_number} />
                  <InfoRow label="Дата регистрации" value={detailTm.registration_date ? new Date(detailTm.registration_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Статус" value={detailTm.actual ? 'Действующий' : 'Недействующий'} />
                  <InfoRow label="Вид знака" value={detailTm.kind_specification} />
                  <InfoRow label="Срок действия до" value={detailTm.metadata?.expiry_date ? new Date(detailTm.metadata.expiry_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Заявка №" value={detailTm.metadata?.application_number} />
                  <InfoRow label="Дата подачи заявки" value={detailTm.metadata?.application_date ? new Date(detailTm.metadata.application_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Дата приоритета" value={detailTm.metadata?.priority_date ? new Date(detailTm.metadata.priority_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Дата общеизвестности" value={detailTm.well_known_trademark_date ? new Date(detailTm.well_known_trademark_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Связанные рег." value={detailTm.legally_related_registrations} />
                </div>
              </div>

              {/* Публикация */}
              {(detailTm.publication_url || detailTm.metadata?.fips_url || detailTm.metadata?.publication_date || detailTm.metadata?.bulletin_number) && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Публикация</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <InfoRow label="Дата публикации" value={detailTm.metadata?.publication_date ? new Date(detailTm.metadata.publication_date).toLocaleDateString('ru-RU') : null} />
                    <InfoRow label="Бюллетень №" value={detailTm.metadata?.bulletin_number} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {detailTm.metadata?.fips_url && (
                      <a href={detailTm.metadata.fips_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Реестр ФИПС
                      </a>
                    )}
                    {detailTm.publication_url && (
                      <a href={detailTm.publication_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Публикация
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Правообладатель */}
              <div>
                <h4 className="font-semibold text-base mb-2 text-foreground">Правообладатель</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InfoRow label="Наименование" value={detailTm.right_holder_name} />
                  <InfoRow label="Наименование (ин.)" value={detailTm.foreign_right_holder_name} />
                  <InfoRow label="ИНН" value={detailTm.right_holder_inn} />
                  <InfoRow label="ОГРН" value={detailTm.right_holder_ogrn} />
                  <InfoRow label="Код страны" value={detailTm.right_holder_country_code} />
                </div>
                <div className="mt-2 space-y-2">
                  <InfoRow label="Адрес" value={detailTm.right_holder_address} />
                  <InfoRow label="Адрес для переписки" value={detailTm.correspondence_address} />
                </div>
              </div>

              {/* Описание обозначения */}
              {(detailTm.description_element || detailTm.description_image || detailTm.transliteration || detailTm.translation || detailTm.note) && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Описание обозначения</h4>
                  <div className="space-y-2">
                    <InfoRow label="Описание" value={detailTm.description_element} />
                    <InfoRow label="Изображение" value={detailTm.description_image} />
                    <InfoRow label="Транслитерация" value={detailTm.transliteration} />
                    <InfoRow label="Перевод" value={detailTm.translation} />
                    <InfoRow label="Примечание" value={detailTm.note} />
                  </div>
                </div>
              )}

              {/* Характеристики знака */}
              {(detailTm.threedimensional || detailTm.holographic || detailTm.sound || detailTm.olfactory || detailTm.color || detailTm.light || detailTm.changing || detailTm.positional || detailTm.collective) && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Характеристики знака</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailTm.collective && <Badge variant="outline">Коллективный</Badge>}
                    {detailTm.threedimensional && <Badge variant="outline">Объёмный (3D)</Badge>}
                    {detailTm.holographic && <Badge variant="outline">Голографический</Badge>}
                    {detailTm.sound && <Badge variant="outline">Звуковой</Badge>}
                    {detailTm.olfactory && <Badge variant="outline">Обонятельный</Badge>}
                    {detailTm.color && <Badge variant="outline">Цветовой</Badge>}
                    {detailTm.light && <Badge variant="outline">Световой</Badge>}
                    {detailTm.changing && <Badge variant="outline">Изменяющийся</Badge>}
                    {detailTm.positional && <Badge variant="outline">Позиционный</Badge>}
                  </div>
                </div>
              )}

              {/* Спецификации */}
              {(detailTm.threedimensional_specification || detailTm.holographic_specification || detailTm.sound_specification || detailTm.olfactory_specification || detailTm.color_trademark_specification || detailTm.light_specification || detailTm.changing_specification || detailTm.positional_specification || detailTm.place_name_specification || detailTm.phonetics_specification) && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Спецификации</h4>
                  <div className="space-y-2">
                    <InfoRow label="Объёмный (3D)" value={detailTm.threedimensional_specification} />
                    <InfoRow label="Голографический" value={detailTm.holographic_specification} />
                    <InfoRow label="Звуковой" value={detailTm.sound_specification} />
                    <InfoRow label="Обонятельный" value={detailTm.olfactory_specification} />
                    <InfoRow label="Цветовой ТЗ" value={detailTm.color_trademark_specification} />
                    <InfoRow label="Световой" value={detailTm.light_specification} />
                    <InfoRow label="Изменяющийся" value={detailTm.changing_specification} />
                    <InfoRow label="Позиционный" value={detailTm.positional_specification} />
                    <InfoRow label="Географическое указание" value={detailTm.place_name_specification} />
                    <InfoRow label="Звуковая характеристика" value={detailTm.phonetics_specification} />
                  </div>
                </div>
              )}

              {/* Дополнительно */}
              {(detailTm.color_specification || detailTm.unprotected_elements || detailTm.collective_users || detailTm.extraction_from_charter) && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Дополнительно</h4>
                  <div className="space-y-2">
                    <InfoRow label="Указание цвета" value={detailTm.color_specification} />
                    <InfoRow label="Неохраняемые элементы" value={detailTm.unprotected_elements} />
                    <InfoRow label="Пользователи коллективного ТЗ" value={detailTm.collective_users} />
                    <InfoRow label="Выписка из устава" value={detailTm.extraction_from_charter} />
                  </div>
                </div>
              )}

              {/* Классы МКТУ */}
              {detailTm.metadata?.classes_mktu && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                      <h4 className="font-semibold text-base text-foreground">Классы МКТУ</h4>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted p-3 rounded text-xs max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {detailTm.metadata.classes_mktu}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* История изменений */}
              {(detailTm.change_right_holder_name_history || detailTm.change_right_holder_address_history || detailTm.change_correspondence_address_history || detailTm.change_legal_related_registrations_history || detailTm.change_color_specification_history || detailTm.change_disclaimer_history || detailTm.change_description_element_history || detailTm.change_description_image_history || detailTm.change_note_history) && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                      <h4 className="font-semibold text-base text-foreground">История изменений</h4>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <InfoRow label="Наименование правообладателя" value={detailTm.change_right_holder_name_history} />
                    <InfoRow label="Адрес правообладателя" value={detailTm.change_right_holder_address_history} />
                    <InfoRow label="Адрес для переписки" value={detailTm.change_correspondence_address_history} />
                    <InfoRow label="Связанные регистрации" value={detailTm.change_legal_related_registrations_history} />
                    <InfoRow label="Цветовое сочетание" value={detailTm.change_color_specification_history} />
                    <InfoRow label="Неохраняемые элементы" value={detailTm.change_disclaimer_history} />
                    <InfoRow label="Описание обозначения" value={detailTm.change_description_element_history} />
                    <InfoRow label="Изображение обозначения" value={detailTm.change_description_image_history} />
                    <InfoRow label="Примечание" value={detailTm.change_note_history} />
                  </CollapsibleContent>
                </Collapsible>
              )}


              <div className="text-xs text-muted-foreground pt-2 border-t">
                Добавлено: {new Date(detailTm.created_at).toLocaleString('ru-RU')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Clear all confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить всю базу?</AlertDialogTitle>
            <AlertDialogDescription>
              Все {totalCount} записей будут удалены. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} disabled={clearing}>
              {clearing ? 'Очистка...' : 'Очистить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* FIPS Preview Dialog */}
      <Dialog open={fipsPreviewOpen} onOpenChange={(open) => { if (!open) { setFipsPreviewOpen(false); setFipsData(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Данные с ФИПС</DialogTitle>
            <DialogDescription>
              Проверьте извлечённые данные перед сохранением
            </DialogDescription>
          </DialogHeader>
          {fipsData && (
            <div className="space-y-4 text-sm">
              {fipsData.image_url && (
                <div className="flex justify-center">
                  <img
                    src={fipsData.image_url}
                    alt="Изображение товарного знака"
                    className="max-h-[200px] max-w-full object-contain rounded border p-2"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              
              {/* Core info */}
              <div>
                <h4 className="font-semibold text-base mb-2 text-foreground">Основная информация</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InfoRow label="Рег. номер" value={fipsData.registration_number} />
                  <InfoRow label="Дата регистрации" value={fipsData.registration_date} />
                  <InfoRow label="Срок действия до" value={fipsData.expiry_date} />
                  <InfoRow label="Статус" value={fipsData.actual === true ? 'Действующий' : fipsData.actual === false ? 'Недействующий' : 'Не определён'} />
                  <InfoRow label="Заявка №" value={fipsData.application_number} />
                  <InfoRow label="Дата подачи заявки" value={fipsData.application_date} />
                  <InfoRow label="Дата приоритета" value={fipsData.priority_date} />
                  <InfoRow label="Дата публикации" value={fipsData.publication_date} />
                  <InfoRow label="Бюллетень №" value={fipsData.bulletin_number} />
                </div>
              </div>
              
              {/* Right holder */}
              <div>
                <h4 className="font-semibold text-base mb-2 text-foreground">Правообладатель</h4>
                <div className="space-y-2">
                  <InfoRow label="Наименование" value={fipsData.right_holder_name} />
                  <InfoRow label="Код страны" value={fipsData.right_holder_country_code} />
                  <InfoRow label="Адрес для переписки" value={fipsData.correspondence_address} />
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="font-semibold text-base mb-2 text-foreground">Характеристики</h4>
                <div className="space-y-2">
                  <InfoRow label="Вид знака" value={fipsData.kind_specification} />
                  <InfoRow label="Указание цвета" value={fipsData.color_specification} />
                  <InfoRow label="Неохраняемые элементы" value={fipsData.unprotected_elements} />
                  <InfoRow label="Транслитерация" value={fipsData.transliteration} />
                  <InfoRow label="Перевод" value={fipsData.translation} />
                </div>
              </div>

              {/* Classes */}
              {fipsData.classes_mktu && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                      <h4 className="font-semibold text-base text-foreground">Классы МКТУ</h4>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted p-3 rounded text-xs max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {fipsData.classes_mktu}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {fipsData.fips_url && (
                <a href={fipsData.fips_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Открыть на ФИПС
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFipsPreviewOpen(false); setFipsData(null); }}>Отмена</Button>
            <Button onClick={handleFipsSave}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-medium">{value}</span>
    </div>
  );
}
