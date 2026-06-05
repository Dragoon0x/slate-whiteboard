import { create } from 'zustand';
import { THEME } from './constants';
import { getSetting, setSetting } from './storage';
import { useEditor } from './store';
import type { Theme } from './types';

// App-wide theme (light/dark/system), persisted independently of any board.

const LS_KEY = 'slate-theme';

function systemDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function resolve(t: Theme): 'light' | 'dark' {
  return t === 'system' ? (systemDark() ? 'dark' : 'light') : t;
}

function apply(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME[resolved].canvas);

  // Keep the "draw with" default stroke visible on the active canvas, but never
  // touch elements the user already made or a stroke they explicitly picked.
  const ed = useEditor.getState();
  const other = resolved === 'dark' ? 'light' : 'dark';
  if (ed.selectedIds.length === 0 && ed.style.strokeColor === THEME[other].defaultStroke) {
    ed.setStyleSilently({ strokeColor: THEME[resolved].defaultStroke });
  }
}

interface ThemeState {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  init: () => void;
}

let systemBound = false;

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolved: 'light',

  setTheme: (t) => {
    const resolved = resolve(t);
    set({ theme: t, resolved });
    apply(resolved);
    void setSetting('theme', t);
    try {
      localStorage.setItem(LS_KEY, t);
    } catch {
      /* storage may be unavailable */
    }
  },

  init: () => {
    if (!systemBound && typeof window !== 'undefined' && window.matchMedia) {
      systemBound = true;
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().theme === 'system') {
          const r = resolve('system');
          set({ resolved: r });
          apply(r);
        }
      });
    }
    void getSetting<Theme>('theme', 'system').then((t) => {
      const resolved = resolve(t);
      set({ theme: t, resolved });
      apply(resolved);
      try {
        localStorage.setItem(LS_KEY, t);
      } catch {
        /* ignore */
      }
    });
  },
}));
