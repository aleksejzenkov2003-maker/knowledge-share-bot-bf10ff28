import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, FileInput, Bot, FileOutput } from 'lucide-react';

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
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => onAdd('input')}>
        <FileInput className="h-4 w-4 mr-2 text-emerald-600" />
        Ввод данных
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('agent')}>
        <Bot className="h-4 w-4 mr-2 text-primary" />
        AI Агент
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('output')}>
        <FileOutput className="h-4 w-4 mr-2 text-amber-600" />
        Итог
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
