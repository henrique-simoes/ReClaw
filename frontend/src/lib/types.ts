/** Core types for ReClaw frontend. */

export type ProjectPhase = "discover" | "define" | "develop" | "deliver";
export type TaskStatus = "backlog" | "in_progress" | "in_review" | "done";

export interface Project {
  id: string;
  name: string;
  description: string;
  phase: ProjectPhase;
  company_context: string;
  project_context: string;
  guardrails: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  agent_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  skill_name: string;
  agent_notes: string;
  user_context: string;
  progress: number;
  position: number;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  sources?: { source: string; score: number; page?: number }[];
  agent_id?: string;
  agent_name?: string;
}

export interface Nugget {
  id: string;
  project_id: string;
  text: string;
  source: string;
  source_location: string;
  tags: string[];
  phase: string;
  confidence: number;
  created_at: string;
}

export interface Fact {
  id: string;
  project_id: string;
  text: string;
  nugget_ids: string[];
  phase: string;
  confidence: number;
  created_at: string;
}

export interface Insight {
  id: string;
  project_id: string;
  text: string;
  fact_ids: string[];
  phase: string;
  confidence: number;
  impact: string;
  created_at: string;
}

export interface Recommendation {
  id: string;
  project_id: string;
  text: string;
  insight_ids: string[];
  phase: string;
  priority: string;
  effort: string;
  status: string;
  created_at: string;
}

export interface FindingsSummary {
  project_id: string;
  totals: {
    nuggets: number;
    facts: number;
    insights: number;
    recommendations: number;
  };
  by_phase: Record<
    ProjectPhase,
    {
      nuggets: number;
      facts: number;
      insights: number;
      recommendations: number;
    }
  >;
}

export interface HardwareInfo {
  total_ram_gb: number;
  available_ram_gb: number;
  reclaw_ram_budget_gb: number;
  cpu_cores: number;
  cpu_arch: string;
  reclaw_cpu_budget_cores: number;
  gpu: { vendor: string; name: string; vram_mb: number } | null;
  os: string;
}

export interface ModelRecommendation {
  model_name: string;
  quantization: string;
  context_length: number;
  gpu_layers: number;
  reason: string;
}

export type AgentRole = "task_executor" | "devops_audit" | "ui_audit" | "ux_evaluation" | "user_simulation" | "custom";
export type AgentState = "idle" | "working" | "paused" | "error" | "stopped";
export type HeartbeatStatus = "healthy" | "degraded" | "error" | "stopped";
export type AgentCapability = "web_search" | "file_upload" | "skill_execution" | "task_creation" | "findings_write" | "chat" | "rag_retrieval" | "a2a_messaging";

export interface Agent {
  id: string;
  name: string;
  avatar_path: string | null;
  role: AgentRole;
  system_prompt: string;
  capabilities: AgentCapability[];
  memory: Record<string, unknown>;
  heartbeat_interval_seconds: number;
  heartbeat_status: HeartbeatStatus;
  last_heartbeat_at: string | null;
  state: AgentState;
  current_task: string;
  error_count: number;
  executions: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface A2AMessage {
  id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  message_type: string;
  content: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface AgentCapacityCheck {
  can_create: boolean;
  reason: string;
  current_agents: number;
  max_agents: number;
  ram_available_gb: number;
  ram_total_gb: number;
  cpu_cores: number;
  pressure: string;
}

export type InferencePreset = "lightweight" | "medium" | "high" | "custom";

export interface ChatSession {
  id: string;
  project_id: string;
  title: string;
  agent_id: string | null;
  model_override: string | null;
  inference_preset: InferencePreset;
  custom_temperature: number | null;
  custom_max_tokens: number | null;
  custom_context_window: number | null;
  starred: boolean;
  archived: boolean;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InferencePresetConfig {
  label: string;
  description: string;
  temperature: number | null;
  max_tokens: number | null;
  context_window: number | null;
}

export interface WSEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// --- Context DAG ---

export interface DAGNode {
  id: string;
  parent_id: string | null;
  depth: number;
  summary_text: string;
  message_count: number;
  token_count: number;
  original_token_count: number;
  child_node_ids: string[];
  time_range_start: string;
  time_range_end: string;
  created_at: string;
}

export interface DAGHealth {
  total_messages: number;
  compacted_messages: number;
  fresh_tail_size: number;
  max_depth: number;
  compression_ratio: number;
  nodes_by_depth: Record<number, number>;
  dag_enabled: boolean;
}

export interface DAGExpandResult {
  node_id: string;
  depth: number;
  items: Array<{
    id: string;
    role?: string;
    content: string;
    created_at?: string;
    type: "message" | "summary";
  }>;
}

export interface DAGGrepResult {
  query: string;
  results: Array<{
    message_id: string;
    role: string;
    content_excerpt: string;
    created_at: string;
    dag_node_id: string | null;
  }>;
}
