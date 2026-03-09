import { useState, useCallback } from 'react';
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
import { Upload, Search, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, X, Eraser, ExternalLink, ChevronDown } from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState<string>('all');
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

  const { data: trademarks, isLoading } = useQuery({
    queryKey: ['trademarks', search, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('trademarks')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(
          `registration_number.ilike.%${search}%,right_holder_name.ilike.%${search}%,right_holder_inn.ilike.%${search}%,right_holder_ogrn.ilike.%${search}%`
        );
      }

      if (statusFilter === 'active') {
        query = query.eq('actual', true);
      } else if (statusFilter === 'inactive') {
        query = query.eq('actual', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Trademark[];
    },
  });

  const { data: totalCount } = useQuery({
    queryKey: ['trademarks-count', search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('trademarks')
        .select('id', { count: 'exact', head: true });

      if (search) {
        query = query.or(
          `registration_number.ilike.%${search}%,right_holder_name.ilike.%${search}%,right_holder_inn.ilike.%${search}%,right_holder_ogrn.ilike.%${search}%`
        );
      }
      if (statusFilter === 'active') {
        query = query.eq('actual', true);
      } else if (statusFilter === 'inactive') {
        query = query.eq('actual', false);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trademarks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trademarks'] });
      queryClient.invalidateQueries({ queryKey: ['trademarks-count'] });
      toast({ title: 'Запись удалена' });
      setDeleteId(null);
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadProgress(null);

    const slice = file.slice(0, 32 * 1024);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast({ title: 'Файл пуст', variant: 'destructive' }); return; }
      const delimiter = lines[0].includes(';') ? ';' : ',';
      const headers = parseCSVLine(lines[0], delimiter).map(h => normalizeHeader(h.replace(/^"|"$/g, '').trim()));
      const rows: Record<string, any>[] = [];
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const values = parseCSVLine(lines[i], delimiter);
        const row: Record<string, any> = {};
        headers.forEach((h, idx) => { const f = FIELD_MAP[h]; if (f && values[idx]) row[f] = values[idx]; });
        if (Object.keys(row).length > 0) rows.push(row);
      }
      setPreviewData(rows);
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
      queryClient.invalidateQueries({ queryKey: ['trademarks-count'] });
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
      queryClient.invalidateQueries({ queryKey: ['trademarks-count'] });
      toast({ title: 'База очищена' });
      setClearAllOpen(false);
      setPage(0);
    } catch (err: any) {
      toast({ title: 'Ошибка очистки', description: err.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  }, [queryClient, toast]);

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
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по номеру, правообладателю, ИНН, ОГРН..."
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Действующие</SelectItem>
                <SelectItem value="inactive">Недействующие</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  className="cursor-pointer"
                  onClick={() => setDetailTm(tm)}
                >
                  <TableCell className="font-mono text-sm">{tm.registration_number || '—'}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{tm.right_holder_name || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{tm.right_holder_inn || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{tm.right_holder_ogrn || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {tm.registration_date ? new Date(tm.registration_date).toLocaleDateString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tm.actual ? 'default' : 'secondary'}>
                      {tm.actual ? 'Действ.' : 'Недейств.'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(tm.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Импорт CSV</DialogTitle>
            <DialogDescription>
              Загрузите CSV-файл с товарными знаками. Поддерживаются разделители ; и ,
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input type="file" accept=".csv" onChange={handleFileSelect} />

            {previewData && previewData.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Превью (первые {previewData.length} записей):</p>
                <div className="rounded border overflow-auto max-h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Рег. номер</TableHead>
                        <TableHead>Правообладатель</TableHead>
                        <TableHead>Дата рег.</TableHead>
                        <TableHead>Страна</TableHead>
                        <TableHead>Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{row.registration_number || '—'}</TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]">{row.right_holder_name || row.foreign_right_holder_name || '—'}</TableCell>
                          <TableCell className="text-sm">{row.registration_date || '—'}</TableCell>
                          <TableCell className="text-sm">{row.right_holder_country_code || '—'}</TableCell>
                          <TableCell className="text-sm">{row.actual === 'true' || row.actual === '1' || row.actual === true ? 'Действ.' : 'Недейств.'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
              {/* Основная информация */}
              <div>
                <h4 className="font-semibold text-base mb-2 text-foreground">Основная информация</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InfoRow label="Рег. номер" value={detailTm.registration_number} />
                  <InfoRow label="Дата регистрации" value={detailTm.registration_date ? new Date(detailTm.registration_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Статус" value={detailTm.actual ? 'Действующий' : 'Недействующий'} />
                  <InfoRow label="Вид знака" value={detailTm.kind_specification} />
                  <InfoRow label="Дата общеизвестности" value={detailTm.well_known_trademark_date ? new Date(detailTm.well_known_trademark_date).toLocaleDateString('ru-RU') : null} />
                  <InfoRow label="Связанные рег." value={detailTm.legally_related_registrations} />
                </div>
              </div>

              {/* Публикация */}
              {detailTm.publication_url && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Публикация</h4>
                  <a href={detailTm.publication_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Открыть на сайте ФИПС
                  </a>
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

              {/* Метаданные */}
              {detailTm.metadata && Object.keys(detailTm.metadata).length > 0 && (
                <div>
                  <h4 className="font-semibold text-base mb-2 text-foreground">Метаданные</h4>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[200px]">
                    {JSON.stringify(detailTm.metadata, null, 2)}
                  </pre>
                </div>
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
