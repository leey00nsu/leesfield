import type { QueueTransaction } from "./job-queue-transaction";

const changed = new WeakSet<object>();
type WakeGlobal = typeof globalThis & { __leesfieldQueueWake?: () => void };
export function markQueueWorkTx(tx: QueueTransaction) { changed.add(tx); }
export function setQueueWakeup(callback: () => void) { (globalThis as WakeGlobal).__leesfieldQueueWake = callback; }
export function notifyQueueCommit(tx: QueueTransaction) {
  if (!changed.delete(tx)) return;
  queueMicrotask(() => (globalThis as WakeGlobal).__leesfieldQueueWake?.());
}
