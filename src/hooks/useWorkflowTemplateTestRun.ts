import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WorkflowTemplateStep, WorkflowGraphEdge } from '@/types/workflow';
import type { TemplateEdgeFull } from '@/lib/projectWorkflowConfirm';
import {
  buildTestInputFromPins,
  collectUpstreamTestContext,
  formatUpstreamContextBlock,
} from '@/lib/workflowTemplateTestInput';
import {
  evaluateIfElse,
  evaluateQualityCheck,
  parseOrchestration,
} from '@/lib/workflowOrchestration';

function toFullEdges(edges: WorkflowGraphEdge[]): TemplateEdgeFull[] {
  return edges.map((e) => ({
    source_node_id: e.source_node_id,
    target_node_id: e.target_node_id,
    mapping: e.mapping || [],
    conditions: e.conditions || [],
    source_handle: e.source_handle ?? null,
    id: e.id,
  }));
}

async function readSseToText(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content' && parsed.content) full += parsed.content;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return full;
}

export interface WorkflowTemplateTestRunApi {
  pins: Record<string, Record<string, unknown>>;
  isRunning: boolean;
  lastError: string | null;
  computeSuggestedInput: (stepId: string) => Record<string, unknown>;
  runCurrentStepTest: (
    step: WorkflowTemplateStep,
    options?: { inputOverride?: Record<string, unknown> }
  ) => Promise<void>;
  clearAllPins: () => void;
  clearPin: (stepId: string) => void;
  upstreamPreview: (stepId: string) => string;
}

export function useWorkflowTemplateTestRun(
  steps: WorkflowTemplateStep[],
  graphEdges: WorkflowGraphEdge[]
): WorkflowTemplateTestRunApi {
  const [pins, setPins] = useState<Record<string, Record<string, unknown>>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fullEdges = useMemo(() => toFullEdges(graphEdges), [graphEdges]);

  const computeSuggestedInput = useCallback(
    (stepId: string) => buildTestInputFromPins(stepId, fullEdges, steps, pins),
    [fullEdges, steps, pins]
  );

  const upstreamPreview = useCallback(
    (stepId: string) => {
      const items = collectUpstreamTestContext(stepId, fullEdges, steps, pins);
      return formatUpstreamContextBlock(items);
    },
    [fullEdges, steps, pins]
  );

  const runCurrentStepTest = useCallback(
    async (step: WorkflowTemplateStep, options?: { inputOverride?: Record<string, unknown> }) => {
      setLastError(null);
      setIsRunning(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Нужна авторизация');
        }

        const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
        const authHeader = session.access_token;

        let working: Record<string, unknown> =
          options?.inputOverride ?? computeSuggestedInput(step.id);

        const nt = step.node_type || 'agent';
        let output: Record<string, unknown>;

        if (nt === 'input') {
          output = working && Object.keys(working).length > 0 ? working : { content: '' };
        } else if (nt === 'condition') {
          const orch = parseOrchestration(step.script_config || {});
          const ok = orch && orch.kind === 'if_else' ? evaluateIfElse(orch, working) : false;
          output = { ...working, _branch: ok ? 'true' : 'false', _condition_met: ok };
        } else if (nt === 'quality_check') {
          const orch = parseOrchestration(step.script_config || {});
          const r =
            orch && orch.kind === 'quality_check'
              ? evaluateQualityCheck(orch, working)
              : { passed: true, errors: [] as string[] };
          output = { ...working, quality_passed: r.passed, quality_errors: r.errors };
        } else if (nt === 'script') {
          const cfg = step.script_config || {};
          const functionName = (cfg as { function_name?: string; scriptKey?: string }).function_name
            || (cfg as { scriptKey?: string }).scriptKey;
          if (!functionName) throw new Error('Скрипт: укажите function_name / scriptKey');
          const params = { ...((cfg as { params?: Record<string, unknown> }).params || {}), ...working };
          const res = await fetch(`${baseUrl}/${functionName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authHeader}`,
            },
            body: JSON.stringify(params),
          });
          const text = await res.text();
          if (!res.ok) throw new Error(text || `Скрипт HTTP ${res.status}`);
          try {
            output = JSON.parse(text) as Record<string, unknown>;
          } catch {
            output = { content: text };
          }
        } else if (nt === 'agent' || nt === 'output') {
          const upstream = collectUpstreamTestContext(step.id, fullEdges, steps, pins);
          const contextMessage = formatUpstreamContextBlock(upstream);
          let systemPromptAppend = step.prompt_override || '';
          if (nt === 'output') {
            systemPromptAppend +=
              '\n\nТвоя задача — собрать и структурировать результаты всех предыдущих этапов в финальный документ. Объедини все данные в единый связный текст.';
          }
          const schema = step.output_schema || {};
          if (schema && typeof schema === 'object' && Object.keys(schema).length > 0) {
            systemPromptAppend += `\n\nВерни результат в формате JSON со следующей структурой:\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
          }

          const msgHistory: { role: string; content: string }[] = [];
          if (contextMessage) {
            msgHistory.push({ role: 'user', content: contextMessage });
            msgHistory.push({ role: 'assistant', content: 'Понял контекст. Готов выполнить задачу этого этапа.' });
          }
          const inputBlock =
            working && Object.keys(working).length > 0
              ? typeof working === 'object' && 'content' in working
                ? String(working.content)
                : JSON.stringify(working)
              : '';
          if (inputBlock) {
            msgHistory.push({
              role: 'user',
              content: `## Входные данные текущего этапа (тест)\n\n${inputBlock}`,
            });
          }

          const body: Record<string, unknown> = {
            message:
              'Выполни задачу этого этапа на основе предоставленного контекста (тестовый прогон шаблонов).',
            message_history: msgHistory,
          };
          if (step.agent_id) body.role_id = step.agent_id;
          if (step.model?.trim()) body.model = step.model.trim();
          if (systemPromptAppend.trim()) body.system_prompt_append = systemPromptAppend.trim();

          const chatResponse = await fetch(`${baseUrl}/chat-stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authHeader}`,
            },
            body: JSON.stringify(body),
          });

          if (!chatResponse.ok) {
            const errText = await chatResponse.text();
            throw new Error(errText || `chat-stream ${chatResponse.status}`);
          }

          const fullContent = await readSseToText(chatResponse.body);
          let parsedResult: Record<string, unknown> | null = null;
          try {
            const m = fullContent.match(/\{[\s\S]*\}/);
            if (m) parsedResult = JSON.parse(m[0]);
          } catch {
            /* ignore */
          }
          output = parsedResult
            ? { ...parsedResult, _stream_text: fullContent }
            : { content: fullContent };
        } else {
          throw new Error(`Тест для типа узла «${nt}» не настроен`);
        }

        setPins((p) => ({ ...p, [step.id]: output }));
        toast.success('Тест узла выполнен — выход сохранён для следующих узлов');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ошибка теста';
        setLastError(msg);
        toast.error(msg);
      } finally {
        setIsRunning(false);
      }
    },
    [computeSuggestedInput, fullEdges, pins, steps]
  );

  const clearAllPins = useCallback(() => setPins({}), []);
  const clearPin = useCallback((stepId: string) => {
    setPins((p) => {
      const next = { ...p };
      delete next[stepId];
      return next;
    });
  }, []);

  return {
    pins,
    isRunning,
    lastError,
    computeSuggestedInput,
    runCurrentStepTest,
    clearAllPins,
    clearPin,
    upstreamPreview,
  };
}
