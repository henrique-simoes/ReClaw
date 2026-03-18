"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Loader2, StopCircle, Upload, User, Settings2, Bot, Zap, ChevronDown, HelpCircle, X, AlertTriangle } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useAgentStore } from "@/stores/agentStore";
import { cn, formatDate } from "@/lib/utils";
import { files as filesApi } from "@/lib/api";
import { ChatSkeleton } from "@/components/common/LoadingSkeleton";
import ChatSessionsSidebar from "./ChatSessionsSidebar";

/* ── Chat Avatars ── */

function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
      <User size={16} className="text-slate-500 dark:text-slate-400" />
    </div>
  );
}

function AgentAvatar({ name }: { name?: string }) {
  const label = name || "ReClaw";
  return (
    <div className="w-8 h-8 rounded-full bg-reclaw-100 dark:bg-reclaw-900/40 flex items-center justify-center flex-shrink-0" title={label}>
      <span className="text-sm">🐾</span>
    </div>
  );
}

/* ── Inference Preset Selector ── */

const PRESET_INFO: Record<string, { icon: string; label: string; desc: string }> = {
  lightweight: { icon: "⚡", label: "Lightweight", desc: "Fast, minimal reasoning. Quick questions." },
  medium: { icon: "⚖️", label: "Medium", desc: "Balanced speed and depth. Most tasks." },
  high: { icon: "🧠", label: "High", desc: "Deep reasoning, large context. Complex analysis." },
  custom: { icon: "🔧", label: "Custom", desc: "Your own temperature, tokens, context." },
};

const REASONING_PRESETS: Record<string, { temperature: number; maxTokens: number; topP: number }> = {
  quick: { temperature: 0.3, maxTokens: 1024, topP: 0.8 },
  balanced: { temperature: 0.7, maxTokens: 2048, topP: 0.9 },
  deep: { temperature: 0.9, maxTokens: 4096, topP: 0.95 },
};

function CustomLLMPanel({
  session,
  onUpdate,
  onClose,
}: {
  session: any;
  onUpdate: (data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [temperature, setTemperature] = useState(session.custom_temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(session.custom_max_tokens ?? 2048);
  const [topP, setTopP] = useState(0.9);
  const [reasoning, setReasoning] = useState("balanced");

  const isHighResource = maxTokens > 4096 || (reasoning === "deep" && temperature < 0.3);

  const save = () => {
    onUpdate({
      inference_preset: "custom",
      custom_temperature: temperature,
      custom_max_tokens: maxTokens,
    });
    onClose();
  };

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-4 min-w-[320px]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Custom LLM Settings</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5">
          <X size={14} />
        </button>
      </div>

      {/* Reasoning Level */}
      <div className="mb-4">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
          Reasoning Depth
        </label>
        <div className="grid grid-cols-3 gap-1">
          {(["quick", "balanced", "deep"] as const).map((level) => (
            <button
              key={level}
              onClick={() => {
                setReasoning(level);
                const preset = REASONING_PRESETS[level];
                setTemperature(preset.temperature);
                setMaxTokens(preset.maxTokens);
                setTopP(preset.topP);
              }}
              className={cn(
                "py-1.5 px-2 text-xs rounded-md transition-colors capitalize",
                reasoning === level
                  ? "bg-reclaw-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              )}
            >
              {level === "quick" ? "⚡ Quick" : level === "balanced" ? "⚖️ Balanced" : "🧠 Deep"}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {reasoning === "quick" ? "Fast responses, less analysis" : reasoning === "balanced" ? "Good mix of speed and depth" : "Maximum analysis, slower responses"}
        </p>
      </div>

      {/* Temperature */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Temperature
          </label>
          <span className="text-xs text-slate-500 font-mono">{temperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.05"
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-slate-200 dark:bg-slate-700 accent-reclaw-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Max Output Tokens
          </label>
          <span className="text-xs text-slate-500 font-mono">{maxTokens}</span>
        </div>
        <input
          type="range"
          min="256"
          max="8192"
          step="256"
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-slate-200 dark:bg-slate-700 accent-reclaw-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>Short (256)</span>
          <span>Long (8192)</span>
        </div>
      </div>

      {/* Top P */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Top P (Nucleus Sampling)
          </label>
          <span className="text-xs text-slate-500 font-mono">{topP.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={topP}
          onChange={(e) => setTopP(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-slate-200 dark:bg-slate-700 accent-reclaw-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>Focused</span>
          <span>Diverse</span>
        </div>
      </div>

      {/* Resource warning */}
      {isHighResource && (
        <div className="mb-3 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle size={10} /> High resource usage — may slow other agents or exceed local GPU memory.
          </p>
        </div>
      )}

      {/* Save */}
      <button
        onClick={save}
        className="w-full py-1.5 bg-reclaw-600 text-white text-xs font-medium rounded-md hover:bg-reclaw-700 transition-colors"
      >
        Apply Settings
      </button>
    </div>
  );
}

function ChatToolbar({
  activeSession,
  agents,
  onUpdateSession,
}: {
  activeSession: any;
  agents: any[];
  onUpdateSession: (data: Record<string, unknown>) => void;
}) {
  const [showPresets, setShowPresets] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);

  if (!activeSession) return null;

  const currentPreset = activeSession.inference_preset || "medium";
  const presetInfo = PRESET_INFO[currentPreset] || PRESET_INFO.medium;
  const assignedAgent = agents.find((a: any) => a.id === activeSession.agent_id);

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
      {/* Agent selector */}
      <div className="relative">
        <button
          onClick={() => { setShowAgents(!showAgents); setShowPresets(false); }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Bot size={12} className="text-slate-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {assignedAgent ? assignedAgent.name : "ReClaw (Main)"}
          </span>
          <ChevronDown size={10} className="text-slate-400" />
        </button>
        {showAgents && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[180px]">
            <button
              onClick={() => { onUpdateSession({ agent_id: null }); setShowAgents(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2",
                !activeSession.agent_id && "bg-reclaw-50 dark:bg-reclaw-900/20"
              )}
            >
              <span className="text-sm">🐾</span> ReClaw (Main)
            </button>
            {agents.filter((a: any) => a.is_active && a.id !== "reclaw-main").map((agent: any) => (
              <button
                key={agent.id}
                onClick={() => { onUpdateSession({ agent_id: agent.id }); setShowAgents(false); }}
                className={cn(
                  "w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2",
                  activeSession.agent_id === agent.id && "bg-reclaw-50 dark:bg-reclaw-900/20"
                )}
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ backgroundColor: `hsl(${agent.name.length * 37 % 360}, 60%, 45%)` }}
                >
                  {agent.name.charAt(0)}
                </div>
                {agent.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

      {/* Preset selector */}
      <div className="relative">
        <button
          onClick={() => { setShowPresets(!showPresets); setShowAgents(false); }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Zap size={12} className="text-slate-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {presetInfo.icon} {presetInfo.label}
          </span>
          <ChevronDown size={10} className="text-slate-400" />
        </button>
        {showPresets && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[260px]">
            {Object.entries(PRESET_INFO).map(([key, info]) => (
              <button
                key={key}
                onClick={() => {
                  if (key === "custom") {
                    setShowPresets(false);
                    setShowCustomPanel(true);
                  } else {
                    onUpdateSession({ inference_preset: key });
                    setShowPresets(false);
                  }
                }}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700",
                  currentPreset === key && "bg-reclaw-50 dark:bg-reclaw-900/20"
                )}
              >
                <div className="flex items-center gap-2">
                  <span>{info.icon}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{info.label}</span>
                  {currentPreset === key && (
                    <span className="ml-auto text-reclaw-600 text-[10px]">Active</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 ml-6">{info.desc}</p>
              </button>
            ))}
          </div>
        )}
        {showCustomPanel && (
          <CustomLLMPanel
            session={activeSession}
            onUpdate={onUpdateSession}
            onClose={() => setShowCustomPanel(false)}
          />
        )}
      </div>

      {/* Session title */}
      <div className="ml-auto text-slate-400">
        {activeSession.title}
      </div>
    </div>
  );
}

export default function ChatView() {
  const { messages, streaming, streamingContent, error, sendMessage, fetchHistory, cancelStreaming } = useChatStore();
  const { activeProjectId } = useProjectStore();
  const { activeSessionId, ensureDefault, updateSession, pendingPrefill, setPendingPrefill, fetchSessions } = useSessionStore();
  const { agents, fetchAgents } = useAgentStore();
  const activeSession = useSessionStore((s) => s.activeSession());
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize sessions: fetch list first (restores localStorage session), then ensure a default exists
  useEffect(() => {
    if (activeProjectId) {
      fetchSessions(activeProjectId).then(() => ensureDefault(activeProjectId));
      fetchAgents();
    }
  }, [activeProjectId, fetchSessions, ensureDefault, fetchAgents]);

  useEffect(() => {
    if (activeProjectId) {
      setLoadingHistory(true);
      fetchHistory(activeProjectId, activeSessionId || undefined).finally(() => setLoadingHistory(false));
    }
  }, [activeProjectId, activeSessionId, fetchHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Auto-send pending prefill message (from "Send to Agent" flow)
  useEffect(() => {
    if (pendingPrefill && activeProjectId && activeSessionId && !streaming && !loadingHistory) {
      const msg = pendingPrefill;
      setPendingPrefill(null);
      sendMessage(activeProjectId, msg, activeSessionId);
    }
  }, [pendingPrefill, activeProjectId, activeSessionId, streaming, loadingHistory, setPendingPrefill, sendMessage]);

  const handleSend = () => {
    if (!input.trim() || !activeProjectId || streaming) return;
    sendMessage(activeProjectId, input.trim(), activeSessionId || undefined);
    setInput("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProjectId) return;

    try {
      const result = await filesApi.upload(activeProjectId, file);
      // Show confirmation in chat
      await sendMessage(
        activeProjectId,
        `I just uploaded "${file.name}" (${result.chunks_indexed} chunks indexed). Can you analyze it?`,
        activeSessionId || undefined,
      );
    } catch (err) {
      console.error("Upload failed:", err);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <span className="text-4xl block mb-4">🐾</span>
          <p className="text-lg">Select or create a project to start</p>
        </div>
      </div>
    );
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!activeProjectId) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const result = await filesApi.upload(activeProjectId, file);
      await sendMessage(activeProjectId, `I just uploaded "${file.name}" (${result.chunks_indexed} chunks indexed). Can you analyze it?`, activeSessionId || undefined);
    } catch (err) {
      console.error("Drop upload failed:", err);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {activeProjectId && (
        <ChatSessionsSidebar projectId={activeProjectId} />
      )}

      {/* Main chat area */}
      <div
        className={cn("flex-1 flex flex-col", dragOver && "ring-2 ring-reclaw-500 ring-inset bg-reclaw-50/50 dark:bg-reclaw-900/10")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Toolbar */}
        <ChatToolbar
          activeSession={activeSession}
          agents={agents}
          onUpdateSession={(data) => {
            if (activeSessionId) updateSession(activeSessionId, data);
          }}
        />

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-reclaw-50/80 dark:bg-reclaw-900/80 pointer-events-none">
            <div className="text-center">
              <Upload size={40} className="mx-auto text-reclaw-500 mb-2" />
              <p className="text-reclaw-700 dark:text-reclaw-400 font-medium">Drop files to upload</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center max-w-md">
                <span className="text-4xl block mb-4">🐾</span>
                <p className="text-lg mb-2">Ready to research!</p>
                <p className="text-sm">
                  Upload interview transcripts, ask research questions, or drop files to get started.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "message-enter max-w-3xl flex gap-2.5",
                msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {/* Avatar */}
              <div className="mt-1">
                {msg.role === "user" ? <UserAvatar /> : <AgentAvatar name={msg.agent_name} />}
              </div>

              {/* Bubble */}
              <div className="flex-1 min-w-0">
                {msg.role !== "user" && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 px-1 font-medium">
                    {msg.agent_name || "ReClaw"}
                  </p>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3",
                    msg.role === "user"
                      ? "bg-reclaw-600 text-white rounded-br-md"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md"
                  )}
                >
                  <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Sources:</p>
                      {msg.sources.map((src, i) => (
                        <span
                          key={i}
                          className="inline-block text-xs bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5 mr-1 mb-1"
                        >
                          {src.source.split("/").pop()} ({Math.round(src.score * 100)}%)
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 px-1">
                  {formatDate(msg.created_at)}
                </p>
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streaming && streamingContent && (
            <div className="mr-auto max-w-3xl flex gap-2.5 message-enter">
              <div className="mt-1"><AgentAvatar /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 px-1 font-medium">ReClaw</p>
                <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <div className="whitespace-pre-wrap text-sm streaming-cursor">
                    {streamingContent}
                  </div>
                </div>
              </div>
            </div>
          )}

          {streaming && !streamingContent && (
            <div className="mr-auto flex items-center gap-2.5 text-slate-400 px-4">
              <div className="mt-0"><AgentAvatar /></div>
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Thinking...</span>
              <button
                onClick={cancelStreaming}
                className="ml-2 flex items-center gap-1 text-xs text-red-400 hover:text-red-500"
                aria-label="Cancel response"
              >
                <StopCircle size={12} /> Cancel
              </button>
            </div>
          )}

          {streaming && streamingContent && (
            <div className="flex justify-center">
              <button
                onClick={cancelStreaming}
                className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 hover:text-red-500 bg-red-50 dark:bg-red-900/20 rounded-full"
                aria-label="Stop generating"
              >
                <StopCircle size={12} /> Stop generating
              </button>
            </div>
          )}

          {error && (
            <div className="mr-auto max-w-3xl">
              <div className="rounded-2xl px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.csv,.md"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Upload file"
            >
              <Paperclip size={20} />
            </button>

            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about your research, or drop files here..."
                rows={1}
                className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500 focus:border-transparent"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              aria-label="Send message"
              className={cn(
                "p-2.5 rounded-lg transition-colors",
                input.trim() && !streaming
                  ? "bg-reclaw-600 text-white hover:bg-reclaw-700"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
              )}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
