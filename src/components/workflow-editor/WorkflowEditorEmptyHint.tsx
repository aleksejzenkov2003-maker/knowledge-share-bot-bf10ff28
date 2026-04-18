import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FilePlus2,
  LibraryBig,
  Sparkles,
  PlayCircle,
} from 'lucide-react';

interface WorkflowEditorEmptyHintProps {
  onAddFirstStep: () => void;
  onStartTour: () => void;
  /**
   * Callback to navigate to the presets gallery.
   * If provided, the "Готовый шаблон" card becomes active; otherwise it shows "скоро".
   */
  onOpenGallery?: () => void;
  /**
   * Callback to open the AI-architect dialog.
   * If provided, the "ИИ-ассистент" card becomes active; otherwise it shows "скоро".
   */
  onOpenAIArchitect?: () => void;
}

/**
 * Empty-state overlay shown on top of the canvas when a template has no steps yet.
 * Offers three paths: start blank, pick a template from gallery, or use AI builder.
 */
export const WorkflowEditorEmptyHint: React.FC<WorkflowEditorEmptyHintProps> = ({
  onAddFirstStep,
  onStartTour,
  onOpenGallery,
  onOpenAIArchitect,
}) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
      <Card className="pointer-events-auto max-w-2xl w-full p-6 space-y-5 shadow-lg bg-background/95 backdrop-blur">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">С чего начать воркфлоу?</h2>
          <p className="text-sm text-muted-foreground">
            Воркфлоу — это цепочка шагов, через которую проходят данные: ввод → AI-агенты → проверки → итоговый документ.
            Выберите удобный способ старта.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* Blank */}
          <button
            type="button"
            onClick={onAddFirstStep}
            className="text-left rounded-lg border bg-card hover:bg-accent transition p-3 group"
          >
            <div className="flex items-center gap-2 mb-1">
              <FilePlus2 className="h-4 w-4 text-emerald-600" />
              <span className="font-medium text-sm">С чистого листа</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              Добавить первый шаг «Ввод данных» и строить процесс по шагам.
            </p>
          </button>

          {/* Gallery */}
          {onOpenGallery ? (
            <button
              type="button"
              onClick={onOpenGallery}
              className="text-left rounded-lg border bg-card hover:bg-accent transition p-3 group"
            >
              <div className="flex items-center gap-2 mb-1">
                <LibraryBig className="h-4 w-4 text-sky-600" />
                <span className="font-medium text-sm">Готовый шаблон</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                Выбрать из галереи типовых процессов и настроить под себя.
              </p>
            </button>
          ) : (
            <div className="relative text-left rounded-lg border bg-card/50 p-3 opacity-70">
              <Badge variant="outline" className="absolute top-2 right-2 text-[9px]">
                скоро
              </Badge>
              <div className="flex items-center gap-2 mb-1">
                <LibraryBig className="h-4 w-4 text-sky-600" />
                <span className="font-medium text-sm">Готовый шаблон</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                Выбрать из галереи типовых процессов.
              </p>
            </div>
          )}

          {/* AI builder */}
          {onOpenAIArchitect ? (
            <button
              type="button"
              onClick={onOpenAIArchitect}
              className="text-left rounded-lg border border-violet-300/60 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 hover:from-violet-500/10 hover:to-indigo-500/10 transition p-3 group"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span className="font-medium text-sm">ИИ-ассистент</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                Опишите цель словами — Claude Opus соберёт граф и предложит связи.
              </p>
            </button>
          ) : (
            <div className="relative text-left rounded-lg border bg-card/50 p-3 opacity-70">
              <Badge variant="outline" className="absolute top-2 right-2 text-[9px]">
                скоро
              </Badge>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span className="font-medium text-sm">ИИ-ассистент</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                Опишите цель словами — ассистент соберёт граф и предложит связи.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 border-t">
          <p className="text-xs text-muted-foreground">
            Подсказка: шаг можно добавить в любой момент кнопкой «Добавить шаг» сверху.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onStartTour}
            className="gap-1.5"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Короткий тур
          </Button>
        </div>
      </Card>
    </div>
  );
};
