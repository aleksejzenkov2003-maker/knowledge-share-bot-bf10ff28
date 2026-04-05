import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, Plus, Pencil, Trash2 } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

const Departments = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '', description: '' });
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchDepartments = async () => {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (data) {
      setDepartments(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleOpenDialog = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      setFormData({ name: dept.name, slug: dept.slug, description: dept.description || '' });
    } else {
      setEditingDept(null);
      setFormData({ name: '', slug: '', description: '' });
    }
    setIsDialogOpen(true);
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .replace(/[а-яё]/g, (char) => {
        const map: Record<string, string> = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
          'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
          'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
          'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
          'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };
        return map[char] || char;
      })
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: editingDept ? prev.slug : generateSlug(name)
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.slug) {
      toast({
        title: 'Ошибка',
        description: 'Заполните название и slug',
        variant: 'destructive',
      });
      return;
    }

    if (editingDept) {
      const { error } = await supabase
        .from('departments')
        .update({ name: formData.name, slug: formData.slug, description: formData.description || null })
        .eq('id', editingDept.id);

      if (error) {
        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Успешно', description: 'Отдел обновлён' });
        setIsDialogOpen(false);
        fetchDepartments();
      }
    } else {
      const { error } = await supabase
        .from('departments')
        .insert({ name: formData.name, slug: formData.slug, description: formData.description || null });

      if (error) {
        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Успешно', description: 'Отдел создан' });
        setIsDialogOpen(false);
        fetchDepartments();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот отдел?')) return;

    const { error } = await supabase.from('departments').delete().eq('id', id);

    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Успешно', description: 'Отдел удалён' });
      fetchDepartments();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Отделы</h1>
          <p className="text-muted-foreground">
            Управление отделами компании
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить отдел
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDept ? 'Редактировать отдел' : 'Новый отдел'}</DialogTitle>
                <DialogDescription>
                  {editingDept ? 'Измените данные отдела' : 'Создайте новый отдел для организации'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Название</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Юридический отдел"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (идентификатор)</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="legal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Описание</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Описание отдела..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={handleSubmit}>
                  {editingDept ? 'Сохранить' : 'Создать'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Список отделов
          </CardTitle>
          <CardDescription>
            Всего: {departments.length} отделов
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead>Создан</TableHead>
                {isAdmin && <TableHead className="text-right">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="text-muted-foreground">{dept.slug}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {dept.description || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(dept.created_at).toLocaleDateString('ru-RU')}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(dept)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(dept.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Departments;
