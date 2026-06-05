import { DEFAULT_STICKY_SIZE, DEFAULT_TEXT_WIDTH } from './constants';
import { makeSeed, nanoid } from './id';
import type { Element, ElementType, Point, StyleDefaults } from './types';

// Build the shared, style-derived fields for any new element.
function base(style: StyleDefaults): Omit<Element, 'id' | 'type' | 'x' | 'y' | 'width' | 'height'> {
  return {
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    opacity: style.opacity,
    roundness: style.roundness,
    groupId: null,
    locked: false,
    hidden: false,
    seed: makeSeed(),
    updated: Date.now(),
  };
}

export function createShape(
  type: Extract<ElementType, 'rectangle' | 'ellipse' | 'diamond' | 'triangle'>,
  x: number,
  y: number,
  width: number,
  height: number,
  style: StyleDefaults,
): Element {
  return { id: nanoid(), type, x, y, width, height, ...base(style) };
}

export function createLinear(
  type: 'line' | 'arrow',
  start: Point,
  end: Point,
  style: StyleDefaults,
): Element {
  return {
    id: nanoid(),
    type,
    x: start.x,
    y: start.y,
    width: Math.abs(end.x - start.x) || 1,
    height: Math.abs(end.y - start.y) || 1,
    points: [
      { x: 0, y: 0 },
      { x: end.x - start.x, y: end.y - start.y },
    ],
    ...base(style),
  };
}

export function createDraw(origin: Point, style: StyleDefaults): Element {
  return {
    id: nanoid(),
    type: 'draw',
    x: origin.x,
    y: origin.y,
    width: 1,
    height: 1,
    points: [{ x: 0, y: 0 }],
    ...base(style),
  };
}

export function createText(x: number, y: number, style: StyleDefaults): Element {
  return {
    id: nanoid(),
    type: 'text',
    x,
    y,
    width: DEFAULT_TEXT_WIDTH,
    height: style.fontSize * 1.25,
    text: '',
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
    fontWeight: style.fontWeight,
    italic: style.italic,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    ...base(style),
    backgroundColor: 'transparent',
  };
}

export function createSticky(x: number, y: number, style: StyleDefaults): Element {
  return {
    id: nanoid(),
    type: 'sticky',
    x,
    y,
    width: DEFAULT_STICKY_SIZE,
    height: DEFAULT_STICKY_SIZE,
    text: '',
    fontSize: 18,
    fontFamily: style.fontFamily,
    textAlign: 'left',
    fontWeight: style.fontWeight,
    italic: style.italic,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    ...base(style),
    backgroundColor: style.stickyColor,
    strokeColor: 'transparent',
    fillStyle: 'solid',
  };
}

export function createImage(
  x: number,
  y: number,
  width: number,
  height: number,
  fileId: string,
  style: StyleDefaults,
): Element {
  return {
    id: nanoid(),
    type: 'image',
    x,
    y,
    width,
    height,
    fileId,
    ...base(style),
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
  };
}
