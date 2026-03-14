import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RoleProviderInfo {
  providerName: string;
  model: string;
}

async function fetchRoleProviderLabels(): Promise<Map<string, RoleProviderInfo>> {
  // Fetch roles with model_config
  const { data: roles, error: rolesError } = await supabase
    .from("chat_roles")
    .select("id, model_config")
    .eq("is_active", true);

  if (rolesError) throw rolesError;

  // Collect unique provider IDs
  const providerIds = new Set<string>();
  const roleConfigs = new Map<string, { provider_id: string; model: string }>();

  (roles || []).forEach((role) => {
    const config = role.model_config as { provider_id?: string; model?: string } | null;
    if (config?.provider_id) {
      providerIds.add(config.provider_id);
      roleConfigs.set(role.id, {
        provider_id: config.provider_id,
        model: config.model || "",
      });
    }
  });

  if (providerIds.size === 0) return new Map();

  // Fetch provider names
  const { data: providers, error: provError } = await supabase
    .from("safe_ai_providers")
    .select("id, name, provider_type")
    .in("id", Array.from(providerIds));

  if (provError) throw provError;

  const providerMap = new Map<string, string>();
  (providers || []).forEach((p) => {
    providerMap.set(p.id!, p.name || p.provider_type || "AI");
  });

  // Build result
  const result = new Map<string, RoleProviderInfo>();
  roleConfigs.forEach(({ provider_id, model }, roleId) => {
    const providerName = providerMap.get(provider_id) || "AI";
    result.set(roleId, { providerName, model });
  });

  return result;
}

export function useRoleProviderLabels() {
  return useQuery({
    queryKey: ["role-provider-labels"],
    queryFn: fetchRoleProviderLabels,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
