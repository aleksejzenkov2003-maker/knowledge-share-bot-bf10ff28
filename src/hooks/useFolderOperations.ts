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

      // 3. Delete files from Storage
      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("rag-documents")
          .remove(storagePaths);
        
        if (storageError) {
          console.error("Storage delete error:", storageError);
          // Continue anyway - DB records are more important
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

      let successCount = 0;
      let errorCount = 0;

      // 2. Process each document
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        setReprocessProgress({ 
          current: i, 
          total: docs.length,
          currentDocName: doc.name 
        });

        try {
          // Delete existing chunks
          await supabase
            .from("document_chunks")
            .delete()
            .eq("document_id", doc.id);

          // Reset status to pending
          await supabase
            .from("documents")
            .update({ status: "pending", chunk_count: 0 })
            .eq("id", doc.id);

          // Invoke processing function
          const { error: processError } = await supabase.functions.invoke("process-document", {
            body: { document_id: doc.id }
          });

          if (processError) {
            console.error(`Error processing ${doc.name}:`, processError);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error(`Error reprocessing ${doc.name}:`, err);
          errorCount++;
        }
      }

      setReprocessProgress({ current: docs.length, total: docs.length });

      if (errorCount === 0) {
        toast.success(`Переобработано ${successCount} документов`);
      } else {
        toast.warning(`Успешно: ${successCount}, с ошибками: ${errorCount}`);
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
