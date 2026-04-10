import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDocumentIngestCleaner() {
  const [isRunning, setIsRunning] = useState(false);

  const runIngest = useCallback(
    async (params: { documentId: string; projectId?: string; forceReprocess?: boolean }) => {
      setIsRunning(true);
      try {
        const { data, error } = await supabase.functions.invoke('ingest-clean-markdown', {
          body: {
            document_id: params.documentId,
            project_id: params.projectId,
            force_reprocess: params.forceReprocess === true,
          },
        });
        if (error) throw error;
        if (!data?.success) {
          throw new Error(data?.error || 'Не удалось обработать документ');
        }
        toast.success('Документ загружен и очищен в Markdown');
        return data as { success: true; markdown: string; chunks_count: number; document_id: string };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Ошибка загрузки/очистки документа';
        toast.error(message);
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    [],
  );

  return { runIngest, isRunning };
}

