"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Pause,
  Play,
  Trash2,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Settings,
  MessageSquare,
  Brain,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  HardDrive,
  ArrowRight,
} from "lucide-react";
import { useAgentStore } from "@/stores/agentStore";
import { agents as agentsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  Agent,
  AgentCapability,
  AgentRole,
  HeartbeatStatus,
} from "@/lib/types";

const ROLE_LABELS: Record<AgentRole, string> = {
  task_executor: "Task Executor",
  devops_audit: "DevOps Audit",
  ui_audit: "UI Audit",
  ux_evaluation: "UX Evaluation",
  user_simulation: "User Simulation",
  custom: "Custom",
};

const ROLE_COLORS: Record<AgentRole, string> = {
  task_executor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  devops_audit: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  ui_audit: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ux_evaluation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  user_simulation: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  custom: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const ALL_CAPABILITIES: { id: AgentCapability; label: string; description: string }[] = [
  { id: "chat", label: "Chat", description: "Participate in conversations" },
  { id: "skill_execution", label: "Run Skills", description: "Execute UX research skills" },
  { id: "task_creation", label: "Create Tasks", description: "Add tasks to Kanban board" },
  { id: "findings_write", label: "Write Findings", description: "Create nuggets, facts, insights" },
  { id: "rag_retrieval", label: "RAG Search", description: "Search uploaded documents" },
  { id: "a2a_messaging", label: "A2A Messaging", description: "Communicate with other agents" },
  { id: "file_upload", label: "File Upload", description: "Upload and process files" },
  { id: "web_search", label: "Web Search", description: "Search the web for information" },
];

const STATE_COLORS: Record<string, string> = {
  idle: "text-slate-500",
  working: "text-blue-500",
  paused: "text-yellow-500",
  error: "text-red-500",
  stopped: "text-slate-400",
};

function HeartbeatDot({ status, isActive, size = "sm" }: { status: HeartbeatStatus; isActive?: boolean; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "w-3 h-3" : "w-2 h-2";
  const colors: Record<string, string> = {
    healthy: "bg-green-500",
    degraded: "bg-yellow-500",
    error: "bg-red-500",
    stopped: "bg-slate-400",
  };

  // Active agents that haven't reported heartbeat yet default to green
  const effectiveStatus = colors[status] ? status : (isActive ? "healthy" : "stopped");
  const color = colors[effectiveStatus] || "bg-green-500";

  return (
    <span className="relative inline-flex">
      <span className={cn("rounded-full", sizeClass, color)} />
      {(effectiveStatus === "healthy") && (
        <span className={cn("absolute rounded-full animate-ping opacity-75", sizeClass, color)} />
      )}
    </span>
  );
}

function AgentAvatar({ agent, size = "md" }: { agent: Agent; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg" };
  const initial = agent.name.charAt(0).toUpperCase();
  const bgColors = [
    "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
    "bg-pink-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
  ];
  const colorIdx = agent.name.charCodeAt(0) % bgColors.length;

  if (agent.avatar_path) {
    return (
      <img
        src={agentsApi.avatarUrl(agent.id)}
        alt={agent.name}
        className={cn("rounded-full object-cover", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center text-white font-semibold",
        sizeClasses[size],
        bgColors[colorIdx]
      )}
    >
      {initial}
    </div>
  );
}

// ─── Wizard ───

function CreateAgentWizard({ onDone }: { onDone: () => void }) {
  const { createAgent, fetchCapacity, capacity } = useAgentStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState<AgentRole>("custom");
  const [prompt, setPrompt] = useState("");
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([
    "skill_execution", "task_creation", "findings_write", "chat", "rag_retrieval", "a2a_messaging",
  ]);
  const [heartbeatInterval, setHeartbeatInterval] = useState(60);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (step === 3) fetchCapacity();
  }, [step, fetchCapacity]);

  const toggleCapability = (cap: AgentCapability) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createAgent({
        name: name.trim(),
        role,
        system_prompt: prompt,
        capabilities,
        heartbeat_interval: heartbeatInterval,
      });
      onDone();
    } catch (e: any) {
      alert(e.message);
    }
    setCreating(false);
  };

  const steps = ["Identity", "Role & Prompt", "Capabilities", "Hardware Check", "Review"];

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                i === step
                  ? "bg-reclaw-600 text-white"
                  : i < step
                  ? "bg-reclaw-100 text-reclaw-700 dark:bg-reclaw-900/30 dark:text-reclaw-400"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              )}
            >
              {i + 1}
            </button>
            {i < steps.length - 1 && (
              <div className={cn("w-6 h-0.5", i < step ? "bg-reclaw-400" : "bg-slate-200 dark:bg-slate-700")} />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{steps[step]}</p>

      {/* Step 1: Identity */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Assistant, Interview Analyst..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500"
              autoFocus
            />
          </div>
          <p className="text-xs text-slate-400">
            You can upload an avatar after creation from the agent detail panel.
          </p>
        </div>
      )}

      {/* Step 2: Role & System Prompt */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AgentRole)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500"
            >
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">System Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what this agent should do, its personality, and any specific instructions..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* Step 3: Capabilities */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Toggle which capabilities this agent has access to.</p>
          {ALL_CAPABILITIES.map((cap) => (
            <label key={cap.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{cap.label}</p>
                <p className="text-xs text-slate-400">{cap.description}</p>
              </div>
              <input
                type="checkbox"
                checked={capabilities.includes(cap.id)}
                onChange={() => toggleCapability(cap.id)}
                className="w-4 h-4 rounded border-slate-300 text-reclaw-600 focus:ring-reclaw-500"
              />
            </label>
          ))}
          <div className="pt-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Heartbeat Interval (seconds)
            </label>
            <input
              type="number"
              value={heartbeatInterval}
              onChange={(e) => setHeartbeatInterval(parseInt(e.target.value) || 60)}
              min={10}
              max={3600}
              className="w-32 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
        </div>
      )}

      {/* Step 4: Hardware Check */}
      {step === 3 && (
        <div className="space-y-4">
          {capacity ? (
            <div className={cn(
              "p-4 rounded-lg border",
              capacity.can_create
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {capacity.can_create ? (
                  <CheckCircle2 size={18} className="text-green-600" />
                ) : (
                  <AlertTriangle size={18} className="text-yellow-600" />
                )}
                <span className="font-medium text-sm">{capacity.reason}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <Users size={14} />
                  <span>{capacity.current_agents}/{capacity.max_agents} agents</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive size={14} />
                    <span>{capacity.ram_available_gb}GB free of {capacity.ram_total_gb}GB RAM</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", {
                        "bg-green-500": capacity.ram_available_gb / capacity.ram_total_gb > 0.3,
                        "bg-yellow-500": capacity.ram_available_gb / capacity.ram_total_gb <= 0.3 && capacity.ram_available_gb / capacity.ram_total_gb > 0.1,
                        "bg-red-500": capacity.ram_available_gb / capacity.ram_total_gb <= 0.1,
                      })}
                      style={{ width: `${Math.round(((capacity.ram_total_gb - capacity.ram_available_gb) / capacity.ram_total_gb) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {Math.round(((capacity.ram_total_gb - capacity.ram_available_gb) / capacity.ram_total_gb) * 100)}% used
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <Cpu size={14} />
                  <span>{capacity.cpu_cores} CPU cores</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <Activity size={14} />
                  <span>Pressure: {capacity.pressure}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Checking hardware capacity...</p>
          )}
          {capacity && !capacity.can_create && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              You can still create the agent, but it may not run optimally. Consider pausing unused agents first.
            </p>
          )}
        </div>
      )}

      {/* Step 5: Review */}
      {step === 4 && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Name</span>
              <span className="font-medium text-slate-900 dark:text-white">{name || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Role</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", ROLE_COLORS[role])}>{ROLE_LABELS[role]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Capabilities</span>
              <span className="text-slate-700 dark:text-slate-300">{capabilities.length} enabled</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Heartbeat</span>
              <span className="text-slate-700 dark:text-slate-300">every {heartbeatInterval}s</span>
            </div>
          </div>
          {prompt && (
            <div>
              <p className="text-xs text-slate-500 mb-1">System Prompt</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded line-clamp-4">{prompt}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : onDone()}
          className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < 4 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !name.trim()}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 disabled:opacity-50"
          >
            Next <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Agent"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Agent Detail ───

function AgentDetail({ agent }: { agent: Agent }) {
  const { updateAgent, pauseAgent, resumeAgent, deleteAgent } = useAgentStore();
  const [tab, setTab] = useState<"overview" | "memory" | "permissions">("overview");

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4 space-y-4">
      {/* Tabs */}
      <div className="flex gap-1">
        {(["overview", "memory", "permissions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg capitalize transition-colors",
              tab === t
                ? "bg-reclaw-100 text-reclaw-700 dark:bg-reclaw-900/30 dark:text-reclaw-400"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">System Prompt</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded whitespace-pre-wrap max-h-32 overflow-y-auto">
              {agent.system_prompt || "No system prompt configured"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{agent.executions}</p>
              <p className="text-[10px] text-slate-500">Executions</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{agent.error_count}</p>
              <p className="text-[10px] text-slate-500">Errors</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{agent.heartbeat_interval_seconds}s</p>
              <p className="text-[10px] text-slate-500">Heartbeat</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {agent.state === "paused" ? (
              <button onClick={() => resumeAgent(agent.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400">
                <Play size={12} /> Resume
              </button>
            ) : (
              <button onClick={() => pauseAgent(agent.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Pause size={12} /> Pause
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`http://localhost:8000/api/agents/${agent.id}/export`);
                  const data = await res.json();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${agent.name.replace(/\s+/g, "-").toLowerCase()}-config.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  console.error("Export failed:", e);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              <Download size={12} /> Export
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("reclaw:navigate", {
                  detail: { view: "chat", agent_id: agent.id }
                }));
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-600 dark:text-reclaw-400 rounded hover:bg-reclaw-200"
            >
              <MessageSquare size={12} /> Chat
            </button>
            {!agent.is_system && (
              <button
                onClick={async () => {
                  if (confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) {
                    await deleteAgent(agent.id);
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "memory" && (
        <div className="space-y-2">
          {Object.keys(agent.memory || {}).length === 0 ? (
            <p className="text-xs text-slate-400">No memories stored yet. This agent will build memory as it works.</p>
          ) : (
            Object.entries(agent.memory).map(([key, value]) => (
              <div key={key} className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{key}</p>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "permissions" && (
        <div className="space-y-3">
          {/* Master on/off toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Agent Active</p>
              <p className="text-[10px] text-slate-400">Master switch — disables all capabilities when off</p>
            </div>
            <button
              onClick={async () => {
                if (agent.is_active) {
                  await pauseAgent(agent.id);
                  await updateAgent(agent.id, { is_active: false });
                } else {
                  await resumeAgent(agent.id);
                  await updateAgent(agent.id, { is_active: true });
                }
              }}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                agent.is_active ? "bg-reclaw-600" : "bg-slate-300 dark:bg-slate-600"
              )}
              role="switch"
              aria-checked={agent.is_active}
              aria-label="Toggle agent active"
            >
              <span className={cn(
                "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
                agent.is_active ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Per-capability toggles */}
          <div className={cn("space-y-1", !agent.is_active && "opacity-50 pointer-events-none")}>
            {ALL_CAPABILITIES.map((cap) => {
              const enabled = agent.capabilities.includes(cap.id);
              return (
                <div key={cap.id} className="flex items-center justify-between py-2 px-1">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{cap.label}</p>
                    <p className="text-[10px] text-slate-400">{cap.description}</p>
                  </div>
                  <button
                    onClick={async () => {
                      const newCaps = enabled
                        ? agent.capabilities.filter((c) => c !== cap.id)
                        : [...agent.capabilities, cap.id];
                      await updateAgent(agent.id, { capabilities: newCaps });
                    }}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                      enabled ? "bg-reclaw-500" : "bg-slate-300 dark:bg-slate-600"
                    )}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Toggle ${cap.label}`}
                  >
                    <span className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm",
                      enabled ? "translate-x-[18px]" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main View ───

export default function AgentsView() {
  const {
    agents,
    fetchAgents,
    fetchA2ALog,
    a2aMessages,
    loading,
  } = useAgentStore();
  const [activeTab, setActiveTab] = useState<"agents" | "a2a" | "create">("agents");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (activeTab === "a2a") fetchA2ALog();
  }, [activeTab, fetchA2ALog]);

  const systemAgents = agents.filter((a) => a.is_system);
  const userAgents = agents.filter((a) => !a.is_system);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-reclaw-600" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Agents</h2>
          <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
            {agents.length} total
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3">
        {(["agents", "a2a", "create"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm rounded-lg transition-colors",
              activeTab === tab
                ? "bg-reclaw-100 text-reclaw-700 dark:bg-reclaw-900/30 dark:text-reclaw-400 font-medium"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {tab === "agents" ? "Agents" : tab === "a2a" ? "A2A Messages" : "Create Agent"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "agents" && (
          <div className="space-y-6">
            {/* System Agents */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">System Agents</h3>
              <div className="space-y-2">
                {systemAgents.map((agent) => {
                  const expanded = expandedAgent === agent.id;
                  return (
                    <div key={agent.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setExpandedAgent(expanded ? null : agent.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <AgentAvatar agent={agent} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{agent.name}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", ROLE_COLORS[agent.role])}>
                              {ROLE_LABELS[agent.role]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {agent.current_task || agent.system_prompt.slice(0, 60)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <HeartbeatDot status={agent.heartbeat_status} isActive={agent.is_active && agent.state !== "paused"} size="md" />
                          <span className={cn("text-xs capitalize", STATE_COLORS[agent.state])}>{agent.state}</span>
                          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                        </div>
                      </button>
                      {expanded && <AgentDetail agent={agent} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* User Agents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase text-slate-500">Your Agents</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".json";
                      input.onchange = async (e: any) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const text = await file.text();
                          const data = JSON.parse(text);
                          const agentData = data.agent || data;
                          await fetch("http://localhost:8000/api/agents/import", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(agentData),
                          });
                          fetchAgents();
                        } catch (err) {
                          console.error("Import failed:", err);
                        }
                      };
                      input.click();
                    }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    <Upload size={12} /> Import
                  </button>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="flex items-center gap-1 text-xs text-reclaw-600 hover:text-reclaw-700"
                  >
                    <Plus size={14} /> New Agent
                  </button>
                </div>
              </div>
              {userAgents.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                  <Users size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-sm text-slate-500 mb-1">No custom agents yet</p>
                  <p className="text-xs text-slate-400 mb-4">Create an agent to specialize in specific research tasks</p>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700"
                  >
                    <Plus size={14} /> Create Agent
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {userAgents.map((agent) => {
                    const expanded = expandedAgent === agent.id;
                    return (
                      <div key={agent.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => setExpandedAgent(expanded ? null : agent.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <AgentAvatar agent={agent} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{agent.name}</span>
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", ROLE_COLORS[agent.role])}>
                                {ROLE_LABELS[agent.role]}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {agent.current_task || agent.system_prompt.slice(0, 60)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <HeartbeatDot status={agent.heartbeat_status} isActive={agent.is_active && agent.state !== "paused"} size="md" />
                            <span className={cn("text-xs capitalize", STATE_COLORS[agent.state])}>{agent.state}</span>
                            {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          </div>
                        </button>
                        {expanded && <AgentDetail agent={agent} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "a2a" && (
          <div className="space-y-3">
            {a2aMessages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">No agent-to-agent messages yet</p>
                <p className="text-xs text-slate-400">Agents will communicate here as they coordinate work</p>
              </div>
            ) : (
              a2aMessages.map((msg) => {
                const fromAgent = agents.find((a) => a.id === msg.from_agent_id);
                const toAgent = agents.find((a) => a.id === msg.to_agent_id);
                return (
                  <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    {fromAgent && <AgentAvatar agent={fromAgent} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-900 dark:text-white">
                          {fromAgent?.name || msg.from_agent_id}
                        </span>
                        <ArrowRight size={10} className="text-slate-400" />
                        <span className="text-xs text-slate-500">
                          {msg.to_agent_id ? (toAgent?.name || msg.to_agent_id) : "All Agents"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize">
                          {msg.message_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">{msg.content}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(msg.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "create" && (
          <div className="max-w-lg mx-auto">
            <CreateAgentWizard onDone={() => { setActiveTab("agents"); fetchAgents(); }} />
          </div>
        )}
      </div>
    </div>
  );
}
