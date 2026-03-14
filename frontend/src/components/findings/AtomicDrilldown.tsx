"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Target,
  Lightbulb,
  FileText,
  Sparkles,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { findings as findingsApi } from "@/lib/api";
import { cn, confidenceColor } from "@/lib/utils";
import type { Nugget, Fact, Insight, Recommendation } from "@/lib/types";

interface AtomicDrilldownProps {
  projectId: string;
  /** The finding to drill into */
  finding: {
    id: string;
    type: "recommendation" | "insight" | "fact" | "nugget";
    text: string;
  };
  onClose: () => void;
}

export default function AtomicDrilldown({ projectId, finding, onClose }: AtomicDrilldownProps) {
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    findingsApi.nuggets(projectId).then(setNuggets).catch(() => {});
    findingsApi.facts(projectId).then(setFacts).catch(() => {});
    findingsApi.insights(projectId).then(setInsights).catch(() => {});
    findingsApi.recommendations(projectId).then(setRecommendations).catch(() => {});
  }, [projectId]);

  // Build the evidence chain based on finding type
  const chain = buildChain(finding, recommendations, insights, facts, nuggets);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Atomic Research — Evidence Chain
            </h3>
            <p className="text-xs text-slate-500">
              Trace from recommendations down to raw evidence
            </p>
          </div>
        </div>

        {/* Chain visualization */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-slate-400 mb-6">
            <span className="text-reclaw-600 font-medium">🎯 Recommendations</span>
            <ChevronRight size={12} />
            <span>💡 Insights</span>
            <ChevronRight size={12} />
            <span>📄 Facts</span>
            <ChevronRight size={12} />
            <span>✨ Nuggets</span>
            <ChevronRight size={12} />
            <span>📁 Sources</span>
          </div>

          {/* The selected finding (highlighted) */}
          <div className="mb-6">
            <ChainLevel
              icon={getIcon(finding.type)}
              label={finding.type.charAt(0).toUpperCase() + finding.type.slice(1)}
              color={getColor(finding.type)}
              highlighted
            >
              <div className="p-3 rounded-lg bg-reclaw-50 dark:bg-reclaw-900/20 border-2 border-reclaw-300 dark:border-reclaw-700">
                <p className="text-sm text-slate-900 dark:text-white font-medium">
                  {finding.text}
                </p>
              </div>
            </ChainLevel>
          </div>

          {/* Supporting evidence */}
          {chain.recommendations.length > 0 && finding.type !== "recommendation" && (
            <ChainLevel icon={Target} label="Recommendations" color="text-green-600">
              {chain.recommendations.map((r) => (
                <EvidenceCard key={r.id} text={r.text} badges={[r.priority, r.effort]} />
              ))}
            </ChainLevel>
          )}

          {chain.insights.length > 0 && finding.type !== "insight" && (
            <ChainLevel icon={Lightbulb} label="Insights" color="text-yellow-600">
              {chain.insights.map((i) => (
                <EvidenceCard
                  key={i.id}
                  text={i.text}
                  badges={[`${Math.round(i.confidence * 100)}% confidence`, i.impact]}
                />
              ))}
            </ChainLevel>
          )}

          {chain.facts.length > 0 && finding.type !== "fact" && (
            <ChainLevel icon={FileText} label="Facts" color="text-blue-600">
              {chain.facts.map((f) => (
                <EvidenceCard key={f.id} text={f.text} />
              ))}
            </ChainLevel>
          )}

          {chain.nuggets.length > 0 && finding.type !== "nugget" && (
            <ChainLevel icon={Sparkles} label="Nuggets (Raw Evidence)" color="text-purple-600">
              {chain.nuggets.map((n) => (
                <EvidenceCard
                  key={n.id}
                  text={n.text}
                  source={n.source}
                  sourceLocation={n.source_location}
                  tags={n.tags}
                />
              ))}
            </ChainLevel>
          )}

          {/* If we're at nugget level, show source */}
          {finding.type === "nugget" && (
            <ChainLevel icon={ExternalLink} label="Source" color="text-slate-600">
              {nuggets
                .filter((n) => n.id === finding.id)
                .map((n) => (
                  <div key={n.id} className="text-sm text-slate-600 dark:text-slate-400">
                    <p>
                      📁 <span className="font-mono">{n.source}</span>
                    </p>
                    {n.source_location && <p className="text-xs">@ {n.source_location}</p>}
                  </div>
                ))}
            </ChainLevel>
          )}

          {/* Empty state */}
          {chain.insights.length === 0 &&
            chain.facts.length === 0 &&
            chain.nuggets.length === 0 &&
            chain.recommendations.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">No linked evidence found yet.</p>
                <p className="text-xs mt-1">
                  As you run more skills, findings will be linked automatically.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function buildChain(
  finding: { id: string; type: string },
  recs: Recommendation[],
  insights: Insight[],
  facts: Fact[],
  nuggets: Nugget[]
) {
  // For now, show all findings at the project level
  // In a full implementation, these would be linked via IDs
  switch (finding.type) {
    case "recommendation":
      return { recommendations: [], insights: insights.slice(0, 5), facts: facts.slice(0, 5), nuggets: nuggets.slice(0, 8) };
    case "insight":
      return { recommendations: recs.slice(0, 3), insights: [], facts: facts.slice(0, 5), nuggets: nuggets.slice(0, 8) };
    case "fact":
      return { recommendations: [], insights: insights.slice(0, 3), facts: [], nuggets: nuggets.slice(0, 8) };
    case "nugget":
      return { recommendations: [], insights: [], facts: facts.slice(0, 3), nuggets: [] };
    default:
      return { recommendations: [], insights: [], facts: [], nuggets: [] };
  }
}

function getIcon(type: string) {
  switch (type) {
    case "recommendation": return Target;
    case "insight": return Lightbulb;
    case "fact": return FileText;
    case "nugget": return Sparkles;
    default: return FileText;
  }
}

function getColor(type: string) {
  switch (type) {
    case "recommendation": return "text-green-600";
    case "insight": return "text-yellow-600";
    case "fact": return "text-blue-600";
    case "nugget": return "text-purple-600";
    default: return "text-slate-600";
  }
}

function ChainLevel({
  icon: Icon,
  label,
  color,
  highlighted,
  children,
}: {
  icon: any;
  label: string;
  color: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mb-4", highlighted && "")}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", highlighted ? "bg-reclaw-100" : "bg-slate-100 dark:bg-slate-800")}>
          <Icon size={14} className={color} />
        </div>
        <h4 className={cn("text-xs font-semibold uppercase", color)}>{label}</h4>
      </div>
      <div className="ml-8 space-y-1.5">{children}</div>
    </div>
  );
}

function EvidenceCard({
  text,
  source,
  sourceLocation,
  badges,
  tags,
}: {
  text: string;
  source?: string;
  sourceLocation?: string;
  badges?: string[];
  tags?: string[];
}) {
  return (
    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <p className="text-xs text-slate-700 dark:text-slate-300">{text}</p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {source && (
          <span className="text-[10px] text-slate-400">
            📄 {source.split("/").pop()}
            {sourceLocation && ` @ ${sourceLocation}`}
          </span>
        )}
        {badges?.filter(Boolean).map((badge, i) => (
          <span
            key={i}
            className="text-[10px] bg-slate-100 dark:bg-slate-700 rounded px-1 py-0.5 text-slate-500"
          >
            {badge}
          </span>
        ))}
        {tags?.map((tag, i) => (
          <span
            key={i}
            className="text-[10px] bg-purple-100 dark:bg-purple-900/30 rounded px-1 py-0.5 text-purple-600 dark:text-purple-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
