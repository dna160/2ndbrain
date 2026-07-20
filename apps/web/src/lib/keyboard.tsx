'use client';
/**
 * Global keyboard model (docs/02 §4). Handles ⌘K, two-key `g <view>` navigation, and `/`
 * search focus; pages register scoped keys (j/k/enter/[ ]/c/x/e) via useKeyMap.
 */
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

type Handler = (e: KeyboardEvent) => void;

interface KeyboardApi {
  register: (map: Record<string, Handler>) => () => void;
  onPalette: (fn: () => void) => void;
}

const KeyboardCtx = createContext<KeyboardApi | null>(null);

const GOTO: Record<string, string> = {
  t: '/today',
  c: '/conversations',
  u: '/upcoming',
  a: '/actions',
  m: '/meetings',
  d: '/digests',
  y: '/memory',
  p: '/pipeline',
};

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable;
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const maps = useRef(new Set<Record<string, Handler>>());
  const paletteFn = useRef<(() => void) | null>(null);
  const pendingG = useRef(0);

  const register = useCallback((map: Record<string, Handler>) => {
    maps.current.add(map);
    return () => {
      maps.current.delete(map);
    };
  }, []);

  const onPalette = useCallback((fn: () => void) => {
    paletteFn.current = fn;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        paletteFn.current?.();
        return;
      }
      if (isEditable(e.target)) return;

      const now = Date.now();
      if (e.key === 'g') {
        pendingG.current = now;
        return;
      }
      if (now - pendingG.current < 800 && GOTO[e.key]) {
        pendingG.current = 0;
        router.push(GOTO[e.key]!);
        return;
      }
      pendingG.current = 0;

      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>('input[data-search]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }

      for (const map of maps.current) {
        const fn = map[e.key];
        if (fn) {
          fn(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  return <KeyboardCtx.Provider value={{ register, onPalette }}>{children}</KeyboardCtx.Provider>;
}

export function useKeyboard(): KeyboardApi {
  const ctx = useContext(KeyboardCtx);
  if (!ctx) throw new Error('useKeyboard outside KeyboardProvider');
  return ctx;
}

/** Register scoped key handlers for the lifetime of a component. */
export function useKeyMap(map: Record<string, Handler>, deps: unknown[] = []): void {
  const { register } = useKeyboard();
  useEffect(() => register(map), [register, ...deps]);
}
