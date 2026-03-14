"use client";

import { AlertTriangle } from "lucide-react";
import FocusTrap from "./FocusTrap";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const buttonColors = {
    danger: "bg-red-600 hover:bg-red-700 text-white",
    warning: "bg-amber-600 hover:bg-amber-700 text-white",
    default: "bg-reclaw-600 hover:bg-reclaw-700 text-white",
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <FocusTrap>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-sm w-full p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
              <p className="text-sm text-slate-500 mt-1">{message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={cn("px-4 py-2 text-sm rounded-lg font-medium", buttonColors[variant])}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
