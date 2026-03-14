"use client";

import { useEffect, useState } from "react";
import {
  X,
  Sparkles,
  FileText,
  Lightbulb,
  Target,
  LinkIcon,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { findings as findingsApi } from "@/lib/api";
import { cn, confidenceColor } from "@/lib/utils";

interface RightPanelProps {
  activeView: string;
  collapsed: boolean;
  onToggle: () => void;
}

export default function RightPanel({ activeView, collapsed, onToggle }: RightPanelProps) {
  const { activeProjectId } = useProjectStore();
  const [recentNuggets, setRecentNuggets] = useState<any[]>([]);
  const [recentInsights, setRecentInsights] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    if (!activeProjectId) return;

    findingsApi.nuggets(activeProjectId).then((n) => setRecentNuggets(n.slice(0, 5))).catch(() => {});
    findingsApi.insights(activeProjectId).then((i) => setRecentInsights(i.slice(0, 5))).catch(() => {});
    findingsApi.summary(activeProjectId).then(setSummary).catch(() => {});
  }, [activeProjectId]);

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="w-10 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
        title="Show panel"
      >
        <ChevronRight size={16} className="text-slate-400 rotate-180" />
      </button>
    );
  }

  const renderChatContext = () => (
    <div className="space-y-4">
      {/* Recent insights */}
      <Section title="💡 Recent Insights" count={recentInsights.length}>
        {recentInsights.length === 0 ? (
          <EmptyState text="No insights yet. Chat or run skills to generate findings." />
        ) : (
          recentInsights.map((insight) => (
            <FindingCard
              key={insight.id}
              text={insight.text}
              meta={`Confidence: ${Math.round(insight.confidence * 100)}%`}
              metaClass={confidenceColor(insight.confidence)}
            />
          ))
        )}
      </Section>

      {/* Recent nuggets */}
      <Section title="✨ Recent Nuggets" count={recentNuggets.length}>
        {recentNuggets.length === 0 ? (
          <EmptyState text="Upload files or run interview analysis to extract nuggets." />
        ) : (
          recentNuggets.map((nugget) => (
            <FindingCard
              key={nugget.id}
              text={nugget.text}
              meta={`📄 ${nugget.source.split("/").pop()}`}
            />
          ))
        )}
      </Section>

      {/* Project stats */}
      {summary && (
        <Section title="📊 Project Stats">
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Nuggets" value={summary.totals.nuggets} />
            <StatBox label="Facts" value={summary.totals.facts} />
            <StatBox label="Insights" value={summary.totals.insights} />
            <StatBox label="Recs" value={summary.totals.recommendations} />
          </div>
        </Section>
      )}
    </div>
  );

  const renderFindingsContext = () => (
    <div className="space-y-4">
      <Section title="🔗 Evidence Chain">
        <p className="text-xs text-slate-500">
          Click any insight in the main panel to see its full evidence chain:
          Recommendation → Insight → Facts → Nuggets → Sources
        </p>
      </Section>

      {summary && (
        <Section title="📊 Findings by Phase">
          {Object.entries(summary.by_phase).map(([phase, data]: [string, any]) => {
            const total = data.nuggets + data.facts + data.insights + data.recommendations;
            return (
              <div key={phase} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                  💎 {phase}
                </span>
                <span className="text-xs font-medium text-slate-900 dark:text-white">
                  {total} findings
                </span>
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );

  const renderTasksContext = () => (
    <div className="space-y-4">
      <Section title="🤖 Agent Status">
        <p className="text-xs text-slate-500">
          The agent automatically picks up tasks from your Kanban board and runs the
          appropriate skill. Add context to task cards to guide the agent.
        </p>
      </Section>

      <Section title="💡 Tips">
        <div className="space-y-2 text-xs text-slate-500">
          <p>• Name tasks with skill keywords: "Analyze interview transcripts"</p>
          <p>• Add user context to cards for better results</p>
          <p>• Tasks move to "In Review" when the agent finishes</p>
          <p>• Review and approve before moving to "Done"</p>
        </div>
      </Section>
    </div>
  );

  const renderContextContext = () => (
    <div className="space-y-4">
      <Section title="📚 How Context Works">
        <div className="space-y-3 text-xs text-slate-500">
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300">Layer 1: Agent Base</p>
            <p>ReClaw's core UXR expertise (always active)</p>
          </div>
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300">Layer 2: Company</p>
            <p>Product, culture, terminology, team norms</p>
          </div>
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300">Layer 3: Project</p>
            <p>Research questions, goals, timeline, users</p>
          </div>
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300">Layer 4: Task</p>
            <p>Per-task instructions from Kanban cards</p>
          </div>
        </div>
      </Section>
    </div>
  );

  const contextMap: Record<string, () => JSX.Element> = {
    chat: renderChatContext,
    findings: renderFindingsContext,
    tasks: renderTasksContext,
    context: renderContextContext,
    settings: renderChatContext,
  };

  return (
    <aside className="w-72 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-semibold uppercase text-slate-500">Context</span>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!activeProjectId ? (
          <EmptyState text="Select a project to see context." />
        ) : (
          (contextMap[activeView] || renderChatContext)()
        )}
      </div>
    </aside>
  );
}

// --- Sub-components ---

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
        {count !== undefined && (
          <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-500">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function FindingCard({
  text,
  meta,
  metaClass,
}: {
  text: string;
  meta?: string;
  metaClass?: string;
}) {
  return (
    <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-1.5">
      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3">{text}</p>
      {meta && (
        <p className={cn("text-[10px] mt-1", metaClass || "text-slate-400")}>{meta}</p>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-2 text-center border border-slate-200 dark:border-slate-700">
      <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-slate-400 text-center py-4">{text}</p>;
}
