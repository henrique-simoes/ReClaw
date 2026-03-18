"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitBranch,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  MessageSquare,
  Clock,
  Zap,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { contextDag } from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import type { DAGNode, DAGHealth, DAGExpandResult, DAGGrepResult } from "@/lib/types";

// --- DAG Tree Node ---

interface DAGTreeNodeProps {
  node: DAGNode;
  onExpand: (nodeId: string) => void;
  expanded: boolean;
  expandedContent: DAGExpandResult | null;
  expandingNodeId: string | null;
}

function DAGTreeNode({
  node,
  onExpand,
  expanded,
  expandedContent,
  expandingNodeId,
}: DAGTreeNodeProps) {
  const isLoading = expandingNodeId === node.id;
  const truncatedSummary =
    node.summary_text.length > 200
      ? node.summary_text.slice(0, 200) + "..."
      : node.summary_text;

  const formatTimeRange = (start: string, end: string) => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const fmt = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${fmt.format(s)} - ${fmt.format(e)}`;
    } catch {
      return `${start} - ${end}`;
    }
  };

  const depthColors: Record<number, string> = {
    0: "bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-700 dark:text-reclaw-400",
    1: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    2: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
    3: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  };

  const depthColor =
    depthColors[node.depth] ||
    "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400";

  return (
    <div
      role="treeitem"
      aria-expanded={expanded}
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden"
    >
      <button
        onClick={() => onExpand(node.id)}
        aria-label={`${expanded ? "Collapse" : "Expand"} DAG node at depth ${node.depth}: ${truncatedSummary.slice(0, 60)}`}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
      >
        <div className="shrink-0 mt-0.5">
          {expanded ? (
            <ChevronDown size={14} className="text-slate-400" />
          ) : (
            <ChevronRight size={14} className="text-slate-400" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                depthColor
              )}
            >
              L{node.depth}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <MessageSquare size={10} />
              {node.message_count} msgs
            </span>
            <span className="text-[10px] text-slate-400">
              {node.token_count.toLocaleString()} tokens
            </span>
            {node.original_token_count > node.token_count && (
              <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                <Zap size={10} />
                {(
                  ((node.original_token_count - node.token_count) /
                    node.original_token_count) *
                  100
                ).toFixed(0)}
                % saved
              </span>
            )}
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3">
            {truncatedSummary}
          </p>

          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock size={10} />
            {formatTimeRange(node.time_range_start, node.time_range_end)}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <RefreshCw size={12} className="animate-spin text-slate-400" />
              <span className="text-xs text-slate-400">Loading content...</span>
            </div>
          ) : expandedContent ? (
            <div
              className="space-y-2 max-h-80 overflow-y-auto"
              role="region"
              aria-label={`Expanded content for node L${node.depth}`}
              tabIndex={0}
            >
              {expandedContent.items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-2 rounded-lg text-xs",
                    item.type === "summary"
                      ? "bg-reclaw-50 dark:bg-reclaw-900/20 border border-reclaw-200 dark:border-reclaw-800"
                      : "bg-slate-50 dark:bg-slate-800/80"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {item.role && (
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          item.role === "user"
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                            : item.role === "assistant"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {item.role}
                      </span>
                    )}
                    {item.type === "summary" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-600 dark:text-reclaw-400">
                        summary
                      </span>
                    )}
                    {item.created_at && (
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(item.created_at))}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>
              ))}
              {expandedContent.items.length === 0 && (
                <p className="text-xs text-slate-400 py-2 text-center">
                  No content in this node.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-2 text-center">
              Click to load content.
            </p>
          )}

          {node.child_node_ids.length > 0 && (
            <p className="text-[10px] text-slate-400 pt-1">
              {node.child_node_ids.length} child node
              {node.child_node_ids.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function ContextDAGView() {
  const { activeProjectId } = useProjectStore();
  const { sessions, activeSessionId, fetchSessions, selectSession } =
    useSessionStore();

  const [nodes, setNodes] = useState<DAGNode[]>([]);
  const [health, setHealth] = useState<DAGHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [expandedContent, setExpandedContent] = useState<
    Record<string, DAGExpandResult>
  >({});
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DAGGrepResult | null>(
    null
  );
  const [searching, setSearching] = useState(false);

  // Ensure sessions are loaded
  useEffect(() => {
    if (activeProjectId) {
      fetchSessions(activeProjectId);
    }
  }, [activeProjectId, fetchSessions]);

  // Fetch DAG structure when session changes
  const fetchDAG = useCallback(async () => {
    if (!activeSessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await contextDag.getStructure(activeSessionId);
      setNodes(data.nodes);
      setHealth(data.stats);
    } catch (e: any) {
      setError(e.message || "Failed to load context DAG");
      setNodes([]);
      setHealth(null);
    }
    setLoading(false);
  }, [activeSessionId]);

  useEffect(() => {
    fetchDAG();
    // Reset local state when session changes
    setExpandedNodes(new Set());
    setExpandedContent({});
    setSearchResults(null);
    setSearchQuery("");
  }, [fetchDAG]);

  const handleExpand = useCallback(
    async (nodeId: string) => {
      if (expandedNodes.has(nodeId)) {
        setExpandedNodes((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
        return;
      }

      setExpandedNodes((prev) => new Set(prev).add(nodeId));

      // Only fetch if we don't already have the content
      if (!expandedContent[nodeId] && activeSessionId) {
        setExpandingNodeId(nodeId);
        try {
          const result = await contextDag.expand(activeSessionId, nodeId);
          setExpandedContent((prev) => ({ ...prev, [nodeId]: result }));
        } catch (e) {
          console.error("Failed to expand node:", e);
        }
        setExpandingNodeId(null);
      }
    },
    [expandedNodes, expandedContent, activeSessionId]
  );

  const handleSearch = async () => {
    if (!searchQuery.trim() || !activeSessionId) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await contextDag.grep(activeSessionId, searchQuery);
      setSearchResults(results);
    } catch (e) {
      console.error("DAG grep failed:", e);
    }
    setSearching(false);
  };

  const handleCompact = async () => {
    if (!activeSessionId) return;
    try {
      await contextDag.compact(activeSessionId);
      fetchDAG();
    } catch (e) {
      console.error("Compact failed:", e);
    }
  };

  // Group nodes by depth for tree rendering
  const nodesByDepth: Record<number, DAGNode[]> = {};
  for (const node of nodes) {
    if (!nodesByDepth[node.depth]) {
      nodesByDepth[node.depth] = [];
    }
    nodesByDepth[node.depth].push(node);
  }
  const sortedDepths = Object.keys(nodesByDepth)
    .map(Number)
    .sort((a, b) => a - b);

  // No active session
  if (!activeSessionId) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <GitBranch
          size={48}
          className="text-slate-300 dark:text-slate-600 mb-4"
        />
        <p className="text-sm text-slate-500">
          Select a chat session to view context history
        </p>
        {activeProjectId && sessions.length > 0 && (
          <div className="mt-4">
            <select
              value=""
              onChange={(e) => selectSession(e.target.value)}
              aria-label="Select chat session"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-reclaw-500"
            >
              <option value="" disabled>
                Choose a session...
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "Untitled"} ({s.message_count} messages)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session Selector */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="dag-session-select"
          className="text-xs font-medium text-slate-500 shrink-0"
        >
          Session:
        </label>
        <select
          id="dag-session-select"
          value={activeSessionId}
          onChange={(e) => selectSession(e.target.value)}
          aria-label="Select chat session"
          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-reclaw-500 truncate"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title || "Untitled"} ({s.message_count} msgs)
            </option>
          ))}
        </select>
        <button
          onClick={fetchDAG}
          disabled={loading}
          aria-label="Refresh DAG data"
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center py-8">
          <AlertTriangle
            size={32}
            className="mx-auto text-yellow-500 mb-3"
          />
          <p className="text-sm text-slate-500">{error}</p>
          <button
            onClick={fetchDAG}
            aria-label="Retry loading DAG data"
            className="mt-3 px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !health && (
        <p className="text-sm text-slate-400 py-8 text-center">
          Loading context history...
        </p>
      )}

      {/* Health Dashboard */}
      {health && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">
            DAG Health
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {health.total_messages}
              </p>
              <p className="text-[10px] text-slate-500">Total Messages</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {health.compacted_messages}
              </p>
              <p className="text-[10px] text-slate-500">Compacted</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {health.fresh_tail_size}
              </p>
              <p className="text-[10px] text-slate-500">Fresh Tail</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
              <p className="text-lg font-bold text-reclaw-600 dark:text-reclaw-400">
                {(health.compression_ratio * 100).toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-500">Compression</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {health.max_depth}
              </p>
              <p className="text-[10px] text-slate-500">Max Depth</p>
            </div>
          </div>

          {/* Compact button */}
          {health.dag_enabled && health.fresh_tail_size > 0 && (
            <div className="flex justify-end mt-2">
              <button
                onClick={handleCompact}
                aria-label="Compact conversation history"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-reclaw-600 dark:text-reclaw-400 hover:bg-reclaw-50 dark:hover:bg-reclaw-900/20 rounded-lg transition-colors"
              >
                <Layers size={12} />
                Compact Now
              </button>
            </div>
          )}

          {!health.dag_enabled && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
              DAG compaction is not enabled for this session.
            </p>
          )}
        </div>
      )}

      {/* History Search */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">
          History Search
        </h3>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search conversation history..."
              aria-label="Search conversation history"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500 text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            aria-label="Run history search"
            className="px-4 py-2 text-sm bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
          {searchResults !== null && (
            <button
              onClick={() => {
                setSearchResults(null);
                setSearchQuery("");
              }}
              aria-label="Clear search results"
              className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Clear
            </button>
          )}
        </div>

        {/* Search Results */}
        {searchResults !== null && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              {searchResults.results.length} result
              {searchResults.results.length !== 1 ? "s" : ""} for &quot;
              {searchResults.query}&quot;
            </p>
            {searchResults.results.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No results found.
              </p>
            ) : (
              <div
                className="space-y-2 max-h-64 overflow-y-auto"
                role="region"
                aria-label="Search results"
                tabIndex={0}
              >
                {searchResults.results.map((r, i) => (
                  <div
                    key={`${r.message_id}-${i}`}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          r.role === "user"
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                            : r.role === "assistant"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {r.role}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(r.created_at))}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3">
                      {r.content_excerpt}
                    </p>
                    {r.dag_node_id && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Node: {r.dag_node_id.slice(0, 8)}...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DAG Tree */}
      {!loading && nodes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">
            DAG Tree ({nodes.length} node{nodes.length !== 1 ? "s" : ""})
          </h3>
          <div role="tree" aria-label="Context DAG tree" className="space-y-4">
            {sortedDepths.map((depth) => (
              <div key={depth} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Layers size={12} className="text-slate-400" />
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    Depth {depth} ({nodesByDepth[depth].length} node
                    {nodesByDepth[depth].length !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="space-y-2 pl-4">
                  {nodesByDepth[depth].map((node) => (
                    <DAGTreeNode
                      key={node.id}
                      node={node}
                      onExpand={handleExpand}
                      expanded={expandedNodes.has(node.id)}
                      expandedContent={expandedContent[node.id] || null}
                      expandingNodeId={expandingNodeId}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && nodes.length === 0 && health && (
        <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
          <GitBranch
            size={32}
            className="mx-auto text-slate-300 dark:text-slate-600 mb-3"
          />
          <p className="text-sm text-slate-500 mb-1">
            No DAG nodes yet
          </p>
          <p className="text-xs text-slate-400">
            Context will be compacted into a DAG as the conversation grows
          </p>
        </div>
      )}
    </div>
  );
}
