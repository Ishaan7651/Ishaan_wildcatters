"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useApp } from "@/components/providers/Providers";
import { Toaster } from "@/components/ui/overlay";
import { SlipDrawer } from "@/components/slip/SlipDrawer";
import { Composer } from "@/components/slip/Composer";
import { Sheet } from "@/components/ui/overlay";
import { TopBar } from "./TopBar";
import { MobileNav, Rail } from "./Nav";
import { Diary } from "./Diary";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { diaryOpen, setDiaryOpen } = useApp();
  // The Agents page shows the full diary itself.
  const sideDiary = usePathname() !== "/agents";
  return (
    <div className="relative z-[1] min-h-dvh">
      <TopBar />
      <div className="mx-auto flex max-w-[1680px]">
        <Rail />
        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-14 lg:px-10">{children}</main>
        <aside className={clsx("sticky top-[61px] hidden h-[calc(100dvh-61px)] w-[340px] shrink-0 border-l border-rule", sideDiary && "min-[1360px]:block")}>
          <Diary />
        </aside>
      </div>
      <MobileNav />
      <SlipDrawer />
      <Composer />
      <Sheet open={diaryOpen} onClose={() => setDiaryOpen(false)} width={440} title={<DiaryTitle />}>
        <Diary embedded />
      </Sheet>
      <Toaster />
    </div>
  );
}

function DiaryTitle() {
  return (
    <div>
      <div className="display text-[17px] font-semibold">Roznamcha</div>
      <div className="text-[12px] text-ink-3">What the agents did, as it happens</div>
    </div>
  );
}
