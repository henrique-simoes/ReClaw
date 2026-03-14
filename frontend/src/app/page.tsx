"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import RightPanel from "@/components/layout/RightPanel";
import StatusBar from "@/components/layout/StatusBar";
import ChatView from "@/components/chat/ChatView";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import FindingsView from "@/components/findings/FindingsView";
import ContextEditor from "@/components/projects/ContextEditor";
import SettingsView from "@/components/common/SettingsView";
import ToastNotification from "@/components/common/ToastNotification";

export default function Home() {
  const [activeView, setActiveView] = useState("chat");
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const renderView = () => {
    switch (activeView) {
      case "chat":
        return <ChatView />;
      case "tasks":
        return <KanbanBoard />;
      case "findings":
        return <FindingsView />;
      case "context":
        return <ContextEditor />;
      case "settings":
        return <SettingsView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
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
    </div>
  );
}
