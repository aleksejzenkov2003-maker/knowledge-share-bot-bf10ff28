import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface ScriptNodeConfigProps {
  scriptStepId: string;
  scriptConfig: Record<string, unknown>;
  onChangeScriptConfig: (cfg: Record<string, unknown>) => void;
}

export const ScriptNodeConfig: React.FC<ScriptNodeConfigProps> = ({
  scriptStepId,
  scriptConfig,
  onChangeScriptConfig,
}) => {
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['script-definitions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('script_definitions').select('*').order('name');
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
        throw error;
      }
      return data || [];
    },
  });

  const scriptKey =
    (scriptConfig.scriptKey as string) ||
    (scriptConfig.function_name as string) ||
    '';

  const [paramsStr, setParamsStr] = React.useState(() =>
    JSON.stringify((scriptConfig.params as Record<string, unknown>) || {}, null, 2)
  );

  React.useEffect(() => {
    setParamsStr(JSON.stringify((scriptConfig.params as Record<string, unknown>) || {}, null, 2));
  }, [scriptStepId]);

  const setKey = (key: string) => {
    const def = scripts.find((s: { script_key: string }) => s.script_key === key);
    const next = {
      ...scriptConfig,
      scriptKey: key,
      function_name: (def as { entrypoint?: string } | undefined)?.entrypoint || key,
      runtime: (def as { runtime?: string } | undefined)?.runtime || 'supabase_edge_function',
      params: scriptConfig.params || {},
    };
    onChangeScriptConfig(next);
    setParamsStr(JSON.stringify((next.params as Record<string, unknown>) || {}, null, 2));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Скрипт из реестра</Label>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : scripts.length > 0 ? (
          <Select value={scriptKey || '__custom__'} onValueChange={(v) => (v === '__custom__' ? null : setKey(v))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Выберите scriptKey" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__custom__">— вручную —</SelectItem>
              {(scripts as { script_key: string; name: string; entrypoint: string }[]).map((s) => (
                <SelectItem key={s.script_key} value={s.script_key}>
                  {s.name} ({s.script_key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-[10px] text-muted-foreground">Реестр пуст — укажите function_name ниже</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">function_name (edge function)</Label>
        <Input
          className="h-8 text-xs font-mono"
          value={(scriptConfig.function_name as string) || ''}
          onChange={(e) =>
            onChangeScriptConfig({ ...scriptConfig, function_name: e.target.value })
          }
          placeholder="process-document"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">scriptKey (логический ключ)</Label>
        <Input
          className="h-8 text-xs font-mono"
          value={(scriptConfig.scriptKey as string) || ''}
          onChange={(e) => onChangeScriptConfig({ ...scriptConfig, scriptKey: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">timeoutSec</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={(scriptConfig.timeoutSec as number) ?? 60}
            onChange={(e) =>
              onChangeScriptConfig({ ...scriptConfig, timeoutSec: parseInt(e.target.value, 10) || 60 })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">retries</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={(scriptConfig.retries as number) ?? 2}
            onChange={(e) =>
              onChangeScriptConfig({ ...scriptConfig, retries: parseInt(e.target.value, 10) || 0 })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">params (JSON)</Label>
        <Textarea
          className="text-xs font-mono min-h-[80px]"
          value={paramsStr}
          onChange={(e) => {
            const v = e.target.value;
            setParamsStr(v);
            try {
              const p = JSON.parse(v || '{}');
              onChangeScriptConfig({ ...scriptConfig, params: p });
            } catch {
              /* incomplete JSON */
            }
          }}
        />
      </div>
    </div>
  );
};
