"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Database,
  Users,
  Activity,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  GitBranch,
} from "lucide-react";
import ContextDAGView from "./ContextDAGView";
import { memory as memoryApi, agents as agentsApi } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";

type MemoryTab = "knowledge" | "agent" | "health" | "context-dag";

interface MemoryChunk {
  text: string;
  source: string;
  page: number;
  agent_id: string;
  chunk_type: string;
  created_at: number;
  confidence: number;
}

interface SourceInfo {
  name: string;
  count: number;
}

interface SearchResult {
  text: string;
  source: string;
  score: number;
  page: number | null;
}

interface MemoryStats {
  vector_chunks: number;
  keyword_chunks: number;
  sources: Array<{ name: string; chunk_count: number }>;
  embedding_model: string;
  vector_dimensions: number;
  chunk_size: number;
  chunk_overlap: number;
  hybrid_weights: { vector: number; keyword: number };
}

interface AgentNote {
  text: string;
  source: string;
}

interface AgentInfo {
  id: string;
  name: string;
}

// ---- Knowledge Base Tab ----

function KnowledgeBaseTab({ projectId }: { projectId: string }) {
  const [chunks, setChunks] = useState<MemoryChunk[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchChunks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await memoryApi.list(projectId, page, pageSize);
      setChunks(data.chunks);
      setTotal(data.total);
      if (data.sources) setSources(data.sources);
    } catch (e) {
      console.error("Failed to fetch memory chunks:", e);
    }
    setLoading(false);
  }, [projectId, page, pageSize]);

  useEffect(() => {
    fetchChunks();
  }, [fetchChunks]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const data = await memoryApi.search(projectId, searchQuery);
      setSearchResults(data.results);
    } catch (e) {
      console.error("Memory search failed:", e);
    }
    setSearching(false);
  };

  const handleDeleteSource = async (sourceName: string) => {
    if (!confirm(`Delete all chunks from "${sourceName}"? This cannot be undone.`)) return;
    try {
      await memoryApi.deleteSource(projectId, sourceName);
      fetchChunks();
    } catch (e) {
      console.error("Delete source failed:", e);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Hybrid search across knowledge base..."
            aria-label="Search knowledge base"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500 text-slate-900 dark:text-slate-100"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          aria-label="Run search"
          className="px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
        {searchResults !== null && (
          <button
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            aria-label="Clear search"
            className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            Clear
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{total} chunks total</span>
        <span>{sources.length} sources</span>
      </div>

      {/* Search Results */}
      {searchResults !== null ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-slate-500">
            Search Results ({searchResults.length})
          </h3>
          {searchResults.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No results found.</p>
          ) : (
            <div className="space-y-2" role="region" aria-label="Search results" tabIndex={0}>
              {searchResults.map((r, i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <FileText size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-500 truncate max-w-[300px]">{r.source}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-700 dark:text-reclaw-400">
                      {(r.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3">{r.text}</p>
                  {r.page !== null && r.page > 0 && (
                    <span className="text-[10px] text-slate-400 mt-1">Page {r.page}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Sources */}
          {sources.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Sources</h3>
              <div className="space-y-1" role="region" aria-label="Source files" tabIndex={0}>
                {sources.map((s) => (
                  <div key={s.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText size={14} className="text-slate-400 shrink-0" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400">{s.count} chunks</span>
                      <button
                        onClick={() => handleDeleteSource(s.name)}
                        aria-label={`Delete source ${s.name}`}
                        className="p-1 rounded text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chunks */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Chunks</h3>
            {loading ? (
              <p className="text-sm text-slate-400 py-4 text-center">Loading...</p>
            ) : chunks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                <Database size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500 mb-1">No chunks in knowledge base</p>
                <p className="text-xs text-slate-400">Upload files to populate the knowledge base</p>
              </div>
            ) : (
              <div className="space-y-2" role="region" aria-label="Memory chunks" tabIndex={0}>
                {chunks.map((c, i) => (
                  <div key={i} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 truncate max-w-[300px]">{c.source}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {c.chunk_type}
                        </span>
                      </div>
                      {c.confidence < 1.0 && (
                        <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                          {(c.confidence * 100).toFixed(0)}% conf
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{c.text}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                      {c.page > 0 && <span>Page {c.page}</span>}
                      {c.agent_id && <span>Agent: {c.agent_id}</span>}
                      {c.created_at > 0 && <span>{new Date(c.created_at * 1000).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Agent Memory Tab ----

function AgentMemoryTab({ projectId }: { projectId: string }) {
  const [agentList, setAgentList] = useState<AgentInfo[]>([]);
  const [notesByAgent, setNotesByAgent] = useState<Record<string, AgentNote[]>>({});
  const [loading, setLoading] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const data = await agentsApi.list(true);
        const agents: AgentInfo[] = (data.agents || data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
        }));
        setAgentList(agents);
      } catch (e) {
        console.error("Failed to fetch agents:", e);
      }
      setLoading(false);
    };
    fetchAgents();
  }, []);

  const fetchNotes = useCallback(async (agentId: string) => {
    if (notesByAgent[agentId]) return; // Already fetched
    try {
      const data = await memoryApi.agentNotes(projectId, agentId);
      setNotesByAgent((prev) => ({ ...prev, [agentId]: data.notes }));
    } catch (e) {
      console.error(`Failed to fetch notes for ${agentId}:`, e);
      setNotesByAgent((prev) => ({ ...prev, [agentId]: [] }));
    }
  }, [projectId, notesByAgent]);

  const toggleAgent = (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentId);
      fetchNotes(agentId);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400 py-8 text-center">Loading agents...</p>;
  }

  if (agentList.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
        <Users size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm text-slate-500 mb-1">No agents found</p>
        <p className="text-xs text-slate-400">Agent notes will appear here as agents work on tasks</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="region" aria-label="Agent memory notes" tabIndex={0}>
      {agentList.map((agent) => {
        const expanded = expandedAgent === agent.id;
        const notes = notesByAgent[agent.id];
        return (
          <div key={agent.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => toggleAgent(agent.id)}
              aria-label={`Toggle notes for ${agent.name}`}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-reclaw-100 dark:bg-reclaw-900/30 flex items-center justify-center text-reclaw-600 dark:text-reclaw-400 text-xs font-semibold">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{agent.name}</span>
                <p className="text-xs text-slate-500">{agent.id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {notes !== undefined && (
                  <span className="text-xs text-slate-400">{notes.length} notes</span>
                )}
                {expanded ? (
                  <ChevronLeft size={14} className="text-slate-400 rotate-[-90deg]" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400" />
                )}
              </div>
            </button>
            {expanded && (
              <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2">
                {notes === undefined ? (
                  <p className="text-xs text-slate-400">Loading notes...</p>
                ) : notes.length === 0 ? (
                  <p className="text-xs text-slate-400">No notes stored by this agent yet.</p>
                ) : (
                  notes.map((note, i) => (
                    <div key={i} className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.text}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{note.source}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Health Tab ----

function HealthTab({ projectId }: { projectId: string }) {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await memoryApi.stats(projectId);
      setStats(data);
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading && !stats) {
    return <p className="text-sm text-slate-400 py-8 text-center">Loading health data...</p>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="text-sm text-slate-500">{error}</p>
        <button
          onClick={fetchStats}
          aria-label="Retry loading health data"
          className="mt-3 px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const dimOk = stats.vector_dimensions > 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.vector_chunks}</p>
          <p className="text-xs text-slate-500">Vector Chunks</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.keyword_chunks}</p>
          <p className="text-xs text-slate-500">Keyword Chunks</p>
        </div>
      </div>

      {/* Embedding Config */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Embedding Configuration</h3>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Embedding Model</span>
            <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{stats.embedding_model}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Vector Dimensions</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                {stats.vector_dimensions || "N/A"}
              </span>
              {dimOk ? (
                <CheckCircle2 size={14} className="text-green-500" />
              ) : (
                <AlertTriangle size={14} className="text-yellow-500" />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Dimension Status</span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              dimOk
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            )}>
              {dimOk ? "OK" : "No data yet"}
            </span>
          </div>
        </div>
      </div>

      {/* Chunking Config */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Chunking Configuration</h3>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Chunk Size</span>
            <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{stats.chunk_size} chars</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Chunk Overlap</span>
            <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{stats.chunk_overlap} chars</span>
          </div>
        </div>
      </div>

      {/* Hybrid Search Weights */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Hybrid Search Weights</h3>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Vector Weight</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-reclaw-500"
                  style={{ width: `${stats.hybrid_weights.vector * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                {(stats.hybrid_weights.vector * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Keyword Weight</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${stats.hybrid_weights.keyword * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                {(stats.hybrid_weights.keyword * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sources Breakdown */}
      {stats.sources.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Sources ({stats.sources.length})</h3>
          <div className="space-y-1" role="region" aria-label="Source breakdown" tabIndex={0}>
            {stats.sources.map((s) => (
              <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800/50">
                <span className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[300px]">{s.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{s.chunk_count} chunks</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={fetchStats}
          disabled={loading}
          aria-label="Refresh health data"
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
    </div>
  );
}

// ---- Main View ----

export default function MemoryView() {
  const { activeProjectId } = useProjectStore();
  const [activeTab, setActiveTab] = useState<MemoryTab>("knowledge");

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Brain size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-sm text-slate-500">Select a project to view its memory</p>
        </div>
      </div>
    );
  }

  const tabs: { id: MemoryTab; label: string; icon: typeof Database }[] = [
    { id: "knowledge", label: "Knowledge Base", icon: Database },
    { id: "agent", label: "Agent Memory", icon: Users },
    { id: "health", label: "Health", icon: Activity },
    { id: "context-dag", label: "Context History", icon: GitBranch },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Brain size={20} className="text-reclaw-600" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Memory</h2>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={`Switch to ${tab.label} tab`}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors",
              activeTab === tab.id
                ? "bg-reclaw-100 text-reclaw-700 dark:bg-reclaw-900/30 dark:text-reclaw-400 font-medium"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4" role="region" aria-label="Memory content" tabIndex={0}>
        {activeTab === "knowledge" && <KnowledgeBaseTab projectId={activeProjectId} />}
        {activeTab === "agent" && <AgentMemoryTab projectId={activeProjectId} />}
        {activeTab === "health" && <HealthTab projectId={activeProjectId} />}
        {activeTab === "context-dag" && <ContextDAGView />}
      </div>
    </div>
  );
}
