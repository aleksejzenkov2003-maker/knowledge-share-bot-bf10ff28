import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  FileInput,
  Bot,
  FileOutput,
  Code,
  GitBranch,
  ShieldCheck,
  FolderPlus,
} from 'lucide-react';

interface AddNodeMenuProps {
  onAdd: (nodeType: string) => void;
  onAddStage?: () => void;
}

export const AddNodeMenu: React.FC<AddNodeMenuProps> = ({ onAdd, onAddStage }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        Добавить
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-60">
      <DropdownMenuItem onClick={() => onAdd('input')}>
        <FileInput className="h-4 w-4 mr-2 text-emerald-600" />
        <div>
          <div className="font-medium">Ввод данных</div>
          <div className="text-[10px] text-muted-foreground">Старт процесса — форма</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('agent')}>
        <Bot className="h-4 w-4 mr-2 text-primary" />
        <div>
          <div className="font-medium">AI Агент</div>
          <div className="text-[10px] text-muted-foreground">Шаг с моделью</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('condition')}>
        <GitBranch className="h-4 w-4 mr-2 text-sky-600" />
        <div>
          <div className="font-medium">Условие IF / ELSE</div>
          <div className="text-[10px] text-muted-foreground">Разветвить процесс</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('quality_check')}>
        <ShieldCheck className="h-4 w-4 mr-2 text-rose-600" />
        <div>
          <div className="font-medium">Проверка результата</div>
          <div className="text-[10px] text-muted-foreground">Авто-валидация ответа</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('script')}>
        <Code className="h-4 w-4 mr-2 text-violet-600" />
        <div>
          <div className="font-medium">Скрипт</div>
          <div className="text-[10px] text-muted-foreground">Edge Function</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('output')}>
        <FileOutput className="h-4 w-4 mr-2 text-amber-600" />
        <div>
          <div className="font-medium">Итог</div>
          <div className="text-[10px] text-muted-foreground">Финальная сборка</div>
        </div>
      </DropdownMenuItem>
      {onAddStage && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAddStage}>
            <FolderPlus className="h-4 w-4 mr-2 text-muted-foreground" />
            <div>
              <div className="font-medium">Этап (группа)</div>
              <div className="text-[10px] text-muted-foreground">
                Перетаскивайте шаги внутрь, чтобы сгруппировать
              </div>
            </div>
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);
