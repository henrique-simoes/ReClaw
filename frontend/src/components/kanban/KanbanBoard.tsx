"use client";

import { useEffect, useState } from "react";
import { Plus, GripVertical, Bot, User, Trash2 } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";
import { useProjectStore } from "@/stores/projectStore";
import type { TaskStatus } from "@/lib/types";
import { cn, statusLabel } from "@/lib/utils";
import ConfirmDialog from "@/components/common/ConfirmDialog";

const COLUMNS: { id: TaskStatus; color: string }[] = [
  { id: "backlog", color: "border-t-slate-400" },
  { id: "in_progress", color: "border-t-blue-500" },
  { id: "in_review", color: "border-t-yellow-500" },
  { id: "done", color: "border-t-green-500" },
];

export default function KanbanBoard() {
  const { tasks, fetchTasks, createTask, moveTask, deleteTask } = useTaskStore();
  const { activeProjectId } = useProjectStore();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTo, setAddingTo] = useState<TaskStatus | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (activeProjectId) {
      fetchTasks(activeProjectId);
    }
  }, [activeProjectId, fetchTasks]);

  const handleCreate = async (status: TaskStatus) => {
    if (!newTaskTitle.trim() || !activeProjectId) return;
    await createTask(activeProjectId, newTaskTitle.trim());
    // If not backlog, move to the right column
    if (status !== "backlog") {
      const allTasks = useTaskStore.getState().tasks;
      const latest = allTasks[allTasks.length - 1];
      if (latest) await moveTask(latest.id, status);
    }
    setNewTaskTitle("");
    setAddingTo(null);
  };

  const handleDrop = async (taskId: string, newStatus: TaskStatus) => {
    await moveTask(taskId, newStatus);
  };

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <p>Select a project to see tasks.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto p-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📋 Tasks</h2>

      <div className="flex gap-4 min-w-max">
        {COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.id);

          return (
            <div
              key={col.id}
              className={cn(
                "w-72 flex-shrink-0 rounded-lg bg-slate-50 dark:bg-slate-900 border-t-4",
                col.color
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("taskId");
                if (taskId) handleDrop(taskId, col.id);
              }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between p-3 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm text-slate-700 dark:text-slate-300">
                    {statusLabel(col.id)}
                  </h3>
                  <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-500">
                    {columnTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => setAddingTo(addingTo === col.id ? null : col.id)}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* New task input */}
              {addingTo === col.id && (
                <div className="px-3 pb-2">
                  <input
                    type="text"
                    placeholder="Task title..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate(col.id);
                      if (e.key === "Escape") setAddingTo(null);
                    }}
                    className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-reclaw-500"
                    autoFocus
                  />
                </div>
              )}

              {/* Task cards */}
              <div className="p-2 space-y-2 min-h-[100px]">
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="text-slate-300 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {task.title}
                        </p>

                        {task.skill_name && (
                          <span className="inline-block text-xs bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-700 dark:text-reclaw-400 rounded px-1.5 py-0.5 mt-1">
                            {task.skill_name}
                          </span>
                        )}

                        {task.progress > 0 && task.progress < 1 && (
                          <div className="mt-2">
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                              <div
                                className="bg-reclaw-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${task.progress * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 mt-0.5">
                              {Math.round(task.progress * 100)}%
                            </span>
                          </div>
                        )}

                        {/* Expanded details */}
                        {expandedTask === task.id && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-2">
                            {task.description && (
                              <p className="text-xs text-slate-500">{task.description}</p>
                            )}
                            {task.agent_notes && (
                              <div className="text-xs">
                                <span className="flex items-center gap-1 text-slate-400 mb-0.5">
                                  <Bot size={10} /> Agent notes
                                </span>
                                <p className="text-slate-600 dark:text-slate-300">
                                  {task.agent_notes}
                                </p>
                              </div>
                            )}
                            {task.user_context && (
                              <div className="text-xs">
                                <span className="flex items-center gap-1 text-slate-400 mb-0.5">
                                  <User size={10} /> Your context
                                </span>
                                <p className="text-slate-600 dark:text-slate-300">
                                  {task.user_context}
                                </p>
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(task.id);
                              }}
                              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                            >
                              <Trash2 size={10} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirm) deleteTask(deleteConfirm);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
