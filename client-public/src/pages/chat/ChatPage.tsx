import { useCallback, useEffect, useState } from "react";
import ChatLayout from "../../modules/layouts/ChatLayout";
import { useAuth } from "../../modules/context/AuthContext";
import { ChatSidebar } from "./components/ChatSidebar";
import { useConversations } from "./hooks/useConversations";
import { ChatAgentEngine, type InternalTool } from "../../components/chat-agent-engine";
import { API_BASE } from "../../modules/common/api";

const SUGGESTED_QUESTIONS = [
  "Analisis saham BBCA saat ini",
  "Rekomendasikan saham blue chip IDX",
  "Bandingkan TLKM vs EXCL",
  "Saham dengan P/E ratio rendah",
];

// contoh internal tool prototype — nanti bisa dipanggil dari client saat
// backend support client-side tool execution. sekarang hanya registered.
const INTERNAL_TOOLS: InternalTool[] = [
  {
    name: "get_local_watchlist",
    description: "Ambil watchlist saham user yang tersimpan di localStorage",
    parameters: {},
    execute: () => {
      try {
        const raw = localStorage.getItem("stockpick:watchlist");
        return raw ?? JSON.stringify(["DILD", "UNVR","PWON","CTRA","BSDE","SMRA"]);
      } catch {
        return "[]";
      }
    },
  },
];

// contoh mcp.json — desktop only. di browser akan di-blokir + error banner.
// kosongkan kalau tidak mau pakai external mcp.
const EXTERNAL_MCP_CONFIG = "";

export default function ChatPage() {
  const { user, logout } = useAuth();
  const [pageError, setPageError] = useState<string | null>(null);

  const {
    conversations,
    setConversations,
    selectedId,
    setSelectedId,
    isLoadingConvs,
    isCreatingConv,
    convsNextCursor,
    isLoadingMoreConvs,
    errorMsg,
    setErrorMsg,
    loadMoreConversations,
    createNewConversation,
    renameConversation,
    deleteConversation,
  } = useConversations();

  // auto-dismiss error setelah 5 detik
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(t);
  }, [errorMsg, setErrorMsg]);

  useEffect(() => {
    if (!pageError) return;
    const t = setTimeout(() => setPageError(null), 5000);
    return () => clearTimeout(t);
  }, [pageError]);

  const handleCreateConversation = useCallback(() => {
    void createNewConversation();
  }, [createNewConversation]);

  const handleLoadMoreConvs = useCallback(() => {
    void loadMoreConversations();
  }, [loadMoreConversations]);

  const handleConversationPatch = useCallback(
    ({ id, title }: { id: string; title?: string }) => {
      if (title == null) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === id && !c.title ? { ...c, title: title.slice(0, 50) } : c))
      );
    },
    [setConversations]
  );

  const sidebar = (
    <ChatSidebar
      conversations={conversations}
      selectedId={selectedId}
      onSelectConversation={setSelectedId}
      onCreateConversation={handleCreateConversation}
      isCreatingConv={isCreatingConv}
      isLoadingConvs={isLoadingConvs}
      hasMoreConvs={Boolean(convsNextCursor)}
      isLoadingMoreConvs={isLoadingMoreConvs}
      onLoadMoreConvs={handleLoadMoreConvs}
      onRenameConversation={renameConversation}
      onDeleteConversation={deleteConversation}
      user={user}
      onLogout={logout}
    />
  );

  const combinedError = errorMsg || pageError;

  return (
    <ChatLayout sidebar={sidebar}>
      {combinedError ? (
        <div className="mx-7 mt-3 flex shrink-0 items-center justify-between gap-2 rounded-[10px] border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-[13px] text-red-400">
          <span>{combinedError}</span>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setPageError(null);
            }}
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-lg leading-none text-red-400"
          >
            ×
          </button>
        </div>
      ) : null}

      <ChatAgentEngine
        baseUrl={API_BASE}
        conversationId={selectedId}
        onCreateConversation={createNewConversation}
        onConversationPatch={handleConversationPatch}
        onError={setPageError}
        isCreatingConversation={isCreatingConv}
        temperature={0.7}
        contextOverflow="rolling"
        debugMode={false}
        internalTools={INTERNAL_TOOLS}
        externalMcpConfig={EXTERNAL_MCP_CONFIG}
        title="StockPick AI — Asisten Analisis Saham"
        placeholder="Tanya tentang saham, sektor, portofolio, atau analisis pasar IDX..."
        suggestedQuestions={SUGGESTED_QUESTIONS}
        emptyStateTitle="Apa yang ingin kamu analisis?"
        emptyStateSubtitle="Tanya tentang saham, sektor, atau portofolio"
        emptyStateIcon="💹"
        welcomeIcon="📈"
        welcomeTitle="Mulai analisis saham"
        welcomeSubtitle="Buat percakapan baru dan tanya tentang saham IDX."
        startButtonLabel="Mulai Percakapan"
      />
    </ChatLayout>
  );
}
