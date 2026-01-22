import { useEffect, useState } from "react";
import type { QueueStatusItem } from "@/features/monitoring-queue/model/types";
import { fetchQueueStatus } from "@/features/monitoring-queue/api/monitoring-queue-api";

const POLL_INTERVAL_MS = 4000;

export function useMonitoringQueue() {
  const [items, setItems] = useState<QueueStatusItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      if (!active) return;
      try {
        const payload = await fetchQueueStatus();
        if (!active) return;
        setItems(payload.items);
        setUpdatedAt(payload.updatedAt ?? null);
        setError(false);
      } catch {
        if (active) {
          setError(true);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void fetchStatus();
    const intervalId = window.setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return {
    items,
    updatedAt,
    isLoading,
    error,
  };
}
