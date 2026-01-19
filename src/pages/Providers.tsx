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
import { Loader2, Bot, Plus, Star, Trash2, Key, Eye, EyeOff } from 'lucide-react';

interface AIProvider {
  id: string;
  name: string;
  provider_type: string;
  default_model: string | null;
  is_active: boolean;
  is_default: boolean;
  api_key_masked?: string;
  created_at: string;
}

const providerModels: Record<string, { value: string; label: string }[]> = {
  perplexity: [
    { value: 'sonar', label: 'Sonar' },
    { value: 'sonar-pro', label: 'Sonar Pro' },
    { value: 'sonar-reasoning', label: 'Sonar Reasoning' },
    { value: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'o1', label: 'O1' },
    { value: 'o1-mini', label: 'O1 Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
  lovable: [
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  ],
};

const providerLabels: Record<string, string> = {
  perplexity: 'Perplexity',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  lovable: 'Lovable AI',
};

const Providers = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    provider_type: 'perplexity',
    default_model: 'sonar',
    api_key: '',
  });
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchProviders = async () => {
    try {
      // Use safe_ai_providers view that masks API keys
      const { data, error } = await supabase
        .from('safe_ai_providers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProviders((data || []).map(p => ({
        id: p.id!,
        name: p.name!,
        provider_type: p.provider_type!,
        default_model: p.default_model,
        is_active: p.is_active!,
        is_default: p.is_default!,
        api_key_masked: p.api_key_masked || undefined,
        created_at: p.created_at!,
      })));
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

    // For Lovable AI, API key is not required (uses LOVABLE_API_KEY from env)
    if (newProvider.provider_type !== 'lovable' && !newProvider.api_key.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите API ключ',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.from('ai_providers').insert({
      name: newProvider.name,
      provider_type: newProvider.provider_type,
      default_model: newProvider.default_model,
      api_key: newProvider.provider_type === 'lovable' ? null : newProvider.api_key,
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
      setNewProvider({ name: '', provider_type: 'perplexity', default_model: 'sonar', api_key: '' });
      setShowApiKey(false);
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

  const handleProviderTypeChange = (value: string) => {
    const firstModel = providerModels[value]?.[0]?.value || '';
    setNewProvider({
      ...newProvider,
      provider_type: value,
      default_model: firstModel,
      api_key: value === 'lovable' ? '' : newProvider.api_key,
    });
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
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setNewProvider({ name: '', provider_type: 'perplexity', default_model: 'sonar', api_key: '' });
              setShowApiKey(false);
            }
          }}>
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
                    placeholder="Например: Claude для аналитики"
                    value={newProvider.name}
                    onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Тип провайдера</Label>
                  <Select
                    value={newProvider.provider_type}
                    onValueChange={handleProviderTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="perplexity">Perplexity</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="lovable">Lovable AI (без API ключа)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {newProvider.provider_type !== 'lovable' && (
                  <div className="space-y-2">
                    <Label htmlFor="api_key">API Ключ</Label>
                    <div className="relative">
                      <Input
                        id="api_key"
                        type={showApiKey ? 'text' : 'password'}
                        placeholder={
                          newProvider.provider_type === 'anthropic' 
                            ? 'sk-ant-...' 
                            : newProvider.provider_type === 'openai'
                            ? 'sk-...'
                            : 'pplx-...'
                        }
                        value={newProvider.api_key}
                        onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ключ будет храниться в зашифрованном виде
                    </p>
                  </div>
                )}

                {newProvider.provider_type === 'lovable' && (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      Lovable AI использует встроенный API ключ и не требует дополнительной настройки.
                    </p>
                  </div>
                )}

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
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
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
                  <TableHead>API Ключ</TableHead>
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
                      <Badge variant="outline">
                        {providerLabels[provider.provider_type] || provider.provider_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {provider.default_model || '—'}
                    </TableCell>
                    <TableCell>
                      {provider.api_key_masked ? (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Key className="h-3 w-3" />
                          {provider.api_key_masked}
                        </span>
                      ) : provider.provider_type === 'lovable' ? (
                        <span className="text-sm text-muted-foreground">Встроенный</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
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
