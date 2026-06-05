'use client';

import { Modal } from '@/components/ui/Modal';
import {
  exportAllFrames,
  exportBoardFile,
  exportFrame,
  exportHTML,
  exportJPG,
  exportPDF,
  exportPNG,
  exportSVG,
  frameChildren,
  importBoardFile,
  renderToCanvas,
  type FrameFormat,
} from '@/lib/export';
import { useEditor } from '@/lib/store';
import {
  FileCode2,
  FileImage,
  FileJson,
  FileType2,
  Clipboard,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';

const FORMATS = [
  { id: 'png', label: 'PNG', desc: 'Transparent raster', icon: <FileImage size={20} /> },
  { id: 'jpg', label: 'JPG', desc: 'Flat white background', icon: <FileImage size={20} /> },
  { id: 'svg', label: 'SVG', desc: 'Scalable vector', icon: <FileType2 size={20} /> },
  { id: 'pdf', label: 'PDF', desc: 'Single page', icon: <FileType2 size={20} /> },
  { id: 'board', label: '.board', desc: 'Re-importable file', icon: <FileJson size={20} /> },
  { id: 'html', label: 'HTML', desc: 'Open anywhere', icon: <FileCode2 size={20} /> },
] as const;

export function ExportModal({
  open,
  onClose,
  onOpenBoard,
}: {
  open: boolean;
  onClose: () => void;
  onOpenBoard: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [scope, setScope] = useState<'board' | 'frame' | 'all'>('board');
  const [copied, setCopied] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const elements = useEditor((st) => st.elements);
  const selectedIds = useEditor((st) => st.selectedIds);
  const frameList = elements.filter((e) => e.type === 'frame');
  const selectedFrame =
    elements.find((e) => e.type === 'frame' && selectedIds.includes(e.id)) ?? frameList[0] ?? null;

  const s = useEditor.getState;

  const getElements = () => {
    const st = s();
    if (scope === 'frame' && selectedFrame) return frameChildren(selectedFrame, st.elements);
    if (selectionOnly && st.selectedIds.length) {
      const set = new Set(st.selectedIds);
      return st.elements.filter((e) => set.has(e.id));
    }
    return st.elements;
  };

  const run = async (id: string) => {
    const name = s().boardName || 'board';
    setBusy(id);
    try {
      const isCanvasFmt = id === 'png' || id === 'jpg' || id === 'svg' || id === 'pdf';
      if (isCanvasFmt && scope === 'all' && frameList.length) {
        await exportAllFrames(s().elements, id as FrameFormat);
        return;
      }
      if (isCanvasFmt && scope === 'frame' && selectedFrame) {
        await exportFrame(selectedFrame, s().elements, id as FrameFormat);
        return;
      }
      const els = getElements();
      if (els.length === 0) return;
      if (id === 'png') await exportPNG(els, name);
      else if (id === 'jpg') await exportJPG(els, name);
      else if (id === 'svg') await exportSVG(els, name);
      else if (id === 'pdf') await exportPDF(els, name);
      else if (id === 'html') await exportHTML(els, name);
      else if (id === 'board') await exportBoardFile(name, els, s().camera);
    } finally {
      setBusy(null);
    }
  };

  const copyToClipboard = async () => {
    const els = getElements();
    if (!els.length) return;
    setBusy('copy');
    try {
      const canvas = await renderToCanvas(els, { background: '#ffffff' });
      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob && 'clipboard' in navigator && 'ClipboardItem' in window) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard image may be blocked */
            }
          }
          resolve();
        }, 'image/png');
      });
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (file: File) => {
    setBusy('import');
    try {
      const id = await importBoardFile(file);
      onClose();
      onOpenBoard(id);
    } catch {
      alert('Could not import that file. Make sure it is a Slate .board file.');
    } finally {
      setBusy(null);
    }
  };

  const selCount = s().selectedIds.length;

  return (
    <Modal open={open} onClose={onClose} title="Export & Share" description="Everything is generated locally on your device." className="max-w-md">
      {selCount > 0 && (
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-ink/70 dark:bg-white/[0.05]">
          <input
            type="checkbox"
            checked={selectionOnly}
            onChange={(e) => setSelectionOnly(e.target.checked)}
            className="accent-accent"
          />
          Export selection only ({selCount})
        </label>
      )}

      {frameList.length > 0 && (
        <div className="mb-3 flex gap-1 rounded-lg bg-black/[0.04] p-0.5 text-sm dark:bg-white/[0.06]">
          {(
            [
              ['board', 'Whole board'],
              ['frame', 'This frame'],
              ['all', `All frames (${frameList.length})`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setScope(v)}
              className={`h-8 flex-1 rounded-md transition-all ${
                scope === v ? 'bg-white text-ink shadow-soft dark:bg-white/10' : 'text-ink/55 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            disabled={busy !== null}
            onClick={() => run(f.id)}
            className="flex flex-col items-start gap-1 rounded-xl border border-black/[0.07] bg-white p-3 text-left transition-all hover:border-accent/40 hover:shadow-soft disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <span className="text-accent">{f.icon}</span>
            <span className="mt-1 text-sm font-semibold text-ink">{busy === f.id ? 'Exporting…' : f.label}</span>
            <span className="text-[11px] text-ink/45">{f.desc}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn flex-1 border border-black/[0.07] dark:border-white/10" onClick={copyToClipboard} disabled={busy !== null}>
          <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy image'}
        </button>
        <button className="btn flex-1 border border-black/[0.07] dark:border-white/10" onClick={() => importRef.current?.click()} disabled={busy !== null}>
          <Upload size={16} /> Import .board
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".board,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
      </div>
    </Modal>
  );
}
