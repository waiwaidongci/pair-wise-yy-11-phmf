import { useSyncExternalStore } from "react";

/**
 * 极简持久化 store：各模块（台账/规则/档案）各自持有独立的
 * localStorage 键，互不覆盖。档案模块只追加、不改写。
 */
export interface PersistentStore<T> {
  getState: () => T;
  setState: (updater: (prev: T) => T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPersistentStore<T>(key: string, initial: T): PersistentStore<T> {
  let state: T = initial;
  const listeners = new Set<() => void>();

  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) state = JSON.parse(raw) as T;
  } catch {
    // 存储不可用时退回内存态
  }

  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // 忽略写入失败
    }
  };

  return {
    getState: () => state,
    setState: (updater) => {
      state = updater(state);
      persist();
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
