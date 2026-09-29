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

export function _resetProjectsChangedListenersForTests(): void {
  projectsChangedListeners.clear();
}
