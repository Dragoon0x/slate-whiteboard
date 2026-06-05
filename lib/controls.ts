import { create } from 'zustand';
import type { Point } from './types';

// Imperative viewport/canvas actions registered by the Canvas component so that
// the toolbar, command palette and shortcuts can drive the view without props.
export interface Controls {
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoom: number) => void;
  resetView: () => void;
  fitToContent: () => void;
  zoomToSelection: () => void;
  addImageFiles: (files: File[] | FileList) => void;
  pickImage: () => void;
  centerOn: (world: Point) => void;
}

export const useControls = create<Partial<Controls>>(() => ({}));

export function registerControls(c: Partial<Controls>) {
  useControls.setState(c);
}
