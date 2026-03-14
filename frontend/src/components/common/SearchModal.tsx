"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, Sparkles, FileText, Lightbulb, Target, Loader2 } from "lucide-react";
import FocusTrap from "./FocusTrap";
import { useProjectStore } from "@/stores/projectStore";
import { findings as findingsApi } from "@/lib/api";
import { cn, confidenceColor } from "@/lib/utils";

interface SearchResult {
  type: "nugget" | "fact" | "insight" | "recommendation";
  text: string;
  source?: string;
  confidence?: number;
  phase?: string;
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (view: string) => void;
}

const TYPE_ICONS = {
  nugget: Sparkles,
  fact: FileText,
  insight: Lightbulb,
  recommendation: Target,
};

const TYPE_COLORS = {
  nugget: "text-purple-600",
  fact: "text-blue-600",
  insight: "text-yellow-600",
  recommendation: "text-green-600",
};

export default function SearchModal({ open, onClose, onNavigate }: SearchModalProps) {
  const { activeProjectId } = useProjectStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else if (!open) {
          // Parent needs to handle opening
        }
      }
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSearch = async () => {
    if (!query.trim() || !activeProjectId) return;
    setSearching(true);

    try {
      // Search across all finding types
      const [nuggets, facts, insights, recs] = await Promise.all([
        findingsApi.nuggets(activeProjectId),
        findingsApi.facts(activeProjectId),
        findingsApi.insights(activeProjectId),
        findingsApi.recommendations(activeProjectId),
      ]);

      const q = query.toLowerCase();
      const matched: SearchResult[] = [];

      nuggets.forEach((n: any) => {
        if (n.text.toLowerCase().includes(q) || (n.tags || []).some((t: string) => t.toLowerCase().includes(q))) {
          matched.push({ type: "nugget", text: n.text, source: n.source, confidence: n.confidence, phase: n.phase });
        }
      });

      facts.forEach((f: any) => {
        if (f.text.toLowerCase().includes(q)) {
          matched.push({ type: "fact", text: f.text, confidence: f.confidence, phase: f.phase });
        }
      });

      insights.forEach((i: any) => {
        if (i.text.toLowerCase().includes(q)) {
          matched.push({ type: "insight", text: i.text, confidence: i.confidence, phase: i.phase });
        }
      });

      recs.forEach((r: any) => {
        if (r.text.toLowerCase().includes(q)) {
          matched.push({ type: "recommendation", text: r.text, phase: r.phase });
        }
      });

      setResults(matched);
    } catch (e) {
      console.error("Search failed:", e);
    }
    setSearching(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]">
      <FocusTrap>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <Search size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search findings, nuggets, insights..."
            className="flex-1 bg-transparent text-slate-900 dark:text-white text-sm focus:outline-none placeholder:text-slate-400"
          />
          {searching && <Loader2 size={16} className="animate-spin text-slate-400" />}
          <kbd className="hidden sm:block text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
            ESC
          </kbd>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {results.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((result, i) => {
                const Icon = TYPE_ICONS[result.type];
                const color = TYPE_COLORS[result.type];
                return (
                  <div
                    key={i}
                    onClick={() => { onNavigate?.("findings"); onClose(); }}
                    className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    <Icon size={16} className={cn("shrink-0 mt-0.5", color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                        {highlightMatch(result.text, query)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("text-[10px] capitalize", color)}>
                          {result.type}
                        </span>
                        {result.phase && (
                          <span className="text-[10px] text-slate-400 capitalize">
                            💎 {result.phase}
                          </span>
                        )}
                        {result.source && (
                          <span className="text-[10px] text-slate-400">
                            📄 {result.source.split("/").pop()}
                          </span>
                        )}
                        {result.confidence !== undefined && (
                          <span className={cn("text-[10px]", confidenceColor(result.confidence))}>
                            {Math.round(result.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : query && !searching ? (
            <div className="p-8 text-center text-slate-400">
              <p className="text-sm">No results for "{query}"</p>
              <p className="text-xs mt-1">Try different keywords or run more research skills.</p>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">
              <p className="text-sm">Search across all findings in this project</p>
              <p className="text-xs mt-1">
                Nuggets, facts, insights, and recommendations
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400">
          <span>↵ Search</span>
          <span>ESC Close</span>
          <span>⌘K Toggle</span>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
