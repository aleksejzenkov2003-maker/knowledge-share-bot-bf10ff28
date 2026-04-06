import React, { useEffect, useState } from 'react';
import type { WorkflowTemplateStep } from '@/types/workflow';
import type { WorkflowTemplateTestRunApi } from '@/hooks/useWorkflowTemplateTestRun';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Play, RefreshCw, Trash2, FlaskConical, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WorkflowTemplateTestSectionProps {
  step: WorkflowTemplateStep;
  testRun: WorkflowTemplateTestRunApi;
}

export const WorkflowTemplateTestSection: React.FC<WorkflowTemplateTestSectionProps> = ({ step, testRun }) => {
  const [inputJson, setInputJson] = useState('{}');
  const [parseErr, setParseErr] = useState<string | null>(null);

  const suggested = testRun.computeSuggestedInput(step.id);
  const hasPin = Boolean(testRun.pins[step.id]);
  const upstream = testRun.upstreamPreview(step.id);

  const suggestedKey = JSON.stringify(suggested);
  const pinsKey = JSON.stringify(
    Object.keys(testRun.pins)
      .sort()
      .map((k) => [k, testRun.pins[k]] as const)
  );

  useEffect(() => {
    try {
      const sug = JSON.parse(suggestedKey) as Record<string, unknown>;
      const s =
        step.node_type === 'input'
          ? { content: '' }
          : Object.keys(sug).length > 0
            ? sug
            : { content: '' };
      setInputJson(JSON.stringify(s, null, 2));
      setParseErr(null);
    } catch {
      setInputJson('{}');
    }
  }, [step.id, step.node_type, suggestedKey, pinsKey]);

  const handleRefreshFromGraph = () => {
    const s =
      step.node_type === 'input'
        ? { content: '' }
        : testRun.computeSuggestedInput(step.id);
    setInputJson(JSON.stringify(s, null, 2));
    setParseErr(null);
  };

  const handleRun = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(inputJson || '{}') as Record<string, unknown>;
      setParseErr(null);
    } catch {
      setParseErr('Невалидный JSON во входе');
      return;
    }
    await testRun.runCurrentStepTest(step, { inputOverride: parsed });
  };

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Тестовый прогон (как в n8n)</span>
      </div>

      <Alert className="py-2">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-[10px] text-muted-foreground">
          Для <strong>AI Агент</strong> и <strong>Итог</strong> вызывается тот же{' '}
          <code className="text-[9px]">chat-stream</code>, что и в проекте: роль, системный промпт и модель из настроек
          роли + ваши доп. инструкции и схема вывода. Сначала выполните тест вышестоящих узлов — вход соберётся по
          связям и маппингу. Пакеты контекста проекта из настроек шага в бою здесь не подтягиваются — только папки роли и
          общая логика роли.
        </AlertDescription>
      </Alert>

      {upstream ? (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Контекст вышестоящих (по сохранённым тестам)</Label>
          <ScrollArea className="h-20 rounded border bg-background/80 px-2 py-1">
            <pre className="text-[9px] whitespace-pre-wrap font-mono">{upstream || '— нет —'}</pre>
          </ScrollArea>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">
            {step.node_type === 'input' ? 'Входные данные (JSON)' : 'Вход узла (JSON, подставлено из графа)'}
          </Label>
          {step.node_type !== 'input' && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={handleRefreshFromGraph}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Из связей
            </Button>
          )}
        </div>
        <Textarea
          value={inputJson}
          onChange={(e) => {
            setInputJson(e.target.value);
            setParseErr(null);
          }}
          className="font-mono text-[10px] min-h-[100px]"
          spellCheck={false}
        />
        {parseErr && <p className="text-[10px] text-destructive">{parseErr}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" disabled={testRun.isRunning} onClick={() => void handleRun()}>
          {testRun.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
          Запустить тест
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={testRun.isRunning || !hasPin}
          onClick={() => testRun.clearPin(step.id)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Сбросить выход
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => testRun.clearAllPins()}>
          Очистить все тесты
        </Button>
      </div>

      {testRun.lastError && (
        <p className="text-[10px] text-destructive break-words">{testRun.lastError}</p>
      )}

      {hasPin && (
        <div className="space-y-1">
          <Label className="text-xs text-emerald-700 dark:text-emerald-400">Сохранённый выход (подставится в следующие узлы)</Label>
          <ScrollArea className="max-h-40 rounded border bg-card px-2 py-1">
            <pre className="text-[9px] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(testRun.pins[step.id], null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
