type ChatLayoutProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export default function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  return (
    <div className="grid h-dvh min-h-0 w-full grid-cols-[280px_1fr] bg-[#020617]">
      <aside className="sticky top-0 z-10 flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden border-r border-slate-400/10 bg-[#080e1c]">
        {sidebar}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
