import { getAsset } from '@/lib/storage';

// Module-level cache of decoded images keyed by asset id, so the renderer can
// resolve image elements synchronously each frame.
const cache = new Map<string, HTMLImageElement>();
const loading = new Set<string>();

export function getCachedImage(fileId: string): HTMLImageElement | undefined {
  return cache.get(fileId);
}

// Eagerly load any image assets referenced by the elements but not yet cached.
export function ensureImages(
  elements: { type: string; fileId?: string }[],
  onLoad: () => void,
) {
  for (const el of elements) {
    if (el.type !== 'image' || !el.fileId) continue;
    const id = el.fileId;
    if (cache.has(id) || loading.has(id)) continue;
    loading.add(id);
    getAsset(id)
      .then((asset) => {
        if (!asset) {
          loading.delete(id);
          return;
        }
        const url = URL.createObjectURL(asset.blob);
        const img = new Image();
        img.onload = () => {
          cache.set(id, img);
          loading.delete(id);
          URL.revokeObjectURL(url);
          onLoad();
        };
        img.onerror = () => {
          loading.delete(id);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      })
      .catch(() => loading.delete(id));
  }
}

// Cache an image immediately (e.g. right after paste/drop) from a known blob.
export function cacheImage(fileId: string, blob: Blob, onLoad?: () => void) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    cache.set(fileId, img);
    URL.revokeObjectURL(url);
    onLoad?.();
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
