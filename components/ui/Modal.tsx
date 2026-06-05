'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`panel relative w-full ${className} p-5`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {(title || description) && (
              <div className="mb-4 pr-8">
                {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
                {description && <p className="mt-1 text-sm text-ink/55">{description}</p>}
              </div>
            )}
            <button
              onClick={onClose}
              className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-lg text-ink/50 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              aria-label="Close"
            >
              <X size={17} />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
