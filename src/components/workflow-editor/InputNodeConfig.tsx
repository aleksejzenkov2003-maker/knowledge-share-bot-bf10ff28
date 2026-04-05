import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { FormFieldConfig, FormFieldType } from '@/types/workflow-editor';

function randomId() {
  return `fld_${Math.random().toString(36).slice(2, 9)}`;
}

interface InputNodeConfigProps {
  formFields: FormFieldConfig[];
  outputMode: string;
  onChangeFields: (fields: FormFieldConfig[]) => void;
  onChangeOutputMode: (mode: string) => void;
}

export const InputNodeConfig: React.FC<InputNodeConfigProps> = ({
  formFields,
  outputMode,
  onChangeFields,
  onChangeOutputMode,
}) => {
  const updateField = (index: number, patch: Partial<FormFieldConfig>) => {
    const next = [...formFields];
    next[index] = { ...next[index], ...patch };
    onChangeFields(next);
  };

  const removeField = (index: number) => {
    onChangeFields(formFields.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Режим выхода</Label>
        <Select value={outputMode} onValueChange={onChangeOutputMode}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="structured_json">structured_json</SelectItem>
            <SelectItem value="text">text</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Поля формы</Label>
        <div className="space-y-2 rounded-md border p-2">
          {formFields.map((field, idx) => (
            <div key={field.key + idx} className="rounded border bg-muted/20 p-2 space-y-2">
              <div className="flex items-center gap-1">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  className="h-7 text-xs flex-1"
                  placeholder="key (латиница)"
                  value={field.key}
                  onChange={(e) => updateField(idx, { key: e.target.value })}
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeField(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                className="h-7 text-xs"
                placeholder="Подпись"
                value={field.label}
                onChange={(e) => updateField(idx, { label: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(idx, { type: v as FormFieldType })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">text</SelectItem>
                    <SelectItem value="textarea">textarea</SelectItem>
                    <SelectItem value="file">file</SelectItem>
                    <SelectItem value="select">select</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!field.required}
                    onCheckedChange={(c) => updateField(idx, { required: c })}
                  />
                  <span className="text-[10px] text-muted-foreground">Обяз.</span>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() =>
              onChangeFields([
                ...formFields,
                { key: `field_${formFields.length + 1}`, type: 'text', label: 'Новое поле', required: false },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Добавить поле
          </Button>
        </div>
      </div>
    </div>
  );
};

export function parseFormConfig(raw: Record<string, unknown>): FormFieldConfig[] {
  const form = raw as { fields?: FormFieldConfig[] };
  if (Array.isArray(form?.fields)) return form.fields;
  return [
    { key: 'designation', type: 'text', label: 'Обозначение', required: true },
    { key: 'activity_description', type: 'textarea', label: 'Описание деятельности', required: true },
    { key: 'comments', type: 'textarea', label: 'Комментарий', required: false },
    { key: 'goods_services_raw', type: 'textarea', label: 'Товары и услуги', required: false },
    { key: 'attachments', type: 'file', label: 'Вложения', required: false, multiple: true },
  ];
}

export function buildFormConfigObject(fields: FormFieldConfig[]): Record<string, unknown> {
  return { fields, editableByUser: true, autoStart: false };
}
