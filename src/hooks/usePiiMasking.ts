import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MaskResult {
  masked_text: string;
  tokens_count: number;
  pii_types_found: string[];
  mapping_ids: string[];
}

interface UnmaskResult {
  original_text: string;
  tokens_restored: number;
}

export function usePiiMasking() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maskText = useCallback(async (
    text: string,
    sourceType: 'chat_message' | 'document_chunk' | 'attachment' | 'document',
    sourceId: string,
    sessionId?: string
  ): Promise<MaskResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data, error: invokeError } = await supabase.functions.invoke("pii-mask", {
        body: {
          text,
          source_type: sourceType,
          source_id: sourceId,
          session_id: sessionId,
          user_id: userId,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      return data as MaskResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mask PII";
      setError(message);
      console.error("PII masking error:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unmaskText = useCallback(async (
    text: string,
    sourceId: string,
    auditAction: 'view' | 'export' | 'copy' = 'view'
  ): Promise<UnmaskResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("pii-unmask", {
        body: {
          text,
          source_id: sourceId,
          audit_action: auditAction,
        },
      });

      if (invokeError) {
        if (invokeError.message?.includes("PERMISSION_DENIED")) {
          setError("Недостаточно прав для просмотра персональных данных");
          return null;
        }
        throw invokeError;
      }

      return data as UnmaskResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unmask PII";
      setError(message);
      console.error("PII unmasking error:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    maskText,
    unmaskText,
    isLoading,
    error,
  };
}
