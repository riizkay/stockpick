import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatSidebarConversation = {
  id: string;
  title: string | null;
};

type ChatSidebarUser = {
  fullName: string;
  email: string;
} | null;

export type ChatSidebarProps = {
  conversations: ChatSidebarConversation[];
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  isCreatingConv: boolean;
  isLoadingConvs: boolean;
  hasMoreConvs: boolean;
  isLoadingMoreConvs: boolean;
  onLoadMoreConvs: () => void;
  onRenameConversation: (id: string, title: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  user: ChatSidebarUser;
  onLogout: () => void;
};

export function ChatSidebar({
  conversations,
  selectedId,
  onSelectConversation,
  onCreateConversation,
  isCreatingConv,
  isLoadingConvs,
  hasMoreConvs,
  isLoadingMoreConvs,
  onLoadMoreConvs,
  onRenameConversation,
  onDeleteConversation,
  user,
  onLogout,
}: ChatSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const triggerWrapRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!openMenuId) return;

    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (portalMenuRef.current?.contains(t)) return;
      setOpenMenuId(null);
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenuId]);

  const applyMenuPosition = useCallback(() => {
    if (!openMenuId) return;
    const trig = triggerWrapRef.current;
    if (!trig) return;
    const r = trig.getBoundingClientRect();
    const menu = portalMenuRef.current;
    const margin = 8;
    let top = r.bottom + 4;
    let left = r.right;

    if (menu) {
      const mh = menu.offsetHeight;
      const mw = menu.offsetWidth;
      if (top + mh > window.innerHeight - margin) {
        top = Math.max(margin, r.top - mh - 4);
      }
      const leftEdge = left - mw;
      if (leftEdge < margin) left = margin + mw;
      if (left > window.innerWidth - margin) left = window.innerWidth - margin;
    }

    setMenuPos((prev) => {
      if (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5) return prev;
      return { top, left };
    });
  }, [openMenuId]);

  useLayoutEffect(() => {
    if (!openMenuId) {
      setMenuPos(null);
      return;
    }

    const r = triggerWrapRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 4, left: r.right });

    const scrollEl = menuRef.current;
    window.addEventListener("resize", applyMenuPosition);
    window.addEventListener("scroll", applyMenuPosition, { passive: true, capture: true });
    scrollEl?.addEventListener("scroll", applyMenuPosition, { passive: true });
    return () => {
      window.removeEventListener("resize", applyMenuPosition);
      window.removeEventListener("scroll", applyMenuPosition, true);
      scrollEl?.removeEventListener("scroll", applyMenuPosition);
    };
  }, [openMenuId, applyMenuPosition]);

  useLayoutEffect(() => {
    if (!openMenuId || !menuPos) return;
    applyMenuPosition();
    const id = requestAnimationFrame(() => {
      applyMenuPosition();
    });
    return () => cancelAnimationFrame(id);
  }, [openMenuId, menuPos, applyMenuPosition]);

  useEffect(() => {
    if (!editingId) return;
    const t = requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [editingId]);

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingId || renameBusy) return;
    const title = editValue.trim();
    if (!title) {
      cancelEdit();
      return;
    }

    const conv = conversations.find((c) => c.id === editingId);
    const previous = (conv?.title ?? "Percakapan baru").trim();
    if (title === previous) {
      cancelEdit();
      return;
    }

    setRenameBusy(true);
    try {
      await onRenameConversation(editingId, title);
      cancelEdit();
    } catch {
      //
    } finally {
      setRenameBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Hapus percakapan ini? Pesan di dalamnya ikut terhapus.")) {
      setOpenMenuId(null);
      return;
    }
    setOpenMenuId(null);
    if (editingId === id) cancelEdit();
    await onDeleteConversation(id);
  };

  const openConvForMenu =
    openMenuId != null ? (conversations.find((c) => c.id === openMenuId) ?? null) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-400/[0.06] px-4 pb-4 pt-5">
        <div className="mb-3.5 flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm">
            📈
          </div>
          <span className="text-[15px] font-bold tracking-tight text-slate-100">
            StockPick AI
          </span>
        </div>

        <button
          type="button"
          onClick={() => onCreateConversation()}
          disabled={isCreatingConv}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-emerald-500/20 bg-emerald-500/[0.06] py-2.5 pl-3 pr-3 text-[13px] font-semibold text-emerald-500 transition-colors hover:bg-emerald-500/[0.12] disabled:cursor-not-allowed disabled:bg-emerald-500/[0.03] disabled:text-slate-600 disabled:hover:bg-emerald-500/[0.03]"
        >
          {isCreatingConv ? (
            <>
              <span className="inline-block h-[13px] w-[13px] shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500 [animation-duration:0.7s]" />
              Membuat...
            </>
          ) : (
            <>
              <span className="text-base leading-none">+</span>
              Percakapan baru
            </>
          )}
        </button>
      </div>

      <div
        className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-2.5 py-3"
        ref={menuRef}
      >
        {isLoadingConvs ? (
          <div className="px-2 py-4 text-center text-[13px] text-slate-600">Memuat...</div>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-4 text-center text-[13px] text-slate-600">
            Belum ada percakapan
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((conv) => {
              const isSelected = selectedId === conv.id;
              const label = conv.title ?? "Percakapan baru";
              const isEditing = editingId === conv.id;

              if (isEditing) {
                return (
                  <div
                    key={conv.id}
                    className={
                      "mb-0.5 flex w-full items-center gap-1 rounded-[10px] py-1 pl-1 pr-1 " +
                      (isSelected
                        ? " bg-emerald-500/[0.08]"
                        : "border-l-2 border-l-transparent bg-slate-400/[0.06]")
                    }
                  >
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      disabled={renameBusy}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveEdit();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-400/25 bg-slate-950 px-2.5 py-1.5 text-[13px] text-slate-200 outline-none focus:border-emerald-500/45 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      disabled={renameBusy || !editValue.trim()}
                      onClick={() => void saveEdit()}
                      title="Simpan"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-emerald-600/90 text-sm text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-600/35"
                    >
                      {renameBusy ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white [animation-duration:0.7s]" />
                      ) : (
                        "✓"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={renameBusy}
                      onClick={cancelEdit}
                      title="Batal"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-slate-400/15 text-sm text-slate-400 transition-colors hover:bg-slate-400/25 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={conv.id}
                  className={
                    "mb-0.5 flex w-full items-stretch gap-0.5 transition-colors " +
                    (isSelected
                      ? "  bg-emerald-500/[0.08]"
                      : "  bg-transparent hover:bg-slate-400/[0.04]")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className={
                      "min-w-0 flex-1 cursor-pointer rounded-l-[10px] border-0 py-1 pl-3 pr-1 text-left text-[12px] outline-none transition-colors " +
                      (isSelected ? "font-medium text-slate-200" : "font-normal text-slate-500 hover:text-slate-400")
                    }
                  >
                    <div className="truncate">{label}</div>
                  </button>

                  <div
                    ref={openMenuId === conv.id ? triggerWrapRef : undefined}
                    className="relative shrink-0 py-0.5 pr-1"
                  >
                    <button
                      type="button"
                      aria-label="Aksi percakapan"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId((prev) => (prev === conv.id ? null : conv.id));
                      }}
                      className={
                        "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-slate-500 outline-none transition-colors hover:bg-slate-400/[0.08] hover:text-slate-300 " +
                        (isSelected ? "text-slate-400" : "")
                      }
                    >
                      <span className="text-md leading-none tracking-[0.2em]">⋯</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {hasMoreConvs ? (
              <div className="px-1 pt-2">
                <button
                  type="button"
                  onClick={() => onLoadMoreConvs()}
                  disabled={isLoadingMoreConvs}
                  className="w-full cursor-pointer rounded-[10px] border border-slate-400/12 bg-slate-400/[0.04] py-1 text-center text-[12px] font-medium text-slate-500 transition-colors hover:border-emerald-500/25 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingMoreConvs ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="inline-block h-2 w-3 animate-spin rounded-full border-1 border-slate-600 border-t-emerald-500 [animation-duration:0.7s]" />
                      Loading...
                    </span>
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-slate-400/[0.06] px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-900 to-blue-600 text-[13px] font-bold text-slate-200">
          {(user?.fullName ?? "U").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-400">
            {user?.fullName ?? "User"}
          </div>
          <div className="truncate text-[11px] text-slate-600">{user?.email ?? ""}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Keluar"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-400/10 bg-transparent text-sm text-slate-500 transition-colors hover:bg-red-500/[0.08] hover:text-red-500"
        >
          ↩
        </button>
      </div>

      {typeof document !== "undefined" &&
      openMenuId &&
      menuPos &&
      openConvForMenu
        ? createPortal(
            <div
              ref={portalMenuRef}
              className="fixed z-[10000] min-w-[8.5rem] rounded-lg border border-slate-400/15 bg-[#0f172a] py-0.5 shadow-lg shadow-black/40"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                transform: "translateX(-100%)",
              }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-pointer border-0 bg-transparent px-2 py-1 text-left text-[13px] text-slate-300 hover:bg-slate-400/[0.08]"
                onClick={() => {
                  setOpenMenuId(null);
                  setEditValue(openConvForMenu.title ?? "Percakapan baru");
                  setEditingId(openConvForMenu.id);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-pointer border-0 bg-transparent px-2 py-1 text-left text-[13px] text-red-400 hover:bg-red-500/[0.08]"
                onClick={() => void handleDelete(openConvForMenu.id)}
              >
                Delete
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
