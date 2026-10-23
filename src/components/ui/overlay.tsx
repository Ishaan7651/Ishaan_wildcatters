"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp, type Toast } from "@/components/providers/Providers";
import { AgentGlyph } from "./primitives";

/**
 * Anchored panel that closes on outside click or Escape. Below md it is pinned
 * under the top bar at the right edge of the screen instead, since a 380px panel
 * hung off a button in the middle of a narrow bar would run off the left edge.
 */
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
  const { dismissAlerts } = useApp();
  // Alerts share the strip under the top bar on phones; opening a panel clears them so they don't cover it.
  useEffect(() => {
    if (open) dismissAlerts();
  }, [open, dismissAlerts]);
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
            "max-md:fixed max-md:inset-x-3 max-md:top-[72px] max-md:ml-auto max-md:w-auto max-md:max-w-[400px] max-md:origin-top-right",
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
  const { toasts } = useApp();
  return (
    <>
      {/* Notification pop-ups: top-right on desktop, top on phones. */}
      <div className="pointer-events-none fixed inset-x-0 top-[72px] z-[70] flex flex-col items-center gap-2 px-3 md:inset-x-auto md:right-5 md:items-end">
        <AnimatePresence initial={false}>
          {toasts.filter((t) => t.alert).map((t) => (
            <ToastCard key={t.id} t={t} alert />
          ))}
        </AnimatePresence>
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6">
        <AnimatePresence initial={false}>
          {toasts.filter((t) => !t.alert).map((t) => (
            <ToastCard key={t.id} t={t} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

const TONE_BAR = { default: "bg-mor", good: "bg-neem", warn: "bg-genda", bad: "bg-stamp" } as const;

function ToastCard({ t, alert }: { t: Toast; alert?: boolean }) {
  const { dismissToast, openSlip } = useApp();
  const router = useRouter();
  const tone = t.tone ?? "default";
  return (
    <motion.div
      layout
      initial={alert ? { opacity: 0, x: 60, scale: 0.94 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={alert ? { opacity: 1, x: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={alert ? { opacity: 0, x: 40, scale: 0.96 } : { opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={clsx(
        "pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border bg-sheet py-3 pr-3 shadow-[var(--shadow-lift)]",
        alert ? "max-w-[400px] border-rule-2 pl-5" : "max-w-md border-rule pl-4",
      )}
      role={alert ? "alert" : "status"}
    >
      {alert && <span className={clsx("absolute inset-y-0 left-0 w-1.5", TONE_BAR[tone])} aria-hidden />}
      {t.agent ? (
        <AgentGlyph agent={t.agent} size={alert ? 34 : 28} />
      ) : (
        <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", TONE_BAR[tone])} />
      )}
      <div className="min-w-0 flex-1">
        <p className={clsx("font-semibold text-ink", alert ? "text-[14.5px]" : "text-[14px]")}>{t.title}</p>
        {t.body && <p className="mt-0.5 line-clamp-3 text-[13px] text-ink-2">{t.body}</p>}
        {t.action && (
          <button
            onClick={() => {
              if (t.action?.slipId) openSlip(t.action.slipId);
              else if (t.action?.href) router.push(t.action.href);
              dismissToast(t.id);
            }}
            className={clsx(
              "mt-2 rounded-full px-3.5 py-1 text-[12.5px] font-bold transition-transform hover:scale-105",
              tone === "bad" ? "bg-stamp text-white" : tone === "good" ? "bg-neem text-white" : "bg-genda text-on-genda",
            )}
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button onClick={() => dismissToast(t.id)} className="text-ink-4 hover:text-ink" aria-label="Dismiss">
        <X size={15} />
      </button>
    </motion.div>
  );
}
