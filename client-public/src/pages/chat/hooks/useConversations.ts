import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../modules/common/api";
import type { Conversation } from "../types";

const CONVS_PAGE_LIMIT = 30;

type ConversationListResponse = {
  items: Conversation[];
  nextCursor: string | null;
};

export type UseConversationsReturn = {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedIdRef: React.MutableRefObject<string | null>;
  isLoadingConvs: boolean;
  convsNextCursor: string | null;
  isLoadingMoreConvs: boolean;
  isCreatingConv: boolean;
  errorMsg: string | null;
  setErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;
  loadMoreConversations: () => Promise<void>;
  createNewConversation: () => Promise<string | null>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
};

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [convsNextCursor, setConvsNextCursor] = useState<string | null>(null);
  const [isLoadingMoreConvs, setIsLoadingMoreConvs] = useState(false);
  const [isCreatingConv, setIsCreatingConv] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    (async () => {
      setIsLoadingConvs(true);
      try {
        const data = await apiRequest<ConversationListResponse>(
          `/api/auth/chat/conversations?limit=${CONVS_PAGE_LIMIT}`
        );
        const list = data?.items ?? [];
        setConversations(list);
        setConvsNextCursor(data?.nextCursor ?? null);
        if (list.length > 0 && list[0]) {
          setSelectedId(list[0].id);
        }
      } catch {
        setErrorMsg("Gagal memuat percakapan. Coba refresh.");
      } finally {
        setIsLoadingConvs(false);
      }
    })();
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (!convsNextCursor || isLoadingMoreConvs) return;
    setIsLoadingMoreConvs(true);
    try {
      const q = new URLSearchParams({
        limit: String(CONVS_PAGE_LIMIT),
        cursor: convsNextCursor,
      });
      const data = await apiRequest<ConversationListResponse>(
        `/api/auth/chat/conversations?${q.toString()}`
      );
      setConversations((prev) => [...prev, ...(data?.items ?? [])]);
      setConvsNextCursor(data?.nextCursor ?? null);
    } catch {
      setErrorMsg("Gagal memuat percakapan tambahan.");
    } finally {
      setIsLoadingMoreConvs(false);
    }
  }, [convsNextCursor, isLoadingMoreConvs]);

  const createNewConversation = useCallback(async (): Promise<string | null> => {
    if (isCreatingConv) return null;
    setIsCreatingConv(true);
    try {
      const data = await apiRequest<Conversation>("/api/auth/chat/conversations", {
        method: "POST",
      });
      setConversations((prev) => [data, ...prev]);
      setSelectedId(data.id);
      return data.id;
    } catch {
      setErrorMsg("Gagal membuat percakapan baru.");
      return null;
    } finally {
      setIsCreatingConv(false);
    }
  }, [isCreatingConv]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      const updated = await apiRequest<Conversation>(`/api/auth/chat/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch {
      setErrorMsg("Gagal mengubah nama percakapan.");
      throw new Error("rename failed");
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await apiRequest<null>(`/api/auth/chat/conversations/${id}`, { method: "DELETE" });
    } catch {
      setErrorMsg("Gagal menghapus percakapan.");
      return;
    }
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      // update selectedId di dalam updater agar dapat nilai next yang sudah pasti
      setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
  }, []);

  return {
    conversations,
    setConversations,
    selectedId,
    setSelectedId,
    selectedIdRef,
    isLoadingConvs,
    convsNextCursor,
    isLoadingMoreConvs,
    isCreatingConv,
    errorMsg,
    setErrorMsg,
    loadMoreConversations,
    createNewConversation,
    renameConversation,
    deleteConversation,
  };
}
