import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FolderStats {
  documentCount: number;
  chunkCount: number;
  totalSize: number;
  errorCount: number;
  processingCount: number;
  pendingCount: number;
}

export interface FolderStatsMap {
  [folderId: string]: FolderStats;
}

export function useFolderStats(folderIds: string[]) {
  const [stats, setStats] = useState<FolderStatsMap>({});
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (folderIds.length === 0) {
      setStats({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch documents for all folders
      const { data, error } = await supabase
        .from("documents")
        .select("id, folder_id, file_size, status, chunk_count")
        .in("folder_id", folderIds);

      if (error) throw error;

      // Group by folder_id
      const statsMap: FolderStatsMap = {};
      
      // Initialize all folders with zero stats
      folderIds.forEach(id => {
        statsMap[id] = {
          documentCount: 0,
          chunkCount: 0,
          totalSize: 0,
          errorCount: 0,
          processingCount: 0,
          pendingCount: 0,
        };
      });

      // Calculate stats for each folder
      data?.forEach(doc => {
        if (doc.folder_id && statsMap[doc.folder_id]) {
          const folderStats = statsMap[doc.folder_id];
          folderStats.documentCount++;
          folderStats.totalSize += doc.file_size || 0;
          folderStats.chunkCount += doc.chunk_count || 0;
          
          if (doc.status === "error") {
            folderStats.errorCount++;
          } else if (doc.status === "processing") {
            folderStats.processingCount++;
          } else if (doc.status === "pending") {
            folderStats.pendingCount++;
          }
        }
      });

      setStats(statsMap);
    } catch (error) {
      console.error("Error fetching folder stats:", error);
    } finally {
      setLoading(false);
    }
  }, [folderIds.join(",")]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

export function useSingleFolderStats(folderId: string | null) {
  const [stats, setStats] = useState<FolderStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!folderId) {
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, file_size, status, chunk_count")
        .eq("folder_id", folderId);

      if (error) throw error;

      const folderStats: FolderStats = {
        documentCount: data?.length || 0,
        chunkCount: data?.reduce((sum, d) => sum + (d.chunk_count || 0), 0) || 0,
        totalSize: data?.reduce((sum, d) => sum + (d.file_size || 0), 0) || 0,
        errorCount: data?.filter(d => d.status === "error").length || 0,
        processingCount: data?.filter(d => d.status === "processing").length || 0,
        pendingCount: data?.filter(d => d.status === "pending").length || 0,
      };

      setStats(folderStats);
    } catch (error) {
      console.error("Error fetching folder stats:", error);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
