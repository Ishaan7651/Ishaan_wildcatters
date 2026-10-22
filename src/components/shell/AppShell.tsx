"use client";

import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { Toaster } from "@/components/ui/overlay";
import { SlipDrawer } from "@/components/slip/SlipDrawer";
import { Composer } from "@/components/slip/Composer";
import { Sheet } from "@/components/ui/overlay";
import { Spotlight } from "@/components/bolo/Spotlight";
import { TopBar } from "./TopBar";
import { MobileNav, Rail } from "./Nav";
import { Diary } from "./Diary";
import { CrewDock } from "./CrewDock";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { diaryOpen, setDiaryOpen } = useApp();
  // The Agents page shows the full diary itself.
  const dock = usePathname() !== "/agents";
  return (
    <div className="relative z-[1] min-h-dvh">
      <TopBar />
      <div className="mx-auto flex max-w-[1560px]">
        <Rail />
        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-24 lg:px-10">{children}</main>
      </div>
      <MobileNav />
      {dock && <CrewDock />}
      <Spotlight />
      <SlipDrawer />
      <Composer />
      <Sheet open={diaryOpen} onClose={() => setDiaryOpen(false)} width={460} title={<DiaryTitle />}>
        <Diary embedded />
      </Sheet>
      <Toaster />
    </div>
  );
}

function DiaryTitle() {
  return (
    <div className="display flex items-baseline gap-2 text-[18px] font-bold">
      Activity log
    </div>
  );
}
