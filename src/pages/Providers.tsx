import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Bot, Plus, Star, Trash2 } from 'lucide-react';

interface AIProvider {
  id: string;
  name: string;
  provider_type: string;
  default_model: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

const providerModels: Record<string, string[]> = {
  perplexity: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
};

const Providers = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    provider_type: 'perplexity',
    default_model: 'sonar',
  });
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProviders(data || []);
    } catch (error) {
      console.error('Error fetching providers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const createProvider = async () => {
    if (!newProvider.name.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите название провайдера',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.from('ai_providers').insert({
      name: newProvider.name,
      provider_type: newProvider.provider_type,
      default_model: newProvider.default_model,
    });

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось создать провайдера',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Провайдер создан',
      });
      setIsDialogOpen(false);
      setNewProvider({ name: '', provider_type: 'perplexity', default_model: 'sonar' });
      fetchProviders();
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('ai_providers')
      .update({ is_active: !isActive })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить статус',
        variant: 'destructive',
      });
    } else {
      fetchProviders();
    }
  };

  const setDefault = async (id: string) => {
    // First, unset all defaults
    await supabase.from('ai_providers').update({ is_default: false }).neq('id', '');
    
    // Then set the new default
    const { error } = await supabase
      .from('ai_providers')
      .update({ is_default: true })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось установить по умолчанию',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Провайдер установлен по умолчанию',
      });
      fetchProviders();
    }
  };

  const deleteProvider = async (id: string) => {
    const { error } = await supabase.from('ai_providers').delete().eq('id', id);

    if (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить провайдера',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Успешно',
        description: 'Провайдер удалён',
      });
      fetchProviders();
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
          <h1 className="text-3xl font-bold tracking-tight">AI Провайдеры</h1>
          <p className="text-muted-foreground">
            Управление AI провайдерами для чатов
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Добавить провайдера
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новый AI провайдер</DialogTitle>
                <DialogDescription>
                  Добавьте нового провайдера для использования в чатах
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Название</Label>
                  <Input
                    id="name"
                    placeholder="Например: Perplexity для патентов"
                    value={newProvider.name}
                    onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Тип провайдера</Label>
                  <Select
                    value={newProvider.provider_type}
                    onValueChange={(value) => setNewProvider({ 
                      ...newProvider, 
                      provider_type: value,
                      default_model: providerModels[value]?.[0] || ''
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="perplexity">Perplexity</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Модель по умолчанию</Label>
                  <Select
                    value={newProvider.default_model}
                    onValueChange={(value) => setNewProvider({ ...newProvider, default_model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerModels[newProvider.provider_type]?.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={createProvider}>Создать</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Список провайдеров
          </CardTitle>
          <CardDescription>
            Всего: {providers.length} провайдеров
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Провайдеры не найдены. Добавьте первого провайдера.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Модель</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>По умолчанию</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{provider.provider_type}</Badge>
                    </TableCell>
                    <TableCell>{provider.default_model || '—'}</TableCell>
                    <TableCell>
                      <Switch
                        checked={provider.is_active}
                        onCheckedChange={() => toggleActive(provider.id, provider.is_active)}
                        disabled={!isAdmin}
                      />
                    </TableCell>
                    <TableCell>
                      {provider.is_default ? (
                        <Badge className="bg-primary/10 text-primary">
                          <Star className="mr-1 h-3 w-3 fill-current" />
                          По умолчанию
                        </Badge>
                      ) : (
                        isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefault(provider.id)}
                          >
                            Установить
                          </Button>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteProvider(provider.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Providers;
