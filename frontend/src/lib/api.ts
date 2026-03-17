/** API client for ReClaw backend. */

import type { ChatSession, ChatMessage, InferencePresetConfig } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(data) });
}

function patch<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(data) });
}

function del(path: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { method: "DELETE" });
}

// --- Projects ---

export const projects = {
  list: () => request<any[]>("/api/projects"),
  get: (id: string) => request<any>(`/api/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    request<any>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<any>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetch(`${API_BASE}/api/projects/${id}`, { method: "DELETE" }),
  versions: (id: string) => request<any[]>(`/api/projects/${id}/versions`),
};

// --- Tasks ---

export const tasks = {
  list: (projectId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (status) params.set("status", status);
    return request<any[]>(`/api/tasks?${params}`);
  },
  create: (data: { project_id: string; title: string; description?: string }) =>
    request<any>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<any>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  move: (id: string, status: string) =>
    request<any>(`/api/tasks/${id}/move?status=${status}`, { method: "POST" }),
  delete: (id: string) =>
    fetch(`${API_BASE}/api/tasks/${id}`, { method: "DELETE" }),
};

// --- Chat ---

export const chat = {
  send: async function* (projectId: string, message: string, sessionId?: string) {
    const payload: Record<string, unknown> = { message, project_id: projectId };
    if (sessionId) payload.session_id = sessionId;
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Chat error: ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6));
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }
  },
  history: (projectId: string, limit = 50) =>
    request<any[]>(`/api/chat/history/${projectId}?limit=${limit}`),
};

// --- Findings ---

export const findings = {
  nuggets: (projectId?: string) => {
    const params = projectId ? `?project_id=${projectId}` : "";
    return request<any[]>(`/api/findings/nuggets${params}`);
  },
  facts: (projectId?: string) => {
    const params = projectId ? `?project_id=${projectId}` : "";
    return request<any[]>(`/api/findings/facts${params}`);
  },
  insights: (projectId?: string) => {
    const params = projectId ? `?project_id=${projectId}` : "";
    return request<any[]>(`/api/findings/insights${params}`);
  },
  recommendations: (projectId?: string) => {
    const params = projectId ? `?project_id=${projectId}` : "";
    return request<any[]>(`/api/findings/recommendations${params}`);
  },
  summary: (projectId: string) =>
    request<any>(`/api/findings/summary/${projectId}`),
  delete: (type: "nugget" | "fact" | "insight" | "recommendation", id: string) => {
    const plural: Record<string, string> = {
      nugget: "nuggets",
      fact: "facts",
      insight: "insights",
      recommendation: "recommendations",
    };
    return fetch(`${API_BASE}/api/findings/${plural[type]}/${id}`, { method: "DELETE" });
  },
};

// --- Files ---

export const files = {
  upload: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/files/upload/${projectId}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload error: ${res.status}`);
    return res.json();
  },
  list: (projectId: string) => request<any>(`/api/files/${projectId}`),
  stats: (projectId: string) => request<any>(`/api/files/${projectId}/stats`),
  content: (projectId: string, filename: string) =>
    request<{ filename: string; type: string; content: string | null; media_url?: string; pages?: number; size: number }>(
      `/api/files/${projectId}/content/${encodeURIComponent(filename)}`
    ),
};

// --- Skills ---

export const skills = {
  list: (phase?: string) => {
    const params = phase ? `?phase=${phase}` : "";
    return request<any>(`/api/skills${params}`);
  },
  get: (name: string) => request<any>(`/api/skills/${name}`),
  create: (data: {
    name: string;
    display_name: string;
    description: string;
    phase: string;
    skill_type: string;
    plan_prompt?: string;
    execute_prompt?: string;
    output_schema?: string;
  }) => request<any>("/api/skills", { method: "POST", body: JSON.stringify(data) }),
  update: (name: string, data: Record<string, unknown>) =>
    request<any>(`/api/skills/${name}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (name: string) =>
    fetch(`${API_BASE}/api/skills/${name}`, { method: "DELETE" }),
  toggle: (name: string, enabled: boolean) =>
    request<any>(`/api/skills/${name}/toggle?enabled=${enabled}`, { method: "POST" }),
  execute: (name: string, data: { project_id: string; user_context?: string }) =>
    request<any>(`/api/skills/${name}/execute`, { method: "POST", body: JSON.stringify(data) }),
  health: () => request<any>("/api/skills/health/all"),
  skillHealth: (name: string) => request<any>(`/api/skills/${name}/health`),
  proposals: {
    pending: () => request<any>("/api/skills/proposals/pending"),
    all: (limit = 50) => request<any>(`/api/skills/proposals/all?limit=${limit}`),
    approve: (id: string) =>
      request<any>(`/api/skills/proposals/${id}/approve`, { method: "POST" }),
    reject: (id: string, reason = "") =>
      request<any>(`/api/skills/proposals/${id}/reject?reason=${encodeURIComponent(reason)}`, { method: "POST" }),
  },
};

// --- Agents ---

export const agents = {
  list: (includeSystem = true) =>
    request<any>(`/api/agents?include_system=${includeSystem}`),
  get: (id: string) => request<any>(`/api/agents/${id}`),
  create: (data: {
    name: string;
    role?: string;
    system_prompt?: string;
    capabilities?: string[];
    heartbeat_interval?: number;
  }) => request<any>("/api/agents", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<any>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetch(`${API_BASE}/api/agents/${id}`, { method: "DELETE" }),
  pause: (id: string) =>
    request<any>(`/api/agents/${id}/pause`, { method: "POST" }),
  resume: (id: string) =>
    request<any>(`/api/agents/${id}/resume`, { method: "POST" }),
  uploadAvatar: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/agents/${id}/avatar`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload error: ${res.status}`);
    return res.json();
  },
  avatarUrl: (id: string) => `${API_BASE}/api/agents/${id}/avatar`,
  memory: (id: string) => request<any>(`/api/agents/${id}/memory`),
  updateMemory: (id: string, data: Record<string, unknown>) =>
    request<any>(`/api/agents/${id}/memory`, { method: "PATCH", body: JSON.stringify(data) }),
  messages: (id: string, limit = 50) =>
    request<any>(`/api/agents/${id}/messages?limit=${limit}`),
  sendMessage: (
    id: string,
    data: { to_agent_id?: string; content: string; message_type?: string }
  ) =>
    request<any>(`/api/agents/${id}/messages`, { method: "POST", body: JSON.stringify(data) }),
  a2aLog: (limit = 100) => request<any>(`/api/agents/a2a/log?limit=${limit}`),
  heartbeat: () => request<any>("/api/agents/heartbeat/status"),
  capacity: () => request<any>("/api/agents/capacity"),
};

// --- Sessions ---

export const sessions = {
  list: (projectId: string) => get<{ sessions: ChatSession[] }>(`/api/sessions/${projectId}`).then(r => r.sessions),
  create: (data: { project_id: string; title?: string; agent_id?: string; inference_preset?: string }) =>
    post<ChatSession>("/api/sessions", data),
  get: (sessionId: string) => get<ChatSession & { messages: ChatMessage[] }>(`/api/sessions/detail/${sessionId}`),
  update: (sessionId: string, data: Record<string, unknown>) =>
    patch<ChatSession>(`/api/sessions/${sessionId}`, data),
  delete: (sessionId: string) => del(`/api/sessions/${sessionId}`),
  star: (sessionId: string) => post<{ starred: boolean }>(`/api/sessions/${sessionId}/star`, {}),
  ensureDefault: (projectId: string) => get<ChatSession>(`/api/sessions/${projectId}/ensure-default`),
  presets: () => get<{ presets: Record<string, InferencePresetConfig> }>("/api/inference-presets").then(r => r.presets),
};

// --- Project Export ---

export const projectExport = {
  export: (projectId: string) => post<{ exported: boolean; path: string; files_count: number }>(`/api/projects/${projectId}/export`, {}),
};

// --- Settings ---

export const settings = {
  hardware: () => request<any>("/api/settings/hardware"),
  models: () => request<any>("/api/settings/models"),
  status: () => request<any>("/api/settings/status"),
  switchModel: (model: string) =>
    request<any>(`/api/settings/model?model_name=${model}`, { method: "POST" }),
};
