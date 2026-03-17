import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ReprocessMode } from "@/components/documents/ReprocessDialog";

interface ReprocessProgress {
  current: number;
  total: number;
  currentDocName?: string;
}

export function useFolderOperations(onComplete?: () => void) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState<ReprocessProgress | undefined>();

  // Clear all documents from a folder
  const clearFolder = useCallback(async (folderId: string) => {
    setIsDeleting(true);
    try {
      // 1. Get all documents in folder
      const { data: docs, error: fetchError } = await supabase
        .from("documents")
        .select("id, storage_path, name")
        .eq("folder_id", folderId);

      if (fetchError) throw fetchError;

      if (!docs || docs.length === 0) {
        toast.info("Папка уже пуста");
        return true;
      }

      // 2. Get storage paths (filter nulls)
      const storagePaths = docs
        .map(d => d.storage_path)
        .filter((p): p is string => Boolean(p));

      // 3. Safe delete from Storage: only remove paths not used by other documents
      if (storagePaths.length > 0) {
        const docIds = docs.map(d => d.id);
        const safeToDelete: string[] = [];
        for (const sp of storagePaths) {
          const { data: others } = await supabase
            .from("documents")
            .select("id")
            .eq("storage_path", sp)
            .not("id", "in", `(${docIds.join(",")})`);
          if (!others || others.length === 0) {
            safeToDelete.push(sp);
          }
        }
        if (safeToDelete.length > 0) {
          const { error: storageError } = await supabase.storage
            .from("rag-documents")
            .remove(safeToDelete);
          if (storageError) {
            console.error("Storage delete error:", storageError);
          }
        }
      }

      // 4. Delete document records (CASCADE will delete chunks)
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("folder_id", folderId);

      if (deleteError) throw deleteError;

      toast.success(`Удалено ${docs.length} документов`);
      onComplete?.();
      return true;
    } catch (error: any) {
      console.error("Error clearing folder:", error);
      toast.error(error.message || "Ошибка очистки папки");
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [onComplete]);

  // Reprocess documents in a folder
  const reprocessFolder = useCallback(async (folderId: string, mode: ReprocessMode) => {
    setIsReprocessing(true);
    setReprocessProgress({ current: 0, total: 0 });

    try {
      // 1. Build query based on mode
      let query = supabase
        .from("documents")
        .select("id, name, storage_path")
        .eq("folder_id", folderId);

      if (mode === "errors") {
        query = query.eq("status", "error");
      } else if (mode === "pending") {
        query = query.eq("status", "pending");
      }

      const { data: docs, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!docs || docs.length === 0) {
        toast.info("Нет документов для переобработки");
        return true;
      }

      setReprocessProgress({ current: 0, total: docs.length });

      // 2. Batch delete all chunks first (more efficient)
      const docIds = docs.map(d => d.id);
      await supabase
        .from("document_chunks")
        .delete()
        .in("document_id", docIds);

      // 3. Batch update all statuses to pending
      await supabase
        .from("documents")
        .update({ status: "pending", chunk_count: 0 })
        .in("id", docIds);

      let successCount = 0;
      let errorCount = 0;

      // 4. Process documents with delays to prevent resource exhaustion
      // Process in batches of 3 with 2 second delay between batches
      const BATCH_SIZE = 3;
      const BATCH_DELAY = 2000;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        
        setReprocessProgress({ 
          current: i, 
          total: docs.length,
          currentDocName: batch.map(d => d.name).join(", ")
        });

        // Fire off batch requests in parallel (non-blocking)
        const batchPromises = batch.map(async (doc) => {
          try {
            const { error: processError } = await supabase.functions.invoke("process-document", {
              body: { document_id: doc.id }
            });

            if (processError) {
              console.error(`Error processing ${doc.name}:`, processError);
              return false;
            }
            return true;
          } catch (err) {
            console.error(`Error reprocessing ${doc.name}:`, err);
            return false;
          }
        });

        const results = await Promise.all(batchPromises);
        successCount += results.filter(Boolean).length;
        errorCount += results.filter(r => !r).length;

        // Add delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < docs.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      setReprocessProgress({ current: docs.length, total: docs.length });

      if (errorCount === 0) {
        toast.success(`Переобработка ${successCount} документов запущена`);
      } else {
        toast.warning(`Запущено: ${successCount}, с ошибками: ${errorCount}`);
      }

      onComplete?.();
      return true;
    } catch (error: any) {
      console.error("Error reprocessing folder:", error);
      toast.error(error.message || "Ошибка переобработки");
      return false;
    } finally {
      setIsReprocessing(false);
      setReprocessProgress(undefined);
    }
  }, [onComplete]);

  // Delete all error documents globally
  const deleteAllErrors = useCallback(async (folderId?: string) => {
    setIsDeleting(true);
    try {
      let query = supabase
        .from("documents")
        .select("id, storage_path, name")
        .eq("status", "error");

      if (folderId) {
        query = query.eq("folder_id", folderId);
      }

      const { data: docs, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!docs || docs.length === 0) {
        toast.info("Нет документов с ошибками");
        return true;
      }

      // Delete from storage
      const storagePaths = docs
        .map(d => d.storage_path)
        .filter((p): p is string => Boolean(p));

      if (storagePaths.length > 0) {
        await supabase.storage
          .from("rag-documents")
          .remove(storagePaths);
      }

      // Delete records
      let deleteQuery = supabase
        .from("documents")
        .delete()
        .eq("status", "error");

      if (folderId) {
        deleteQuery = deleteQuery.eq("folder_id", folderId);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) throw deleteError;

      toast.success(`Удалено ${docs.length} документов с ошибками`);
      onComplete?.();
      return true;
    } catch (error: any) {
      console.error("Error deleting error documents:", error);
      toast.error(error.message || "Ошибка удаления");
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [onComplete]);

  return {
    clearFolder,
    reprocessFolder,
    deleteAllErrors,
    isDeleting,
    isReprocessing,
    reprocessProgress,
  };
}
