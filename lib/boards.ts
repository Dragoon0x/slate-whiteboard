import { nanoid } from './id';
import { deleteAsset, getBoard, patchBoard, saveBoard } from './storage';
import { TEMPLATES } from './templates';
import type { BoardRecord, Element } from './types';

export async function createBoard(
  name = 'Untitled',
  elements: Element[] = [],
): Promise<BoardRecord> {
  const now = Date.now();
  const rec: BoardRecord = {
    id: nanoid(),
    name,
    elements,
    camera: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
    favorite: false,
    archived: false,
  };
  await saveBoard(rec);
  return rec;
}

export async function createFromTemplate(templateId: string): Promise<BoardRecord> {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  const elements = tpl ? tpl.build() : [];
  const name = tpl && tpl.id !== 'blank' ? tpl.name : 'Untitled';
  return createBoard(name, elements);
}

export async function duplicateBoard(id: string): Promise<BoardRecord | undefined> {
  const src = await getBoard(id);
  if (!src) return undefined;
  const now = Date.now();
  const rec: BoardRecord = {
    ...src,
    id: nanoid(),
    name: `${src.name} copy`,
    createdAt: now,
    updatedAt: now,
    favorite: false,
    // deep-ish clone of elements so edits don't alias the source
    elements: src.elements.map((e) => ({ ...e, points: e.points?.map((p) => ({ ...p })) })),
  };
  await saveBoard(rec);
  return rec;
}

export function renameBoard(id: string, name: string) {
  return patchBoard(id, { name });
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const b = await getBoard(id);
  if (!b) return false;
  const fav = !b.favorite;
  await patchBoard(id, { favorite: fav });
  return fav;
}

export function setArchived(id: string, archived: boolean) {
  return patchBoard(id, { archived });
}

// Remove a board and any image assets that only it referenced.
export async function removeBoard(id: string): Promise<void> {
  const b = await getBoard(id);
  if (b) {
    for (const el of b.elements) {
      if (el.type === 'image' && el.fileId) {
        await deleteAsset(el.fileId).catch(() => undefined);
      }
    }
  }
  const { deleteBoard } = await import('./storage');
  await deleteBoard(id);
}
