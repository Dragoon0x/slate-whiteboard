// ─────────────────────────────────────────────────────────────────────────────
// Core data model for the whiteboard. Everything is plain serializable data so a
// board round-trips cleanly through IndexedDB and the .board export format.
// ─────────────────────────────────────────────────────────────────────────────

export type Tool =
  | 'select'
  | 'pan'
  | 'pen'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'image'
  | 'frame'
  | 'eraser';

export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'draw'
  | 'text'
  | 'sticky'
  | 'image'
  | 'frame';

export type FillStyle = 'solid' | 'transparent';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type FontFamily = 'sans' | 'serif' | 'mono';
export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 400 | 500 | 600 | 700;
export type ListStyle = 'none' | 'bullet' | 'number';

export type Theme = 'light' | 'dark' | 'system';
export type CanvasBgStyle = 'dots' | 'grid' | 'lines' | 'solid';
export interface CanvasBg {
  style: CanvasBgStyle;
}

export interface Point {
  x: number;
  y: number;
}

// Binds a connector endpoint to another element so it reroutes when that
// element moves, resizes, or rotates.
export interface PointBinding {
  elementId: string;
  gap: number; // world-unit clearance between the target border and the endpoint
  focus: number; // reserved lateral offset along the facing edge (-1..1)
}

export interface Gradient {
  stops: { color: string; at: number }[]; // `at` in 0..1, ascending
  angle: number; // degrees, 0 = left → right
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}

export interface ImageFilters {
  brightness: number; // %
  contrast: number; // %
  saturate: number; // %
  blur: number; // px
  grayscale: number; // %
  sepia: number; // %
}

export const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

export interface Element {
  id: string;
  type: ElementType;

  // Bounding box in world coordinates. For point-based elements (draw/line/arrow)
  // this is the AABB of the points; points themselves are stored relative to x,y.
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // rotation in radians, around the element center

  // Appearance
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number; // 0..100
  roundness: number; // 0..1 corner roundness factor (rectangles)

  // Point geometry (relative to x,y), used by draw/line/arrow
  points?: Point[];

  // Text-bearing elements (text, sticky, frame label)
  text?: string;
  fontSize?: number;
  fontFamily?: FontFamily;
  textAlign?: TextAlign;
  fontWeight?: FontWeight;
  italic?: boolean;
  lineHeight?: number; // multiplier; default 1.25
  letterSpacing?: number; // px (world units); default 0
  list?: ListStyle;

  // Image elements reference a blob stored in the assets table
  fileId?: string;
  filters?: ImageFilters; // image adjustments

  // Fill effects (closed shapes + frames)
  gradient?: Gradient;
  shadow?: Shadow;

  // Mirroring (vector shapes + images; text stays readable)
  flipX?: boolean;
  flipY?: boolean;

  // Connector bindings (line/arrow only)
  startBinding?: PointBinding | null;
  endBinding?: PointBinding | null;

  // Frame membership + ordering
  frameId?: string | null; // id of the containing frame, if any
  name?: string; // user label (layers panel, frame title)
  frameOrder?: number; // explicit slide order for frames

  // Organization
  groupId?: string | null;
  locked?: boolean;
  hidden?: boolean;

  // Bookkeeping
  seed: number;
  updated: number;
}

export interface Camera {
  // World coordinate shown at the top-left of the viewport, plus zoom factor.
  x: number;
  y: number;
  zoom: number;
}

export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  archived: boolean;
  thumbnail?: string; // dataURL preview for the dashboard
}

export interface BoardRecord extends BoardMeta {
  elements: Element[];
  camera: Camera;
}

export interface AssetRecord {
  id: string;
  blob: Blob;
  type: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface StyleDefaults {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  roundness: number;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  fontWeight: FontWeight;
  italic: boolean;
  lineHeight: number;
  letterSpacing: number;
  stickyColor: string;
}

export const DEFAULT_STYLE: StyleDefaults = {
  strokeColor: '#111111',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  opacity: 100,
  roundness: 1,
  fontSize: 20,
  fontFamily: 'sans',
  textAlign: 'left',
  fontWeight: 400,
  italic: false,
  lineHeight: 1.25,
  letterSpacing: 0,
  stickyColor: '#FEF3C7',
};
