import React, { useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

export type SchemaFieldRow = {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
};

function randomId() {
  return `f_${Math.random().toString(36).slice(2, 9)}`;
}

function jsonSchemaToRows(schema: Record<string, unknown>): SchemaFieldRow[] {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema.properties as Record<string, Record<string, unknown>>) || {};
  const required = new Set<string>(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  return Object.entries(props).map(([name, def]) => ({
    id: randomId(),
    name,
    type: (def?.type as SchemaFieldRow['type']) || 'string',
    required: required.has(name),
    description: typeof def?.description === 'string' ? def.description : '',
  }));
}

function rowsToJsonSchema(rows: SchemaFieldRow[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const r of rows) {
    if (!r.name.trim()) continue;
    properties[r.name.trim()] = {
      type: r.type,
      ...(r.description ? { description: r.description } : {}),
    };
    if (r.required) required.push(r.name.trim());
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

interface SchemaEditorProps {
  value: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
  label?: string;
  showRawJson?: boolean;
  /** Сброс внутреннего состояния при смене узла */
  resetKey?: string;
}

export const SchemaEditor: React.FC<SchemaEditorProps> = ({
  value,
  onChange,
  label = 'JSON Schema',
  showRawJson = true,
  resetKey = '',
}) => {
  const [rawMode, setRawMode] = React.useState(false);
  const [rawStr, setRawStr] = React.useState('');
  const [rows, setRows] = React.useState<SchemaFieldRow[]>(() => jsonSchemaToRows(value));

  React.useEffect(() => {
    if (!rawMode) setRows(jsonSchemaToRows(value));
  }, [resetKey, rawMode]);

  const applyRows = (next: SchemaFieldRow[]) => {
    setRows(next);
    onChange(rowsToJsonSchema(next));
  };

  const syncFromRaw = () => {
    try {
      const parsed = JSON.parse(rawStr) as Record<string, unknown>;
      onChange(parsed);
      setRows(jsonSchemaToRows(parsed));
      setRawMode(false);
    } catch {
      /* keep editing */
    }
  };

  const openRaw = () => {
    setRawStr(JSON.stringify(value && Object.keys(value).length ? value : rowsToJsonSchema(rows), null, 2));
    setRawMode(true);
  };

  const preview = useMemo(() => JSON.stringify(rowsToJsonSchema(rows), null, 2), [rows]);

  if (rawMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{label} (JSON)</Label>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRawMode(false)}>
            Визуально
          </Button>
        </div>
        <Textarea
          value={rawStr}
          onChange={(e) => setRawStr(e.target.value)}
          className="font-mono text-xs min-h-[140px]"
        />
        <Button type="button" size="sm" onClick={syncFromRaw}>
          Применить JSON
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {showRawJson && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={openRaw}>
            JSON
          </Button>
        )}
      </div>
      <div className="space-y-2 rounded-md border p-2">
        {rows.map((row, idx) => (
          <div key={row.id} className="grid grid-cols-12 gap-1.5 items-end">
            <div className="col-span-4">
              <Input
                className="h-7 text-xs"
                placeholder="поле"
                value={row.name}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, name: e.target.value };
                  applyRows(next);
                }}
              />
            </div>
            <div className="col-span-3">
              <Select
                value={row.type}
                onValueChange={(v) => {
                  const next = [...rows];
                  next[idx] = { ...row, type: v as SchemaFieldRow['type'] };
                  applyRows(next);
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">string</SelectItem>
                  <SelectItem value="number">number</SelectItem>
                  <SelectItem value="boolean">boolean</SelectItem>
                  <SelectItem value="array">array</SelectItem>
                  <SelectItem value="object">object</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 flex items-center gap-1.5 pb-1">
              <Switch
                checked={row.required}
                onCheckedChange={(c) => {
                  const next = [...rows];
                  next[idx] = { ...row, required: c };
                  applyRows(next);
                }}
              />
              <span className="text-[10px] text-muted-foreground">req</span>
            </div>
            <div className="col-span-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => applyRows(rows.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="col-span-12">
              <Input
                className="h-7 text-xs"
                placeholder="описание"
                value={row.description}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, description: e.target.value };
                  applyRows(next);
                }}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => applyRows([...rows, { id: randomId(), name: '', type: 'string', required: false, description: '' }])}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Поле
        </Button>
      </div>
      <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all max-h-20 overflow-auto">
        {preview}
      </pre>
    </div>
  );
};
