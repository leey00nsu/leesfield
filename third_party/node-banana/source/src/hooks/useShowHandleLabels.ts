import { useConnection } from "@xyflow/react";

export function useShowHandleLabels(selected: boolean | undefined): boolean {
  const isConnecting = useConnection((c) => c.inProgress);
  return !!selected || isConnecting;
}
