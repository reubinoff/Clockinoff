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

// V2-6 Quiet Pulse: minimal toast + entry-added bus. In-memory only — no
// persistence, no queue beyond the short replay buffer described below. The
// Toaster mounted in the app layout subscribes and renders; TimerBar /
// EntryList emit.
export type ToastKind = "Logged" | "Saved" | "Discarded";

export interface ToastEvent {
  id: number;
  kind: ToastKind;
}

type ToastListener = (evt: ToastEvent) => void;
const toastListeners = new Set<ToastListener>();

// V2-6b Saved-toast fix (Shaul lock): buffer recent emits at the module level
// so a Toaster that remounts inside the same interaction — e.g. because the
// edit-sheet close + router.refresh() churns the tree between emit and
// commit — can still replay them on subscribe. Each event carries a stable
// id; the Toaster dedupes by id, so real-time delivery and replay-on-mount
// resolve to the same visible toast rather than two.
const toastBuffer: ToastEvent[] = [];
const TOAST_BUFFER_TTL_MS = 1500;
let toastSeq = 0;

export function onToast(cb: ToastListener): () => void {
  toastListeners.add(cb);
  if (toastBuffer.length > 0) {
    for (const evt of toastBuffer.slice()) {
      try {
        cb(evt);
      } catch {
        // never let one bad listener break the rest
      }
    }
  }
  return () => {
    toastListeners.delete(cb);
  };
}

export function emitToast(kind: ToastKind): ToastEvent {
  toastSeq += 1;
  const evt: ToastEvent = { id: toastSeq, kind };
  toastBuffer.push(evt);
  setTimeout(() => {
    const idx = toastBuffer.findIndex((e) => e.id === evt.id);
    if (idx >= 0) toastBuffer.splice(idx, 1);
  }, TOAST_BUFFER_TTL_MS);
  for (const cb of toastListeners) {
    try {
      cb(evt);
    } catch {
      // never let one bad listener break the rest
    }
  }
  return evt;
}

export function _resetToastBufferForTests(): void {
  toastBuffer.length = 0;
  toastSeq = 0;
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
  _resetToastBufferForTests();
}
