import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SchemaEditor } from './SchemaEditor';

interface ResultNodeConfigProps {
  stepId: string;
  promptOverride: string;
  assemblyMode: string | null;
  resultTemplateId: string | null;
  outputSchema: Record<string, unknown>;
  onChange: (patch: {
    prompt_override?: string | null;
    result_assembly_mode?: string | null;
    result_template_id?: string | null;
    output_schema?: Record<string, unknown>;
  }) => void;
}

export const ResultNodeConfig: React.FC<ResultNodeConfigProps> = ({
  stepId,
  promptOverride,
  assemblyMode,
  resultTemplateId,
  outputSchema,
  onChange,
}) => {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Режим сборки итога</Label>
        <Select
          value={assemblyMode || 'ai_summary'}
          onValueChange={(v) => onChange({ result_assembly_mode: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ai_summary">AI summary</SelectItem>
            <SelectItem value="deterministic">Детерминированно</SelectItem>
            <SelectItem value="combined">Комбинированно</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">ID шаблона документа (PDF/DOCX)</Label>
        <Input
          className="h-8 text-xs"
          value={resultTemplateId || ''}
          onChange={(e) => onChange({ result_template_id: e.target.value || null })}
          placeholder="tm_offer_v2"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Промпт сборки</Label>
        <Textarea
          value={promptOverride}
          onChange={(e) => onChange({ prompt_override: e.target.value || null })}
          className="text-xs min-h-[100px] font-mono"
          placeholder="Как собрать финальный документ из апстрим-данных..."
        />
      </div>

      <SchemaEditor
        resetKey={stepId}
        label="Output schema итога"
        value={outputSchema}
        onChange={(s) => onChange({ output_schema: s })}
      />
    </div>
  );
};
