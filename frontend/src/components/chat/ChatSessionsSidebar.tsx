"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Star, Trash2, Pencil, MoreHorizontal, MessageSquare, Bot } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { useAgentStore } from "@/stores/agentStore";
import { cn } from "@/lib/utils";

interface ChatSessionsSidebarProps {
  projectId: string;
}

export default function ChatSessionsSidebar({ projectId }: ChatSessionsSidebarProps) {
  const {
    sessions,
    activeSessionId,
    loading,
    fetchSessions,
    createSession,
    selectSession,
    toggleStar,
    renameSession,
    deleteSession,
  } = useSessionStore();
  const { agents } = useAgentStore();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSessions(projectId);
  }, [projectId, fetchSessions]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const handleNew = async () => {
    await createSession(projectId);
  };

  const handleRenameSubmit = async (id: string) => {
    if (renameValue.trim()) {
      await renameSession(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const starred = sessions.filter((s) => s.starred);
  const unstarred = sessions.filter((s) => !s.starred);

  const getAgentForSession = (agentId: string | null) => {
    if (!agentId) return null;
    return agents.find((a) => a.id === agentId);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderSession = (session: typeof sessions[0]) => {
    const agent = getAgentForSession(session.agent_id);
    const isActive = session.id === activeSessionId;
    const isRenaming = renamingId === session.id;

    return (
      <div
        key={session.id}
        onClick={() => !isRenaming && selectSession(session.id)}
        className={cn(
          "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
          isActive
            ? "bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-700 dark:text-reclaw-400"
            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        )}
      >
        {/* Agent avatar or default icon */}
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs">
          {agent ? (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: `hsl(${agent.name.length * 37 % 360}, 60%, 45%)` }}
              title={agent.name}
            >
              {agent.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <MessageSquare size={14} className="text-slate-400" />
          )}
        </div>

        {/* Title and time */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit(session.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="w-full text-xs bg-white dark:bg-slate-700 border border-reclaw-500 rounded px-1 py-0.5 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="text-xs font-medium truncate">{session.title}</p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {session.message_count > 0 ? `${session.message_count} msgs` : "Empty"}
            {session.last_message_at && ` · ${formatTime(session.last_message_at)}`}
          </p>
        </div>

        {/* Status + starred */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {session.starred && (
            <Star size={10} className="text-amber-400 fill-amber-400 opacity-100" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId(menuOpenId === session.id ? null : session.id);
            }}
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <MoreHorizontal size={12} className="text-slate-400" />
          </button>
        </div>

        {/* Dropdown menu */}
        {menuOpenId === session.id && (
          <div
            className="absolute right-2 mt-24 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[120px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setRenameValue(session.title);
                setRenamingId(session.id);
                setMenuOpenId(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <Pencil size={10} /> Rename
            </button>
            <button
              onClick={() => { toggleStar(session.id); setMenuOpenId(null); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <Star size={10} /> {session.starred ? "Unstar" : "Star"}
            </button>
            <button
              onClick={() => { if (confirm("Delete this chat?")) deleteSession(session.id); setMenuOpenId(null); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-red-500"
            >
              <Trash2 size={10} /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menuOpenId]);

  return (
    <div className="w-56 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-semibold text-slate-500 uppercase">Chats</h3>
        <button
          onClick={handleNew}
          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          title="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {loading && sessions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Loading...</p>
        ) : (
          <>
            {/* Starred */}
            {starred.length > 0 && (
              <>
                <p className="text-[10px] text-slate-400 uppercase px-2 pt-1 pb-0.5 font-semibold flex items-center gap-1">
                  <Star size={8} className="fill-amber-400 text-amber-400" /> Starred
                </p>
                {starred.map(renderSession)}
                <div className="border-b border-slate-200 dark:border-slate-700 my-1" />
              </>
            )}

            {/* Regular sessions */}
            {unstarred.map(renderSession)}

            {sessions.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare size={20} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">No chats yet</p>
                <button
                  onClick={handleNew}
                  className="mt-2 text-xs text-reclaw-600 hover:text-reclaw-700"
                >
                  Start a conversation
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
