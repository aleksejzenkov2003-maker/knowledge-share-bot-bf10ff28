import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import type { WorkflowArtifact } from '@/types/workflow';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, Loader2, Upload, Image as ImageIcon } from 'lucide-react';

function toSafeFileName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function markdownToHtml(text: string): string {
  // Lightweight conversion: headings + bold/italic + lists + paragraphs
  // (We already use ReactMarkdown in UI; for PDF we render HTML)
  return text
    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:700;margin:14px 0 10px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:800;margin:16px 0 12px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:22px;font-weight:900;margin:18px 0 14px;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\s*[-*] (.+)$/gm, '<li style="margin-left:18px;margin-bottom:4px;">$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li style="margin-left:18px;margin-bottom:4px;list-style-type:decimal;">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:10px 0;">')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p style="margin:10px 0;">')
    .replace(/$/, '</p>');
}

function renderBrandedHtml(markdown: string): string {
  const body = markdownToHtml(markdown);
  const tmMatch =
    markdown.match(/товарного знака\s*[«"](.*?)[»"]/i) ||
    markdown.match(/#\s*(.+)/);
  const tm = tmMatch?.[1]?.trim() || 'ТОВАРНОГО ЗНАКА';

  return `
    <section style="background:#23272e;color:#fff;padding:56px 56px 64px;min-height:980px;">
      <div style="font-size:13px;letter-spacing:6px;color:#c6d1e3;margin-bottom:48px;">РЕГИСТРАЦИЯ ТОВАРНОГО ЗНАКА   ARTPATENT.RU</div>
      <div style="font-size:74px;line-height:0.95;font-weight:400;letter-spacing:1px;">РЕГИСТРАЦИЯ</div>
      <div style="font-size:74px;line-height:0.95;font-weight:400;letter-spacing:1px;">ТОВАРНОГО</div>
      <div style="font-size:74px;line-height:0.95;font-weight:400;letter-spacing:1px;margin-bottom:40px;">ЗНАКА</div>
      <div style="font-size:26px;line-height:1.3;color:#f3f5f7;margin-bottom:30px;">${tm}</div>
      <div style="font-size:32px;line-height:1.6;color:#f3f5f7;">
        Анализ охраноспособности<br/>
        Подбор классов МКТУ<br/>
        Результаты бесплатного поиска<br/>
        Детальный расчет стоимости
      </div>
      <div style="margin-top:120px;font-size:36px;letter-spacing:10px;">ARTPATENT</div>
    </section>
    <section style="background:#fff;color:#000;padding:34px 40px 30px;">
      ${body}
      <div style="margin-top:26px;padding-top:10px;border-top:1px solid #d8dee8;font-size:12px;color:#6d7786;">
        420202 | Казань | Тази Гиззата 4 | +7 843 2 728 728 | info@artpatent.ru | www.artpatent.ru
      </div>
    </section>
  `;
}

async function createSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function KpRenderEditorDialog(props: {
  projectId: string;
  workflowId: string;
  stepId: string;
  initialMarkdown: string;
  artifacts: WorkflowArtifact[];
  trigger: React.ReactNode;
}) {
  const { projectId, workflowId, stepId, initialMarkdown, artifacts, trigger } = props;
  const [open, setOpen] = useState(false);
  const [md, setMd] = useState(initialMarkdown || '');
  const [isBusy, setIsBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMd(initialMarkdown || '');
  }, [open, initialMarkdown]);

  const screenshotArtifacts = useMemo(() => {
    return (artifacts || []).filter((a) => a.artifact_type === 'screenshot' && a.bucket && a.path);
  }, [artifacts]);

  const [shotUrls, setShotUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) return;
      const next: Record<string, string> = {};
      for (const a of screenshotArtifacts.slice(0, 30)) {
        const url = await createSignedUrl(a.bucket, a.path, 3600);
        if (url) next[a.id] = url;
      }
      if (!cancelled) setShotUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, screenshotArtifacts]);

  const html = useMemo(() => renderBrandedHtml(md), [md]);

  const renderPdfBlob = async (): Promise<Blob> => {
    const el = previewRef.current;
    if (!el) throw new Error('preview_not_ready');

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth - 20; // 10mm margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10;

    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight - 20;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 20;
    }

    return pdf.output('blob') as Blob;
  };

  const handleDownloadPdf = async () => {
    setIsBusy(true);
    try {
      const blob = await renderPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${toSafeFileName('КП')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF скачан');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать PDF');
    } finally {
      setIsBusy(false);
    }
  };

  const handleUploadPdf = async () => {
    setIsBusy(true);
    try {
      const blob = await renderPdfBlob();
      const fileName = `${Date.now()}_${toSafeFileName('kp')}.pdf`;
      const path = `${projectId}/${workflowId}/${stepId}/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from('generated-documents')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;

      // register in workflow_artifacts (RLS policy позволяет insert для участников)
      await supabase.from('workflow_artifacts').insert({
        project_id: projectId,
        workflow_run_id: workflowId,
        project_workflow_step_id: stepId,
        artifact_type: 'kp_pdf',
        bucket: 'generated-documents',
        path,
        mime: 'application/pdf',
        metadata: { title: 'Коммерческое предложение' },
      } as never);

      toast.success('PDF загружен в документы проекта');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось загрузить PDF');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Редактор КП</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          <Tabs defaultValue="edit" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="mx-4 mt-3 w-fit flex-wrap h-auto gap-1">
              <TabsTrigger value="edit">Текст</TabsTrigger>
              <TabsTrigger value="preview">Превью</TabsTrigger>
              <TabsTrigger value="assets">
                <ImageIcon className="h-4 w-4 mr-1" />
                Скриншоты
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
              <Card className="h-full p-3 flex flex-col min-h-0">
                <div className="text-xs text-muted-foreground mb-2">
                  Правьте текст вручную. Экспорт в PDF делается из вкладки «Превью».
                </div>
                <Textarea
                  value={md}
                  onChange={(e) => setMd(e.target.value)}
                  className="flex-1 min-h-0 font-mono text-[11px] resize-none"
                  spellCheck={false}
                />
              </Card>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void handleDownloadPdf()}>
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                  Скачать PDF
                </Button>
                <Button size="sm" disabled={isBusy} onClick={() => void handleUploadPdf()}>
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Загрузить в проект
                </Button>
              </div>

              <ScrollArea className="h-full rounded border bg-white">
                <div
                  ref={previewRef}
                  style={{
                    width: 800,
                    padding: 40,
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: '#000',
                    background: '#fff',
                  }}
                >
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="assets" className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
              <ScrollArea className="h-full rounded border p-3">
                {screenshotArtifacts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Скриншоты не найдены (нужен шаг «Шпион»).</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {screenshotArtifacts.slice(0, 30).map((a) => (
                      <div key={a.id} className="border rounded-md overflow-hidden bg-card">
                        <div className="px-2 py-1 text-[10px] text-muted-foreground truncate flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          <span className="truncate">{String((a.metadata as any)?.url || a.path)}</span>
                        </div>
                        {shotUrls[a.id] ? (
                          <img
                            src={shotUrls[a.id]}
                            alt="screenshot"
                            className="w-full h-44 object-cover"
                          />
                        ) : (
                          <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                            загрузка…
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

