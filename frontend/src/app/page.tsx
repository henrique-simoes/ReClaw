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
import SearchModal from "@/components/common/SearchModal";
import ToastNotification from "@/components/common/ToastNotification";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import OllamaCheck from "@/components/common/OllamaCheck";
import { useProjectStore } from "@/stores/projectStore";
import { settings as settingsApi } from "@/lib/api";

export default function Home() {
  const [activeView, setActiveView] = useState("chat");
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null); // null = checking
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { projects, fetchProjects } = useProjectStore();

  // Check Ollama on mount
  useEffect(() => {
    settingsApi.status()
      .then((s) => {
        setOllamaOk(s.services?.ollama === "connected");
      })
      .catch(() => setOllamaOk(false));
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

  // Global Cmd+K for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show Ollama check if not connected
  if (ollamaOk === false) {
    return <OllamaCheck onRetry={() => {
      setOllamaOk(null);
      settingsApi.status()
        .then((s) => setOllamaOk(s.services?.ollama === "connected"))
        .catch(() => setOllamaOk(false));
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
      case "history": return <VersionHistory />;
      case "settings": return <SettingsView />;
      default: return <ChatView />;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          onSearchOpen={() => setSearchOpen(true)}
        />
        <main className="flex-1 flex flex-col overflow-hidden" id="main-content">
          <ErrorBoundary>
            {renderView()}
          </ErrorBoundary>
        </main>
        <RightPanel
          activeView={activeView}
          collapsed={rightPanelCollapsed}
          onToggle={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        />
      </div>
      <StatusBar />
      <ToastNotification />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={setActiveView} />
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
