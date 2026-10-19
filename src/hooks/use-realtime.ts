import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Subscribes to live changes and refreshes the given query keys. */
export function useRealtime(tables: ("videos" | "clip_candidates" | "clips")[], keys: string[][], filter?: string) {
  const qc = useQueryClient();
  const sig = tables.join(",") + (filter ?? "");
  useEffect(() => {
    const ch = supabase.channel(`rt-${sig}-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, ...(filter ? { filter } : {}) }, () => {
        for (const k of keys) void qc.invalidateQueries({ queryKey: k });
      });
    }
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
