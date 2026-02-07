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
    { value: 'sonar', label: 'Sonar (быстрый)' },
    { value: 'sonar-pro', label: 'Sonar Pro (точный, 2x цитат)' },
    { value: 'sonar-reasoning', label: 'Sonar Reasoning (рассуждения)' },
    { value: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro (DeepSeek R1)' },
    { value: 'sonar-deep-research', label: 'Sonar Deep Research (глубокий анализ)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'o1', label: 'O1 (рассуждения)' },
    { value: 'o1-mini', label: 'O1 Mini' },
    { value: 'o3-mini', label: 'O3 Mini (новый)' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (новейший)' },
    { value: 'claude-4-5-sonnet-20250514', label: 'Claude 4.5 Sonnet (премиум)' },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (быстрый)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (мощный)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (быстрый, дешёвый)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (мощный)' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (самый дешёвый)' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (предыдущее поколение)' },
  ],
  gigachat: [
    { value: 'GigaChat', label: 'GigaChat (стандартный)' },
    { value: 'GigaChat-Plus', label: 'GigaChat Plus (улучшенный)' },
    { value: 'GigaChat-Pro', label: 'GigaChat Pro (мощный)' },
    { value: 'GigaChat-Max', label: 'GigaChat Max (максимальный)' },
  ],
};

// Проверка наличия API ключей из env (для подсказок в UI)
const envConfiguredProviders = ['perplexity', 'anthropic', 'gemini', 'gigachat'];

const providerLabels: Record<string, string> = {
  perplexity: 'Perplexity',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  gigachat: 'GigaChat (Сбер)',
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

    // API key is optional for providers with pre-configured env keys (perplexity, anthropic, lovable)
    const isEnvConfigured = envConfiguredProviders.includes(newProvider.provider_type);
    if (!isEnvConfigured && !newProvider.api_key.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите API ключ',
        variant: 'destructive',
      });
      return;
    }

    // If API key is empty but provider is env-configured, store null (will use env key)
    const apiKeyToStore = newProvider.api_key.trim() || null;
    
    const { error } = await supabase.from('ai_providers').insert({
      name: newProvider.name,
      provider_type: newProvider.provider_type,
      default_model: newProvider.default_model,
      api_key: apiKeyToStore,
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
      api_key: value === 'gemini' ? '' : newProvider.api_key,
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
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="gigachat">GigaChat (Сбер)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Show env-configured notice for supported providers */}
                {envConfiguredProviders.includes(newProvider.provider_type) && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      ✓ API ключ {providerLabels[newProvider.provider_type]} уже настроен в системе.
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Вы можете оставить поле пустым или ввести свой ключ.
                    </p>
                  </div>
                )}

                {/* API Key input - always show, but optional for env-configured providers */}
                <div className="space-y-2">
                  <Label htmlFor="api_key">
                    API Ключ {envConfiguredProviders.includes(newProvider.provider_type) && (
                      <span className="text-muted-foreground text-xs">(опционально)</span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="api_key"
                      type={showApiKey ? 'text' : 'password'}
                      placeholder={
                        newProvider.provider_type === 'anthropic' 
                          ? 'sk-ant-... (опционально)' 
                          : newProvider.provider_type === 'openai'
                          ? 'sk-...'
                          : newProvider.provider_type === 'perplexity'
                          ? 'pplx-... (опционально)'
                          : newProvider.provider_type === 'gemini'
                          ? 'AIza... (опционально)'
                          : newProvider.provider_type === 'gigachat'
                          ? 'Base64 ключ авторизации (опционально)'
                          : 'Введите API ключ'
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
                    {envConfiguredProviders.includes(newProvider.provider_type) 
                      ? 'Если пусто — будет использован системный ключ' 
                      : 'Ключ будет храниться в зашифрованном виде'}
                  </p>
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
                      ) : envConfiguredProviders.includes(provider.provider_type) ? (
                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                          Системный
                        </Badge>
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
