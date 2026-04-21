import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { workflowQueryKeys } from '@/hooks/useProjectWorkflow';
import { ProjectWorkflowStep, ProjectStepMessage, WorkflowArtifact } from '@/types/workflow';
import { WorkflowResultEditor } from './WorkflowResultEditor';
import { WorkflowStepChat } from './WorkflowStepChat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpRenderEditorDialog } from './KpRenderEditorDialog';
import { supabase } from '@/integrations/supabase/client';
import { useDocumentIngestCleaner } from '@/hooks/useDocumentIngestCleaner';
import { toast } from 'sonner';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  MessageSquare,
  Bot,
  GitCompareArrows,
  Braces,
  FileSignature,
  Image as ImageIcon,
  ExternalLink,
  Users,
  Download,
  SkipForward,
  Upload,
  Paperclip,
  X,
} from 'lucide-react';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface WorkflowStepViewProps {
  step: ProjectWorkflowStep;
  stepMessages: ProjectStepMessage[];
  artifacts: WorkflowArtifact[];
  projectId: string;
  isExecuting: boolean;
  streamingContent: string;
  onExecute: (stepId: string, message?: string, attachments?: { file_path: string; file_name: string; file_type: string; file_size: number; contains_pii?: boolean }[]) => void;
  onStop: () => void;
  onSaveEdits: (stepId: string, edits: Record<string, unknown>) => void;
  onConfirm: (stepId: string) => void;
  onSetInputData: (stepId: string, data: Record<string, unknown>) => void;
  onRetryStep: (stepId: string) => void;
  onRetryFromStep: (stepId: string) => void;
  onSkipStep: (stepId: string) => void;
  isFirstStep: boolean;
  allSteps?: ProjectWorkflowStep[];
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Ожидание', variant: 'outline' },
  running: { label: 'Выполняется', variant: 'default' },
  completed: { label: 'Завершён', variant: 'secondary' },
  error: { label: 'Ошибка', variant: 'destructive' },
  skipped: { label: 'Пропущен', variant: 'outline' },
  waiting_for_user: { label: 'Ожидает подтверждения', variant: 'outline' },
};

function stringifyPayload(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null && 'content' in data) {
    return String((data as Record<string, unknown>).content);
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export const WorkflowStepView: React.FC<WorkflowStepViewProps> = ({
  step,
  stepMessages,
  artifacts,
  projectId,
  isExecuting,
  streamingContent,
  onExecute,
  onStop,
  onSaveEdits,
  onConfirm,
  onSetInputData,
  onRetryStep,
  onRetryFromStep,
  onSkipStep,
  isFirstStep,
  allSteps = [],
}) => {
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sourceDocumentId, setSourceDocumentId] = useState('');
  const [compareRaw, setCompareRaw] = useState(false);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { runIngest, isRunning: isIngestRunning } = useDocumentIngestCleaner();

  // Filter screenshot artifacts for this step
  const screenshotArtifacts = useMemo(() => {
    return artifacts.filter(
      (a) =>
        a.project_workflow_step_id === step.id &&
        a.artifact_type === 'screenshot' &&
        a.bucket === 'node-artifacts',
    );
  }, [artifacts, step.id]);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (screenshotArtifacts.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const urls: Record<string, string> = {};
      for (const a of screenshotArtifacts) {
        const { data, error } = await supabase.storage
          .from(a.bucket)
          .createSignedUrl(a.path, 3600);
        if (!error && data?.signedUrl) {
          urls[a.id] = data.signedUrl;
        }
      }
      if (!cancelled) setSignedUrls(urls);
    };
    load();
    return () => { cancelled = true; };
  }, [screenshotArtifacts]);

  const name = step.template_step?.name || `Этап ${step.step_order}`;
  const description = step.template_step?.description || '';
  const agentName = step.agent?.name || 'Агент';
  const nodeType = step.template_step?.node_type || '';

  const hr = step.human_readable_output as { title?: string; summary?: string; sections?: unknown[] } | null;
  const rawOut = step.raw_output ?? step.output_data;
  const userEdited = step.user_edited_output ?? step.user_edits;

  const outputContent = stringifyPayload(rawOut);
  const userEditsContent = userEdited ? stringifyPayload(userEdited) : null;

  const displayContent =
    isExecuting && streamingContent
      ? streamingContent
      : editedContent !== null
        ? editedContent
        : compareRaw
          ? outputContent
          : userEditsContent || outputContent || hr?.summary || '';

  const statusInfo = statusLabels[step.status] || statusLabels.pending;
  const isEditable = step.template_step?.is_user_editable !== false;
  const isKpFinal =
    (step.template_step?.name || '').toLowerCase().includes('кп') ||
    step.template_step?.node_type === 'output';

  const clientKp = useMemo(() => {
    const out = rawOut as Record<string, unknown> | null;
    if (out?.client_kp && typeof out.client_kp === 'string') return out.client_kp;
    return null;
  }, [rawOut]);

  const internalReport = useMemo(() => {
    const out = rawOut as Record<string, unknown> | null;
    if (out?.internal_report && typeof out.internal_report === 'string') return out.internal_report;
    return null;
  }, [rawOut]);

  const hasTwoDocs = clientKp !== null && internalReport !== null;

  const handleDownloadDocx = useCallback(async () => {
    if (!clientKp) return;
    try {
      const out = (rawOut as Record<string, unknown> | null) || {};
      const logoUrl =
        (typeof out.company_logo_url === 'string' && out.company_logo_url) ||
        (typeof out.logo_url === 'string' && out.logo_url) ||
        null;
      const companyName =
        (typeof out.company_name === 'string' && out.company_name) ||
        (typeof out.applicant === 'string' && out.applicant) ||
        '';
      const contactPerson = typeof out.contact_person === 'string' ? out.contact_person : '';
      const email = typeof out.email === 'string' ? out.email : '';
      const phone = typeof out.phone === 'string' ? out.phone : '';
      const screenshotPayload = screenshotArtifacts
        .map((artifact) => {
          const meta = (artifact.metadata as Record<string, unknown> | null) || {};
          const signedUrl = signedUrls[artifact.id];
          if (!signedUrl) return null;
          return {
            url: signedUrl,
            title:
              (typeof meta.title === 'string' && meta.title) ||
              (typeof meta.url === 'string' && meta.url) ||
              artifact.path,
            source_url: typeof meta.url === 'string' ? meta.url : undefined,
          };
        })
        .filter(Boolean)
        .slice(0, 10);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-kp-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: clientKp,
          trademark_name: step.template_step?.name || 'KP',
          company_name: companyName || undefined,
          contact_person: contactPerson || undefined,
          email: email || undefined,
          phone: phone || undefined,
          logo_url: logoUrl || undefined,
          screenshots: screenshotPayload,
          project_id: projectId,
        }),
      });
      if (!resp.ok) throw new Error('Ошибка генерации DOCX');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'КП.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  }, [clientKp, projectId, rawOut, screenshotArtifacts, signedUrls, step.template_step?.name]);

  const handleSaveEdits = () => {
    if (editedContent !== null) {
      try {
        const parsed = JSON.parse(editedContent);
        onSaveEdits(step.id, parsed as Record<string, unknown>);
      } catch {
        onSaveEdits(step.id, { content: editedContent });
      }
      setEditedContent(null);
    }
  };

  const handleConfirm = () => {
    onConfirm(step.id);
  };

  const handleSetInput = () => {
    if (!inputText.trim() && existingAttachments.length === 0) return;
    const payload: Record<string, unknown> = { content: inputText };
    if (existingAttachments.length > 0) {
      payload.attachments = existingAttachments;
    }
    onSetInputData(step.id, payload);
    setInputText('');
  };

  const handleIngestDocument = async () => {
    if (!sourceDocumentId.trim()) return;
    const data = await runIngest({
      documentId: sourceDocumentId.trim(),
      projectId,
      forceReprocess: true,
    });
    if (!data?.markdown) return;
    setInputText((prev) =>
      [prev.trim(), `## Контекст из документа ${sourceDocumentId.trim()}\n\n${data.markdown}`]
        .filter(Boolean)
        .join('\n\n'),
    );
  };

  // File upload handler — uploads to chat-attachments bucket so chat-stream can read them
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_FILES_PER_UPLOAD = 5;

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files).slice(0, MAX_FILES_PER_UPLOAD);
    const oversized = fileArr.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast.error(`Файлы больше 10МБ: ${oversized.map((f) => f.name).join(', ')}`);
      return;
    }
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Не авторизован');
        return;
      }
      const uploadedAttachments: { file_path: string; file_name: string; file_type: string; file_size: number }[] = [];
      const sanitizeForStorage = (name: string) => {
        const dotIdx = name.lastIndexOf('.');
        const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
        const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
        const safeBase = base
          .normalize('NFKD')
          .replace(/[^\w.\-]+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 80) || 'file';
        const safeExt = ext.replace(/[^\w.]+/g, '');
        return `${safeBase}${safeExt}`;
      };
      for (const file of fileArr) {
        // Path under user.id so chat-attachments RLS allows it.
        // Storage keys must be ASCII-safe (no cyrillic/spaces).
        const safeName = sanitizeForStorage(file.name);
        const path = `${user.id}/workflow/${step.id}/${Date.now()}_${safeName}`;
        const { error } = await supabase.storage
          .from('chat-attachments')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (error) {
          console.error('Upload error:', error);
          toast.error(`Ошибка загрузки ${file.name}`);
          continue;
        }
        uploadedAttachments.push({
          file_path: path,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
        });
      }
      if (uploadedAttachments.length > 0) {
        const currentInput = (step.input_data || {}) as Record<string, unknown>;
        const existing = Array.isArray(currentInput.attachments)
          ? (currentInput.attachments as unknown[])
          : [];
        const newInput = {
          ...currentInput,
          attachments: [...existing, ...uploadedAttachments],
        };
        await supabase
          .from('project_workflow_steps')
          .update({ input_data: newInput } as never)
          .eq('id', step.id);
        toast.success(`Загружено файлов: ${uploadedAttachments.length}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки файлов');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [step.id, step.input_data]);

  // Existing attachments list (from step.input_data.attachments)
  const existingAttachments = useMemo(() => {
    const inp = (step.input_data || {}) as Record<string, unknown>;
    const att = inp.attachments;
    if (!Array.isArray(att)) return [];
    return att as { file_path: string; file_name: string; file_type: string; file_size: number }[];
  }, [step.input_data]);

  // Globally suppressed attachment paths — collected from suppressed_attachments
  // arrays on every step's input_data. Once a doc is removed anywhere, it stops
  // being inherited by all subsequent steps.
  const suppressedPaths = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSteps) {
      const sup = (s?.input_data as Record<string, unknown> | null)?.suppressed_attachments;
      if (Array.isArray(sup)) {
        for (const p of sup) if (typeof p === 'string') set.add(p);
      }
    }
    return set;
  }, [allSteps]);

  // Attachments inherited from previous steps in the same workflow run.
  // Aggregated from output_data.attachments and input_data.attachments of any step
  // with step_order < current. Excludes those already attached directly to this step
  // and any path that was suppressed (removed) on any step.
  const inheritedAttachments = useMemo(() => {
    const map = new Map<string, { file_path: string; file_name: string; file_size?: number }>();
    for (const s of allSteps) {
      if (!s || s.id === step.id) continue;
      if ((s.step_order ?? 0) >= (step.step_order ?? 0)) continue;
      const buckets: unknown[] = [
        (s.output_data as Record<string, unknown> | null)?.attachments,
        (s.input_data as Record<string, unknown> | null)?.attachments,
        (s.approved_output as Record<string, unknown> | null)?.attachments,
        (s.user_edited_output as Record<string, unknown> | null)?.attachments,
      ];
      for (const b of buckets) {
        if (!Array.isArray(b)) continue;
        for (const a of b as Record<string, unknown>[]) {
          const fp = a?.file_path;
          if (typeof fp === 'string' && !map.has(fp) && !suppressedPaths.has(fp)) {
            map.set(fp, {
              file_path: fp,
              file_name: String(a.file_name || fp),
              file_size: typeof a.file_size === 'number' ? a.file_size : undefined,
            });
          }
        }
      }
    }
    for (const a of existingAttachments) map.delete(a.file_path);
    return Array.from(map.values());
  }, [allSteps, step.id, step.step_order, existingAttachments, suppressedPaths]);

  const handleRemoveAttachment = useCallback(async (filePath: string) => {
    try {
      const currentInput = (step.input_data || {}) as Record<string, unknown>;
      const ownAtts = Array.isArray(currentInput.attachments) ? currentInput.attachments : [];
      const isOwn = ownAtts.some((a: any) => a?.file_path === filePath);
      const newInput: Record<string, unknown> = { ...currentInput };

      if (isOwn) {
        // Best-effort storage cleanup only for own files
        try { await supabase.storage.from('chat-attachments').remove([filePath]); } catch {}
        newInput.attachments = ownAtts.filter((a: any) => a?.file_path !== filePath);
      } else {
        // Inherited file — add to suppressed list so it stops propagating
        const existingSup = Array.isArray(currentInput.suppressed_attachments)
          ? (currentInput.suppressed_attachments as string[])
          : [];
        if (!existingSup.includes(filePath)) {
          newInput.suppressed_attachments = [...existingSup, filePath];
        }
      }

      const { error } = await supabase
        .from('project_workflow_steps')
        .update({ input_data: newInput } as never)
        .eq('id', step.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflowSteps(step.workflow_id) });
      toast.success('Файл удалён');
    } catch (e) {
      console.error('[handleRemoveAttachment]', e);
      toast.error('Не удалось удалить файл');
    }
  }, [step.id, step.input_data, step.workflow_id, queryClient]);

  // First step pending: input form
  const [showIngestTool, setShowIngestTool] = React.useState(false);

  if (isFirstStep && step.status === 'pending') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{name}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <Card className="p-4">
          <label className="text-sm font-medium mb-2 block">Входные данные</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Введите данные для начала workflow..."
            className="w-full min-h-[200px] p-3 border rounded-md bg-background text-sm resize-y"
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button onClick={handleSetInput} disabled={!inputText.trim() && existingAttachments.length === 0}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Сохранить и продолжить
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Paperclip className="h-4 w-4 mr-1" />}
              Прикрепить файлы
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => setShowIngestTool(!showIngestTool)}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Импорт из документа
            </Button>
          </div>
          {existingAttachments.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                Вложения ({existingAttachments.length}/5) — будут переданы LLM как контекст:
              </p>
              {existingAttachments.map((att) => (
                <div
                  key={att.file_path}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{att.file_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatFileSize(att.file_size)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleRemoveAttachment(att.file_path)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {showIngestTool && (
            <div className="mt-3 rounded-md border p-3 bg-muted/20">
              <p className="text-[11px] text-muted-foreground mb-2">
                Загрузить содержимое документа из базы знаний (по ID) и вставить как Markdown в поле выше.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={sourceDocumentId}
                  onChange={(e) => setSourceDocumentId(e.target.value)}
                  placeholder="ID документа (documents.id)"
                  className="flex-1 h-8 px-2 border rounded-md bg-background text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sourceDocumentId.trim() || isIngestRunning}
                  onClick={() => void handleIngestDocument()}
                >
                  {isIngestRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Импорт'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const hasOutput = !!(displayContent || isExecuting);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden">
      {/* Compact header */}
      <div className="px-4 py-2 border-b flex items-center justify-between flex-wrap gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-semibold text-sm truncate">{name}</h2>
          <Badge variant={statusInfo.variant} className="text-xs shrink-0">{statusInfo.label}</Badge>
          {step.agent && (
            <Badge variant="secondary" className="text-xs shrink-0">
              <Bot className="h-3 w-3 mr-1" />
              {agentName}
            </Badge>
          )}
          {nodeType === 'condition' && step.status === 'completed' && rawOut && typeof rawOut === 'object' && (
            <Badge variant="outline" className="text-xs">
              {(rawOut as Record<string, unknown>)._branch === true ||
              (rawOut as Record<string, unknown>)._branch === 'true'
                ? 'Да' : 'Нет'}
            </Badge>
          )}
          {nodeType === 'quality_check' && step.status === 'completed' && rawOut && typeof rawOut === 'object' && (
            <Badge
              variant={(rawOut as Record<string, unknown>).quality_passed === true ? 'secondary' : 'destructive'}
              className="text-xs"
            >
              {(rawOut as Record<string, unknown>).quality_passed === true ? '✓ Пройдена' : '✗ Не пройдена'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {step.status === 'completed' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onExecute(step.id)}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Перезапустить
            </Button>
          )}
          {(step.status === 'pending' || step.status === 'error') && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSkipStep(step.id)}>
              <SkipForward className="h-3 w-3 mr-1" />
              Пропустить
            </Button>
          )}
          {step.status === 'completed' && isKpFinal && (
            <KpRenderEditorDialog
              projectId={projectId}
              workflowId={step.workflow_id}
              stepId={step.id}
              initialMarkdown={stringifyPayload(userEdited ?? rawOut)}
              artifacts={artifacts}
              trigger={
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <FileSignature className="h-3 w-3 mr-1" />
                  КП
                </Button>
              }
            />
          )}
          {(step.status === 'running' || isExecuting) && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onStop}>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Стоп
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {step.error_message && (
        <div className="mx-4 mt-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {step.error_message}
        </div>
      )}

      {/* Inherited attachments from previous steps */}
      {inheritedAttachments.length > 0 && (
        <div className="mx-4 mt-2 rounded-md border bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            Документы из предыдущих этапов ({inheritedAttachments.length}) — переданы агенту
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {inheritedAttachments.map((a) => (
              <div
                key={a.file_path}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-[11px]"
              >
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate max-w-[200px]">{a.file_name}</span>
                {typeof a.file_size === 'number' && (
                  <span className="text-[9px] text-muted-foreground">
                    {formatFileSize(a.file_size)}
                  </span>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-4 w-4 shrink-0"
                  title="Убрать из этого и последующих этапов"
                  onClick={() => handleRemoveAttachment(a.file_path)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content: chat-first layout with tabs */}
      {hasOutput ? (
        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden">
          <TabsList className="mx-4 mt-2 w-fit flex-wrap h-auto gap-1">
            <TabsTrigger value="chat" className="text-xs h-7">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Чат
            </TabsTrigger>
            {hasTwoDocs ? (
              <>
                <TabsTrigger value="client_kp" className="text-xs h-7">
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  КП клиенту
                </TabsTrigger>
                <TabsTrigger value="employee_report" className="text-xs h-7">
                  <Users className="h-3.5 w-3.5 mr-1" />
                  Отчёт
                </TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="result" className="text-xs h-7">
                <FileText className="h-3.5 w-3.5 mr-1" />
                Результат
              </TabsTrigger>
            )}
            <TabsTrigger value="structured" className="text-xs h-7">
              <Braces className="h-3.5 w-3.5 mr-1" />
              JSON
            </TabsTrigger>
            {screenshotArtifacts.length > 0 && (
              <TabsTrigger value="screenshots" className="text-xs h-7">
                <ImageIcon className="h-3.5 w-3.5 mr-1" />
                ({screenshotArtifacts.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* Chat tab — primary */}
          <TabsContent value="chat" className="flex-1 flex flex-col px-4 pb-2 mt-0 min-h-0 min-w-0 overflow-hidden">
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <WorkflowStepChat
                stepId={step.id}
                projectId={projectId}
                messages={stepMessages}
                onSendMessage={(msg, atts) => onExecute(step.id, msg, atts)}
                isExecuting={isExecuting}
                streamingContent={streamingContent}
                inheritedAttachments={inheritedAttachments}
              />
            </div>
            {/* Existing attachments list (uploaded directly to this step) */}
            {existingAttachments.length > 0 && (
              <div className="mt-2 pt-2 border-t space-y-1">
                <p className="text-[10px] text-muted-foreground">
                  Вложения этапа ({existingAttachments.length}/5):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {existingAttachments.map((att) => (
                    <div
                      key={att.file_path}
                      className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-[11px] max-w-full"
                    >
                      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-[160px]">{att.file_name}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {formatFileSize(att.file_size)}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-4 w-4 shrink-0"
                        onClick={() => handleRemoveAttachment(att.file_path)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Step action buttons */}
            <div className="flex items-center gap-2 pt-2 border-t mt-2 flex-wrap">
              {step.status === 'pending' && !isFirstStep && (
                <Button size="sm" className="h-7 text-xs" onClick={() => onExecute(step.id)}>
                  <Play className="h-3 w-3 mr-1" />
                  Запустить этап
                </Button>
              )}
              {step.status === 'error' && (
                <Button size="sm" className="h-7 text-xs" onClick={() => onExecute(step.id)}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Повторить
                </Button>
              )}
              {step.status === 'completed' && (
                <Button size="sm" className="h-7 text-xs" onClick={handleConfirm}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Подтвердить и продолжить
                </Button>
              )}
            </div>
          </TabsContent>

          {/* Two-doc tabs */}
          {hasTwoDocs && (
            <>
              <TabsContent value="client_kp" className="flex-1 min-h-0 min-w-0 overflow-auto px-4 pb-4 mt-0">
                <div className="flex items-center gap-2 mb-2">
                  <Button size="sm" variant="outline" onClick={handleDownloadDocx}>
                    <Download className="h-4 w-4 mr-1" />
                    Скачать DOCX
                  </Button>
                </div>
                <WorkflowResultEditor
                  content={clientKp!}
                  isEditable={isEditable && step.status === 'completed'}
                  isStreaming={false}
                  onChange={setEditedContent}
                  onSave={handleSaveEdits}
                  hasUnsavedChanges={editedContent !== null}
                />
              </TabsContent>
              <TabsContent value="employee_report" className="flex-1 min-h-0 min-w-0 overflow-auto px-4 pb-4 mt-0">
                <WorkflowResultEditor
                  content={internalReport!}
                  isEditable={false}
                  isStreaming={false}
                  onChange={() => {}}
                  onSave={() => {}}
                  hasUnsavedChanges={false}
                />
              </TabsContent>
            </>
          )}

          {/* Single result tab */}
          {!hasTwoDocs && (
            <TabsContent value="result" className="flex-1 min-h-0 min-w-0 mt-0 px-4 pb-4 overflow-auto">
              <div className="flex min-h-0 min-w-0 flex-col">
                {userEdited && rawOut && (
                  <div className="flex justify-end mb-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setCompareRaw((v) => !v)}
                    >
                      <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                      {compareRaw ? 'Правки' : 'Сырой'}
                    </Button>
                  </div>
                )}
                <WorkflowResultEditor
                  content={displayContent}
                  isEditable={isEditable && step.status === 'completed'}
                  isStreaming={isExecuting}
                  onChange={setEditedContent}
                  onSave={handleSaveEdits}
                  hasUnsavedChanges={editedContent !== null}
                />
              </div>
            </TabsContent>
          )}

          {/* JSON tab */}
          <TabsContent value="structured" className="flex-1 min-h-0 min-w-0 mt-0 px-4 pb-4 overflow-auto">
            <div className="h-full min-h-0 min-w-0 overflow-auto pr-1">
              <Card className="p-3 mt-2 min-w-0">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all min-w-0 overflow-x-auto max-w-full"> 
                  {stringifyPayload(compareRaw ? rawOut : userEdited ?? rawOut)}
                </pre>
              </Card>
            </div>
          </TabsContent>

          {/* Screenshots tab */}
          {screenshotArtifacts.length > 0 && (
            <TabsContent value="screenshots" className="flex-1 min-h-0 min-w-0 overflow-auto px-4 pb-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {screenshotArtifacts.map((artifact) => {
                  const meta = artifact.metadata as Record<string, unknown> | null;
                  const url = meta?.url as string | undefined;
                  const title = meta?.title as string | undefined;
                  const signedUrl = signedUrls[artifact.id];
                  return (
                    <Card key={artifact.id} className="overflow-hidden">
                      {signedUrl ? (
                        <div
                          className="cursor-pointer"
                          onClick={() => setExpandedScreenshot(expandedScreenshot === artifact.id ? null : artifact.id)}
                        >
                          <img
                            src={signedUrl}
                            alt={title || url || 'Screenshot'}
                            className={`w-full object-cover transition-all ${expandedScreenshot === artifact.id ? 'max-h-none' : 'max-h-64'}`}
                          />
                        </div>
                      ) : (
                        <div className="h-40 flex items-center justify-center bg-muted text-muted-foreground text-sm">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          Загрузка...
                        </div>
                      )}
                      <div className="p-3 border-t">
                        <p className="text-sm font-medium truncate">{title || url || artifact.path}</p>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                            <ExternalLink className="h-3 w-3" />
                            {new URL(url).hostname}
                          </a>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
        /* Empty state with Run button centered */
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Bot className="h-10 w-10 opacity-30" />
          <p className="text-sm">Этап готов к выполнению</p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Загрузить файлы
            </Button>
            <Button size="sm" onClick={() => onExecute(step.id)}>
              <Play className="h-4 w-4 mr-1" />
              Запустить этап
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
