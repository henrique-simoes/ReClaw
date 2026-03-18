"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import RightPanel from "@/components/layout/RightPanel";
import StatusBar from "@/components/layout/StatusBar";
import ChatView from "@/components/chat/ChatView";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import FindingsView from "@/components/findings/FindingsView";
import InterviewView from "@/components/interviews/InterviewView";
import MetricsView from "@/components/metrics/MetricsView";
import ContextEditor from "@/components/projects/ContextEditor";
import VersionHistory from "@/components/common/VersionHistory";
import SettingsView from "@/components/common/SettingsView";
import SkillsView from "@/components/skills/SkillsView";
import AgentsView from "@/components/agents/AgentsView";
import MemoryView from "@/components/memory/MemoryView";
import SearchModal from "@/components/common/SearchModal";
import ToastNotification from "@/components/common/ToastNotification";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import KeyboardShortcuts from "@/components/common/KeyboardShortcuts";
import MobileNav from "@/components/layout/MobileNav";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import OllamaCheck from "@/components/common/OllamaCheck";
import { useProjectStore } from "@/stores/projectStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useAgentStore } from "@/stores/agentStore";
import { settings as settingsApi } from "@/lib/api";

export default function HomeClient() {
  const [activeView, setActiveView] = useState("chat");
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { projects, fetchProjects } = useProjectStore();

  // Check LLM provider on mount
  useEffect(() => {
    settingsApi.status()
      .then((s) => {
        setLlmOk(s.services?.llm === "connected");
      })
      .catch(() => setLlmOk(false));
  }, []);

  // Check if first-run (no projects)
  useEffect(() => {
    fetchProjects().then(() => {
      const store = useProjectStore.getState();
      if (store.projects.length === 0) {
        setShowOnboarding(true);
      }
    });
  }, [fetchProjects]);

  // Handle reclaw:navigate events from AgentsView, ToastNotification, etc.
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string") {
        setActiveView(detail);
      } else if (detail?.view) {
        setActiveView(detail.view);
        // If navigating to chat with a specific agent, create/find a session for that agent
        if (detail.view === "chat") {
          const { sessions, createSession, selectSession, setPendingPrefill } = useSessionStore.getState();
          const { activeProjectId } = useProjectStore.getState();
          if (activeProjectId) {
            if (detail.agent_id) {
              const existing = sessions.find((s) => s.agent_id === detail.agent_id);
              if (existing) {
                selectSession(existing.id);
              } else {
                const agents = useAgentStore.getState().agents;
                const agent = agents.find((a) => a.id === detail.agent_id);
                await createSession(activeProjectId, `Chat with ${agent?.name || "Agent"}`, detail.agent_id);
              }
            }
            // If a prefill message was provided (e.g. from "Send to Agent"), queue it
            if (detail.prefill) {
              setPendingPrefill(detail.prefill);
            }
          }
        }
      }
    };
    window.addEventListener("reclaw:navigate", handler);
    return () => window.removeEventListener("reclaw:navigate", handler);
  }, []);

  // Global Cmd+K for search
  useEffect(() => {
    const viewKeys: Record<string, string> = { "1": "chat", "2": "findings", "3": "tasks", "4": "interviews", "5": "context", "6": "skills", "7": "agents", "8": "memory" };

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      // ⌘1-5 for view switching
      if ((e.metaKey || e.ctrlKey) && viewKeys[e.key]) {
        e.preventDefault();
        setActiveView(viewKeys[e.key]);
      }
      // ⌘. toggle right panel
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setRightPanelCollapsed((prev) => !prev);
      }
      // ? for shortcut help (when not typing)
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show LLM check if not connected
  if (llmOk === false) {
    return <OllamaCheck onRetry={() => {
      setLlmOk(null);
      settingsApi.status()
        .then((s) => setLlmOk(s.services?.llm === "connected"))
        .catch(() => setLlmOk(false));
    }} />;
  }

  const renderView = () => {
    switch (activeView) {
      case "chat": return <ChatView />;
      case "tasks": return <KanbanBoard />;
      case "findings": return <FindingsView />;
      case "interviews": return <InterviewView />;
      case "metrics": return <MetricsView />;
      case "context": return <ContextEditor />;
      case "skills": return <SkillsView />;
      case "agents": return <AgentsView />;
      case "memory": return <MemoryView />;
      case "history": return <VersionHistory />;
      case "settings": return <SettingsView />;
      default: return <ChatView />;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: hidden on mobile, visible on lg+ */}
        <div className="hidden lg:flex">
          <Sidebar
            activeView={activeView}
            onViewChange={setActiveView}
            onSearchOpen={() => setSearchOpen(true)}
          />
        </div>
        <main className="flex-1 flex flex-col overflow-hidden pb-14 lg:pb-0" id="main-content">
          <ErrorBoundary>
            {renderView()}
          </ErrorBoundary>
        </main>
        {/* Right panel: hidden on mobile */}
        <div className="hidden xl:flex">
          <RightPanel
            activeView={activeView}
            collapsed={rightPanelCollapsed}
            onToggle={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          />
        </div>
      </div>
      <div className="hidden lg:block">
        <StatusBar />
      </div>
      <MobileNav activeView={activeView} onViewChange={setActiveView} />
      <ToastNotification />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={setActiveView} />
      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
