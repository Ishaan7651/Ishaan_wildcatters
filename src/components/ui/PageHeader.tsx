export function PageHeader({ eyebrow, title, hindi, children, action }: { eyebrow?: string; title: string; hindi?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-7 sm:pt-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-1.5 flex items-baseline gap-3 text-[34px] leading-none font-semibold tracking-tight text-ink sm:text-[42px]">
          {title}
          {hindi && <span className="font-deva text-[22px] font-medium text-ink-4 sm:text-[26px]">{hindi}</span>}
        </h1>
        {children && <div className="mt-2.5 max-w-2xl text-[15px] text-ink-2">{children}</div>}
      </div>
      {action}
    </header>
  );
}
