/** Lightweight registry for browse-dialog callbacks.
 *  Generate-node components register their open-browse handler;
 *  WorkflowCanvas invokes it via the floating header Browse button. */
const callbacks = new Map<string, () => void>();

export const browseRegistry = {
  register: (id: string, cb: () => void) => { callbacks.set(id, cb); },
  unregister: (id: string) => { callbacks.delete(id); },
  open: (id: string) => { callbacks.get(id)?.(); },
};
