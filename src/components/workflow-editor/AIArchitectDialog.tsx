import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, AlertCircle, Lightbulb } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIArchitectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new template id after successful generation */
  onTemplateCreated: (templateId: string) => void;
}

interface AIArchitectResponse {
  template_id: string;
  name: string;
  description: string | null;
  explanation: string | null;
  node_count: number;
  edge_count: number;
  model: string;
}

const EXAMPLES: Array<{ label: string; text: string }> = [
  {
    label: 'Коммерческое предложение',
    text:
      'Автоматически готовить коммерческое предложение на регистрацию товарного знака: собрать данные, проверить риски, сформировать КП с ценой.',
  },
  {
    label: 'Досье клиента',
    text:
      'Собирать досье на нового клиента по его ИНН: выгрузка из открытых источников, анализ рисков, саммари для менеджера.',
  },
  {
    label: 'Проверка договора',
    text:
      'Принять текст договора, извлечь ключевые условия, проверить на типовые риски и подготовить список правок для юриста.',
  },
];

export const AIArchitectDialog: React.FC<AIArchitectDialogProps> = ({
  open,
  onOpenChange,
  onTemplateCreated,
}) => {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string[]>([]);

  const reset = () => {
    setDescription('');
    setError(null);
    setValidation([]);
  };

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      setError('Опишите задачу подробнее (минимум 10 символов).');
      return;
    }
    setLoading(true);
    setError(null);
    setValidation([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'workflow-ai-architect',
        { body: { description: description.trim() } },
      );

      if (fnError) {
        throw new Error(fnError.message || 'Edge function error');
      }

      const payload = data as
        | AIArchitectResponse
        | { error: string; validation?: string[]; raw?: unknown };

      if ('error' in payload) {
        setError(payload.error);
        if (Array.isArray(payload.validation)) {
          setValidation(payload.validation);
        }
        return;
      }

      toast.success(
        `ИИ-архитектор собрал граф: ${payload.node_count} шагов, ${payload.edge_count} связей.`,
      );
      onTemplateCreated(payload.template_id);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || 'Не удалось сгенерировать воркфлоу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            ИИ-архитектор воркфлоу
          </DialogTitle>
          <DialogDescription>
            Опишите задачу на обычном языке — Claude Opus соберёт для вас скелет
            процесса: шаги, связи и черновики промптов. После этого вы
            допишете детали в редакторе.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5">
              <span className="font-medium">Примеры:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setDescription(ex.text)}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted hover:bg-accent border text-[11px] transition"
                  disabled={loading}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`Например: Хочу, чтобы менеджер заполнял форму с данными клиента, потом AI-агент делает ресёрч, второй агент пишет КП, проверка качества и на выходе готовый документ.`}
            rows={8}
            disabled={loading}
            className="resize-none"
          />

          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              {description.length} символ
              {description.length === 1 ? '' : description.length < 5 ? 'а' : 'ов'}
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px]">
                Claude Opus
              </Badge>
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="font-medium">{error}</div>
                {validation.length > 0 && (
                  <ul className="text-xs list-disc ml-4 space-y-0.5">
                    {validation.slice(0, 6).map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                    {validation.length > 6 && (
                      <li>…и ещё {validation.length - 6}</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || description.trim().length < 10}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Строю граф...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Создать воркфлоу
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
