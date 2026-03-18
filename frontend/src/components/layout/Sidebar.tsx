"use client";

import { useEffect, useState } from "react";
import {
  FolderOpen,
  Plus,
  Diamond,
  Bot,
  Brain,
  LayoutDashboard,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings,
  History,
  BarChart3,
  Mic,
  MoreHorizontal,
  Wand2,
  Users,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import DarkModeToggle from "@/components/common/DarkModeToggle";
import { cn, phaseLabel } from "@/lib/utils";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onSearchOpen?: () => void;
}

export default function Sidebar({ activeView, onViewChange, onSearchOpen }: SidebarProps) {
  const {
    projects,
    activeProjectId,
    fetchProjects,
    setActiveProject,
    createProject,
  } = useProjectStore();
  const [collapsed, setCollapsed] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showSecondary, setShowSecondary] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName("");
    setShowNewProject(false);
  };

  // Primary nav: 5 items (simplified from 8)
  const primaryNav = [
    { id: "chat", icon: Bot, label: "Chat" },
    { id: "findings", icon: Diamond, label: "Findings" },
    { id: "tasks", icon: LayoutDashboard, label: "Tasks" },
    { id: "interviews", icon: Mic, label: "Interviews" },
    { id: "context", icon: FileText, label: "Context" },
    { id: "skills", icon: Wand2, label: "Skills" },
    { id: "agents", icon: Users, label: "Agents" },
    { id: "memory", icon: Brain, label: "Memory" },
  ];

  // Secondary nav: accessible via "More" or header icons
  const secondaryNav = [
    { id: "metrics", icon: BarChart3, label: "Metrics" },
    { id: "history", icon: History, label: "History" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      className={cn(
        "flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-xl">🐾</span>
            <span className="font-bold text-lg text-slate-900 dark:text-white">ReClaw</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Search */}
      {onSearchOpen && (
        <button
          onClick={onSearchOpen}
          aria-label="Search findings (Cmd+K)"
          className={cn(
            "flex items-center gap-2 mx-2 mt-2 rounded-lg transition-colors",
            collapsed
              ? "p-2 justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400"
              : "px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-400 text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
          )}
        >
          <Search size={14} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search...</span>
              <kbd className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">⌘K</kbd>
            </>
          )}
        </button>
      )}

      {/* Primary Navigation */}
      <nav className="p-2 space-y-0.5" aria-label="Views">
        <div role="tablist" aria-label="Main views">
          {primaryNav.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              role="tab"
              aria-selected={activeView === item.id}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                activeView === item.id
                  ? "bg-reclaw-100 text-reclaw-700 dark:bg-reclaw-900/30 dark:text-reclaw-400"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>

        {/* More toggle */}
        <button
          onClick={() => setShowSecondary(!showSecondary)}
          aria-label="More views"
          aria-expanded={showSecondary}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <MoreHorizontal size={18} />
          {!collapsed && <span>More</span>}
        </button>

        {/* Secondary nav (collapsible) */}
        {showSecondary && (
          <div role="tablist" aria-label="Secondary views">
            {secondaryNav.map((item) => (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                role="tab"
                aria-selected={activeView === item.id}
                aria-label={item.label}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                  collapsed ? "" : "pl-6",
                  activeView === item.id
                    ? "bg-reclaw-100 text-reclaw-700 dark:bg-reclaw-900/30 dark:text-reclaw-400"
                    : "text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <item.icon size={16} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Projects */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 border-t border-slate-200 dark:border-slate-800 mt-1" tabIndex={0} role="region" aria-label="Projects list">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Projects
            </span>
            <button
              onClick={() => setShowNewProject(!showNewProject)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              aria-label="Create new project"
            >
              <Plus size={14} />
            </button>
          </div>

          {showNewProject && (
            <div className="px-3 pb-2">
              <input
                type="text"
                placeholder="Project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-reclaw-500"
                aria-label="New project name"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-0.5" role="listbox" aria-label="Projects">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setActiveProject(project.id)}
                role="option"
                aria-selected={activeProjectId === project.id}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                  activeProjectId === project.id
                    ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <FolderOpen size={14} className="shrink-0" />
                <div className="text-left truncate">
                  <div className="truncate">{project.name}</div>
                  <div className="text-xs text-slate-400">{phaseLabel(project.phase)}</div>
                </div>
              </button>
            ))}
          </div>

          {projects.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-400 text-center">
              No projects yet. Create one to get started.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
