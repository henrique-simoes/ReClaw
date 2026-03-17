"use client";

import { create } from "zustand";
import type { ChatMessage } from "@/lib/types";
import { chat as chatApi, sessions as sessionsApi } from "@/lib/api";

interface ChatStore {
  messages: ChatMessage[];
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  abortController: AbortController | null;

  fetchHistory: (projectId: string, sessionId?: string) => Promise<void>;
  sendMessage: (projectId: string, content: string, sessionId?: string) => Promise<void>;
  cancelStreaming: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  streaming: false,
  streamingContent: "",
  error: null,
  abortController: null,

  fetchHistory: async (projectId, sessionId) => {
    try {
      if (sessionId) {
        // Fetch session-scoped messages
        const detail = await sessionsApi.get(sessionId);
        const msgs: ChatMessage[] = (detail.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          agent_id: m.agent_id,
        }));
        set({ messages: msgs, error: null });
      } else {
        const history = await chatApi.history(projectId);
        set({ messages: history, error: null });
      }
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  sendMessage: async (projectId, content, sessionId) => {
    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      streaming: true,
      streamingContent: "",
      error: null,
    }));

    try {
      let fullContent = "";
      let messageId = "";
      let sources: any[] = [];

      for await (const event of chatApi.send(projectId, content, sessionId)) {
        if (event.type === "chunk") {
          fullContent += event.content;
          set({ streamingContent: fullContent });
        } else if (event.type === "done") {
          messageId = event.message_id;
          sources = event.sources || [];
        } else if (event.type === "error") {
          set({ error: event.message, streaming: false });
          return;
        }
      }

      // Add completed assistant message
      const assistantMsg: ChatMessage = {
        id: messageId || `msg-${Date.now()}`,
        role: "assistant",
        content: fullContent,
        created_at: new Date().toISOString(),
        sources,
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        streaming: false,
        streamingContent: "",
      }));
    } catch (e: any) {
      set({ error: e.message, streaming: false, streamingContent: "" });
    }
  },

  cancelStreaming: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ streaming: false, streamingContent: "", abortController: null });
    }
  },

  clearMessages: () => set({ messages: [], streamingContent: "", error: null }),
}));
