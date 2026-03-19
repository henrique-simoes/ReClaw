"use client";

import { create } from "zustand";
import type { ChatSession, InferencePreset, InferencePresetConfig } from "@/lib/types";
import { sessions as sessionsApi } from "@/lib/api";

// Persist activeSessionId to localStorage so it survives page refreshes
const ACTIVE_SESSION_KEY = "reclaw-active-session";

function getSavedSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(ACTIVE_SESSION_KEY); } catch { return null; }
}

function saveSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}

interface SessionStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  presets: Record<string, InferencePresetConfig> | null;
  loading: boolean;
  /** Pending message to auto-send when ChatView mounts (set by "Send to Agent" flow) */
  pendingPrefill: string | null;

  fetchSessions: (projectId: string) => Promise<void>;
  createSession: (projectId: string, title?: string, agentId?: string) => Promise<ChatSession>;
  selectSession: (id: string | null) => void;
  setPendingPrefill: (message: string | null) => void;
  updateSession: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  ensureDefault: (projectId: string) => Promise<ChatSession>;
  fetchPresets: () => Promise<void>;

  activeSession: () => ChatSession | undefined;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: getSavedSessionId(),
  presets: null,
  loading: false,
  pendingPrefill: null,

  fetchSessions: async (projectId) => {
    set({ loading: true });
    try {
      const sessions = await sessionsApi.list(projectId);
      // Restore saved session if it exists in the fetched list;
      // otherwise auto-select the most recent session so the UI never shows empty.
      const current = get().activeSessionId;
      const hasCurrent = current && sessions.some((s) => s.id === current);
      const resolvedId = hasCurrent
        ? current
        : sessions.length > 0
          ? sessions[0].id
          : null;
      if (resolvedId && resolvedId !== current) saveSessionId(resolvedId);
      set({
        sessions,
        loading: false,
        activeSessionId: resolvedId,
      });
    } catch {
      set({ loading: false });
    }
  },

  createSession: async (projectId, title, agentId) => {
    const session = await sessionsApi.create({
      project_id: projectId,
      title: title || "New Chat",
      agent_id: agentId,
    });
    saveSessionId(session.id);
    set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: session.id }));
    return session;
  },

  selectSession: (id) => {
    saveSessionId(id);
    set({ activeSessionId: id });
  },

  setPendingPrefill: (message) => set({ pendingPrefill: message }),

  updateSession: async (id, data) => {
    const updated = await sessionsApi.update(id, data);
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, ...updated } : sess)),
    }));
  },

  deleteSession: async (id) => {
    await sessionsApi.delete(id);
    set((s) => {
      const newActiveId = s.activeSessionId === id ? null : s.activeSessionId;
      saveSessionId(newActiveId);
      return {
        sessions: s.sessions.filter((sess) => sess.id !== id),
        activeSessionId: newActiveId,
      };
    });
  },

  toggleStar: async (id) => {
    const result = await sessionsApi.star(id);
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, starred: result.starred } : sess
      ),
    }));
  },

  renameSession: async (id, title) => {
    await sessionsApi.update(id, { title });
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess
      ),
    }));
  },

  ensureDefault: async (projectId) => {
    const session = await sessionsApi.ensureDefault(projectId);
    set((s) => {
      const exists = s.sessions.some((sess) => sess.id === session.id);
      const newActiveId = s.activeSessionId || session.id;
      saveSessionId(newActiveId);
      return {
        sessions: exists ? s.sessions : [session, ...s.sessions],
        activeSessionId: newActiveId,
      };
    });
    return session;
  },

  fetchPresets: async () => {
    try {
      const presets = await sessionsApi.presets();
      set({ presets });
    } catch {
      // silent
    }
  },

  activeSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId);
  },
}));
