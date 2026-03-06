import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
import { Upload, Search, Trash2, ChevronLeft, ChevronRight, FileSpreadsheet, X, Eraser } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  color_specification: string | null;
  unprotected_elements: string | null;
  kind_specification: string | null;
  actual: boolean | null;
  created_at: string;
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
  color_specification: 'color_specification',
  unprotected_elements: 'unprotected_elements',
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

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Strip BOM character
      const text = (ev.target?.result as string).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: 'Файл пуст', variant: 'destructive' });
        return;
      }

      const delimiter = lines[0].includes(';') ? ';' : ',';
      const headers = parseCSVLine(lines[0], delimiter).map(h => normalizeHeader(h.replace(/^"|"$/g, '').trim()));

      const rows: Record<string, any>[] = [];
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const values = parseCSVLine(lines[i], delimiter);
        const row: Record<string, any> = {};
        headers.forEach((h, idx) => {
          const dbField = FIELD_MAP[h];
          if (dbField && values[idx]) {
            row[dbField] = values[idx];
          }
        });
        if (Object.keys(row).length > 0) rows.push(row);
      }
      setPreviewData(rows);
    };
    reader.readAsText(file, 'utf-8');
  }, [toast]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      // Strip BOM character
      const text = (await selectedFile.text()).replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const delimiter = lines[0].includes(';') ? ';' : ',';
      const headers = parseCSVLine(lines[0], delimiter).map(h => normalizeHeader(h.replace(/^"|"$/g, '').trim()));

      const BATCH_SIZE = 500;
      let totalImported = 0;

      for (let i = 1; i < lines.length; i += BATCH_SIZE) {
        const batch: Record<string, any>[] = [];

        for (let j = i; j < Math.min(i + BATCH_SIZE, lines.length); j++) {
          const values = parseCSVLine(lines[j], delimiter);
          if (values.length < 2) continue;

          const row: Record<string, any> = {};
          headers.forEach((h, idx) => {
            const dbField = FIELD_MAP[h];
            if (!dbField || !values[idx]) return;
            const val = values[idx];

            if (BOOLEAN_FIELDS.has(dbField)) {
              row[dbField] = val === '1' || val.toLowerCase() === 'true' || val.toLowerCase() === 'yes';
            } else if (DATE_FIELDS.has(dbField)) {
              // Accept YYYY-MM-DD, DD.MM.YYYY, or YYYYMMDD
              if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
                row[dbField] = val.substring(0, 10);
              } else if (/^\d{2}\.\d{2}\.\d{4}/.test(val)) {
                const [d, m, y] = val.split('.');
                row[dbField] = `${y}-${m}-${d}`;
              } else if (/^\d{8}$/.test(val)) {
                row[dbField] = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
              } else {
                row[dbField] = null;
              }
            } else {
              row[dbField] = val;
            }
          });

          if (Object.keys(row).length > 0) batch.push(row);
        }

        if (batch.length > 0) {
          const { error } = await supabase.from('trademarks').insert(batch);
          if (error) throw error;
          totalImported += batch.length;
        }
      }

      toast({ title: `Импортировано ${totalImported} записей` });
      queryClient.invalidateQueries({ queryKey: ['trademarks'] });
      queryClient.invalidateQueries({ queryKey: ['trademarks-count'] });
      setUploadOpen(false);
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err: any) {
      toast({ title: 'Ошибка импорта', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [selectedFile, toast, queryClient]);

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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ТЗ №{detailTm?.registration_number || '—'}</DialogTitle>
          </DialogHeader>
          {detailTm && (
            <div className="grid grid-cols-1 gap-3 text-sm">
              <InfoRow label="Правообладатель" value={detailTm.right_holder_name} />
              <InfoRow label="Правообладатель (ин.)" value={detailTm.foreign_right_holder_name} />
              <InfoRow label="ИНН" value={detailTm.right_holder_inn} />
              <InfoRow label="ОГРН" value={detailTm.right_holder_ogrn} />
              <InfoRow label="Адрес" value={detailTm.right_holder_address} />
              <InfoRow label="Код страны" value={detailTm.right_holder_country_code} />
              <InfoRow label="Дата регистрации" value={detailTm.registration_date ? new Date(detailTm.registration_date).toLocaleDateString('ru-RU') : null} />
              <InfoRow label="Дата общеизвестности" value={detailTm.well_known_trademark_date ? new Date(detailTm.well_known_trademark_date).toLocaleDateString('ru-RU') : null} />
              <InfoRow label="Связанные рег." value={detailTm.legally_related_registrations} />
              <InfoRow label="Цвет" value={detailTm.color_specification} />
              <InfoRow label="Неохраняемые элементы" value={detailTm.unprotected_elements} />
              <InfoRow label="Вид знака" value={detailTm.kind_specification} />
              <InfoRow label="Коллективный" value={detailTm.collective ? 'Да' : 'Нет'} />
              <InfoRow label="Статус" value={detailTm.actual ? 'Действующий' : 'Недействующий'} />
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
