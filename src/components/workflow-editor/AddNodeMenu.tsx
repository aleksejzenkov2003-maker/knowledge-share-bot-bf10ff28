import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, FileInput, Bot, FileOutput, Code, GitBranch, ShieldCheck } from 'lucide-react';

interface AddNodeMenuProps {
  onAdd: (nodeType: string) => void;
}

export const AddNodeMenu: React.FC<AddNodeMenuProps> = ({ onAdd }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        Добавить шаг
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-56">
      <DropdownMenuItem onClick={() => onAdd('input')}>
        <FileInput className="h-4 w-4 mr-2 text-emerald-600" />
        <div>
          <div className="font-medium">Ввод данных</div>
          <div className="text-[10px] text-muted-foreground">Форма и стартовый JSON</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('agent')}>
        <Bot className="h-4 w-4 mr-2 text-primary" />
        <div>
          <div className="font-medium">AI Агент</div>
          <div className="text-[10px] text-muted-foreground">LLM, схемы, инструменты</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('condition')}>
        <GitBranch className="h-4 w-4 mr-2 text-sky-600" />
        <div>
          <div className="font-medium">Условие IF / ELSE</div>
          <div className="text-[10px] text-muted-foreground">Разветвление без программирования</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('quality_check')}>
        <ShieldCheck className="h-4 w-4 mr-2 text-rose-600" />
        <div>
          <div className="font-medium">Проверка результата</div>
          <div className="text-[10px] text-muted-foreground">Соответствие ожиданиям</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('script')}>
        <Code className="h-4 w-4 mr-2 text-violet-600" />
        <div>
          <div className="font-medium">Скрипт</div>
          <div className="text-[10px] text-muted-foreground">Edge Function из реестра</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('output')}>
        <FileOutput className="h-4 w-4 mr-2 text-amber-600" />
        <div>
          <div className="font-medium">Итог</div>
          <div className="text-[10px] text-muted-foreground">Сборка документа / summary</div>
        </div>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
