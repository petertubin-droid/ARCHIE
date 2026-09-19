// =========================================================
// FRELUX ARCHIE — useSystemStatus hook
//
// Live system status from the real archie-status function.
// Extracted from StatusCenter.tsx so the component file only
// exports components (react-refresh / fast refresh).
// =========================================================

import { useCallback, useEffect, useState } from "react";
import {
  fetchSystemStatus,
  type ArchieSystemStatus,
} from "@/lib/archie/stage1-client";

export function useSystemStatus() {
  const [data, setData] = useState<ArchieSystemStatus | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isError, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchSystemStatus();
      setData(status);
      setError(status === null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { data, isLoading, isError, refresh };
}
