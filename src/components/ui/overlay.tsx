"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useApp } from "@/components/providers/Providers";
import { AgentGlyph } from "./primitives";

/** Anchored panel that closes on outside click or Escape. */
export function Popover({
  open,
  onClose,
  children,
  className,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-popover-trigger]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={clsx(
            "absolute top-[calc(100%+8px)] z-50 rounded-2xl border border-rule bg-sheet shadow-[var(--shadow-lift)]",
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Side sheet on desktop, bottom sheet on phones. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-[rgb(var(--shadow-rgb)/0.32)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-rule bg-paper shadow-[var(--shadow-lift)] md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-(--w) md:max-w-[calc(100vw-24px)] md:rounded-3xl"
            style={{ "--w": `${width}px` } as React.CSSProperties}
            initial={{ x: 0, y: 40, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
                <div className="min-w-0 flex-1">{title}</div>
                <button
                  onClick={onClose}
                  className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-paper-deep hover:text-ink"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Toaster() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-rule bg-sheet px-4 py-3 shadow-[var(--shadow-lift)]"
            role="status"
          >
            {t.agent ? (
              <AgentGlyph agent={t.agent} size={28} />
            ) : (
              <span
                className={clsx(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  t.tone === "good" ? "bg-neem" : t.tone === "warn" ? "bg-haldi" : t.tone === "bad" ? "bg-stamp" : "bg-carbon",
                )}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-ink-4 hover:text-ink" aria-label="Dismiss">
              <X size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
