"use client";

import { useEffect, useState } from "react";
import {
  Diamond,
  ChevronDown,
  ChevronRight,
  FileText,
  Lightbulb,
  Target,
  Sparkles,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { findings as findingsApi } from "@/lib/api";
import type { FindingsSummary, Nugget, Fact, Insight, Recommendation, ProjectPhase } from "@/lib/types";
import { cn, confidenceColor, phaseLabel } from "@/lib/utils";
import AtomicDrilldown from "./AtomicDrilldown";

const PHASE_TABS: { id: ProjectPhase; label: string; icon: typeof Diamond }[] = [
  { id: "discover", label: "Discover", icon: Diamond },
  { id: "define", label: "Define", icon: Diamond },
  { id: "develop", label: "Develop", icon: Diamond },
  { id: "deliver", label: "Deliver", icon: Diamond },
];

export default function FindingsView() {
  const { activeProjectId } = useProjectStore();
  const [activePhase, setActivePhase] = useState<ProjectPhase>("discover");
  const [summary, setSummary] = useState<FindingsSummary | null>(null);
  const [nuggets, setNuggets] = useState<Nugget[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>("insights");
  const [drilldownFinding, setDrilldownFinding] = useState<{
    id: string;
    type: "recommendation" | "insight" | "fact" | "nugget";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;

    findingsApi.summary(activeProjectId).then(setSummary).catch(console.error);
    findingsApi.nuggets(activeProjectId).then(setNuggets).catch(console.error);
    findingsApi.facts(activeProjectId).then(setFacts).catch(console.error);
    findingsApi.insights(activeProjectId).then(setInsights).catch(console.error);
    findingsApi.recommendations(activeProjectId).then(setRecommendations).catch(console.error);
  }, [activeProjectId]);

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <p>Select a project to see findings.</p>
      </div>
    );
  }

  const phaseNuggets = nuggets.filter((n) => n.phase === activePhase);
  const phaseFacts = facts.filter((f) => f.phase === activePhase);
  const phaseInsights = insights.filter((i) => i.phase === activePhase);
  const phaseRecs = recommendations.filter((r) => r.phase === activePhase);
  const phaseStats = summary?.by_phase[activePhase];

  const sections = [
    {
      id: "insights",
      label: "Insights",
      icon: Lightbulb,
      count: phaseInsights.length,
      color: "text-yellow-600",
      items: phaseInsights,
    },
    {
      id: "recommendations",
      label: "Recommendations",
      icon: Target,
      count: phaseRecs.length,
      color: "text-green-600",
      items: phaseRecs,
    },
    {
      id: "facts",
      label: "Facts",
      icon: FileText,
      count: phaseFacts.length,
      color: "text-blue-600",
      items: phaseFacts,
    },
    {
      id: "nuggets",
      label: "Nuggets",
      icon: Sparkles,
      count: phaseNuggets.length,
      color: "text-purple-600",
      items: phaseNuggets,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          🔍 Findings
        </h2>

        {/* Phase tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {PHASE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePhase(tab.id)}
              className={cn(
                "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                activePhase === tab.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              💎 {tab.label}
              {phaseStats && (
                <span className="ml-1.5 text-xs text-slate-400">
                  ({(phaseStats.nuggets || 0) + (phaseStats.facts || 0) + (phaseStats.insights || 0) + (phaseStats.recommendations || 0)})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3 p-4">
          {[
            { label: "Nuggets", value: summary.totals.nuggets, emoji: "✨" },
            { label: "Facts", value: summary.totals.facts, emoji: "📄" },
            { label: "Insights", value: summary.totals.insights, emoji: "💡" },
            { label: "Recommendations", value: summary.totals.recommendations, emoji: "🎯" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center"
            >
              <span className="text-xl">{stat.emoji}</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div className="p-4 space-y-3">
        {sections.map((section) => (
          <div
            key={section.id}
            className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
          >
            {/* Section header */}
            <button
              onClick={() =>
                setExpandedSection(expandedSection === section.id ? null : section.id)
              }
              className="flex items-center justify-between w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSection === section.id ? (
                  <ChevronDown size={16} className="text-slate-400" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400" />
                )}
                <section.icon size={16} className={section.color} />
                <span className="font-medium text-sm text-slate-900 dark:text-white">
                  {section.label}
                </span>
                <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-500">
                  {section.count}
                </span>
              </div>
            </button>

            {/* Section content */}
            {expandedSection === section.id && (
              <div className="border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {section.items.length === 0 ? (
                  <p className="p-4 text-sm text-slate-400 text-center">
                    No {section.label.toLowerCase()} yet for this phase.
                  </p>
                ) : (
                  section.items.map((item: any) => (
                    <div
                      key={item.id}
                      onClick={() =>
                        setDrilldownFinding({
                          id: item.id,
                          type: section.id as any,
                          text: item.text,
                        })
                      }
                      className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer">
                      <p className="text-sm text-slate-900 dark:text-white">{item.text}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {item.confidence !== undefined && (
                          <span className={cn("text-xs", confidenceColor(item.confidence))}>
                            Confidence: {Math.round(item.confidence * 100)}%
                          </span>
                        )}
                        {item.impact && (
                          <span className="text-xs text-slate-500">
                            Impact: {item.impact}
                          </span>
                        )}
                        {item.priority && (
                          <span className="text-xs text-slate-500">
                            Priority: {item.priority}
                          </span>
                        )}
                        {item.source && (
                          <span className="text-xs text-slate-400">
                            📄 {item.source.split("/").pop()}
                          </span>
                        )}
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex gap-1">
                            {item.tags.map((tag: string, i: number) => (
                              <span
                                key={i}
                                className="text-xs bg-slate-200 dark:bg-slate-700 rounded px-1 py-0.5"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Atomic Research Drill-Down Modal */}
      {drilldownFinding && activeProjectId && (
        <AtomicDrilldown
          projectId={activeProjectId}
          finding={drilldownFinding}
          onClose={() => setDrilldownFinding(null)}
        />
      )}
    </div>
  );
}
