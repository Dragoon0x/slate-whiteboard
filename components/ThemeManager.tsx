'use client';

import { useEditor } from '@/lib/store';
import { getSetting } from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import type { CanvasBgStyle } from '@/lib/types';
import { useEffect } from 'react';

// Loads persisted theme + canvas-background preferences on startup. Renders nothing.
export function ThemeManager() {
  const init = useTheme((s) => s.init);
  useEffect(() => {
    init();
    void getSetting<CanvasBgStyle>('canvasBg', 'dots').then((style) => {
      useEditor.getState().setCanvasBg(style);
    });
  }, [init]);
  return null;
}
