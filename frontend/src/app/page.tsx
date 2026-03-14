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

export default function Home() {
  const [activeView, setActiveView] = useState("chat");
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd+K for search (with proper cleanup)
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

  const renderView = () => {
    switch (activeView) {
      case "chat":
        return <ChatView />;
      case "tasks":
        return <KanbanBoard />;
      case "findings":
        return <FindingsView />;
      case "interviews":
        return <InterviewView />;
      case "metrics":
        return <MetricsView />;
      case "context":
        return <ContextEditor />;
      case "history":
        return <VersionHistory />;
      case "settings":
        return <SettingsView />;
      default:
        return <ChatView />;
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
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderView()}
        </main>
        <RightPanel
          activeView={activeView}
          collapsed={rightPanelCollapsed}
          onToggle={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        />
      </div>
      <StatusBar />
      <ToastNotification />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
