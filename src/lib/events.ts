type Listener = () => void;

const projectsChangedListeners = new Set<Listener>();

export function onProjectsChanged(cb: Listener): () => void {
  projectsChangedListeners.add(cb);
  return () => {
    projectsChangedListeners.delete(cb);
  };
}

export function emitProjectsChanged(): void {
  for (const cb of projectsChangedListeners) {
    try {
      cb();
    } catch {
      // Never let one bad listener break the rest.
    }
  }
}

// V2-6 Quiet Pulse: minimal toast + entry-added bus. Deliberately in-memory
// only — no persistence, no queue, no dedupe. The Toaster mounted in the app
// layout subscribes and renders; TimerBar / EntryList emit.
export type ToastKind = "Logged" | "Saved" | "Discarded";

type ToastListener = (kind: ToastKind) => void;
const toastListeners = new Set<ToastListener>();

export function onToast(cb: ToastListener): () => void {
  toastListeners.add(cb);
  return () => {
    toastListeners.delete(cb);
  };
}

export function emitToast(kind: ToastKind): void {
  for (const cb of toastListeners) {
    try {
      cb(kind);
    } catch {
      // never let one bad listener break the rest
    }
  }
}

type EntryAddedListener<T> = (entry: T) => void;
const entryAddedListeners = new Set<EntryAddedListener<unknown>>();

export function onEntryAdded<T = unknown>(cb: EntryAddedListener<T>): () => void {
  const wrapped = cb as EntryAddedListener<unknown>;
  entryAddedListeners.add(wrapped);
  return () => {
    entryAddedListeners.delete(wrapped);
  };
}

export function emitEntryAdded<T = unknown>(entry: T): void {
  for (const cb of entryAddedListeners) {
    try {
      cb(entry);
    } catch {
      // never let one bad listener break the rest
    }
  }
}

export function _resetProjectsChangedListenersForTests(): void {
  projectsChangedListeners.clear();
  toastListeners.clear();
  entryAddedListeners.clear();
}
