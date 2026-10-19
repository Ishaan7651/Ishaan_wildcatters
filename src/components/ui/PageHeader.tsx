export function PageHeader({ eyebrow, title, hindi, children, action }: { eyebrow?: string; title: string; hindi?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-8 sm:pt-2">
      <div className="min-w-0">
        {eyebrow && <p className="text-[13px] font-medium text-ink-3">{eyebrow}</p>}
        <h1 className="display-wide mt-1 flex items-baseline gap-3 text-[34px] leading-none text-ink sm:text-[44px]">
          {title}
          {hindi && <span className="font-deva text-[20px] font-medium tracking-normal text-ink-4 sm:text-[24px]">{hindi}</span>}
        </h1>
        {children && <div className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {action}
    </header>
  );
}
