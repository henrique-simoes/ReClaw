"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Loader2, StopCircle, Upload } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useProjectStore } from "@/stores/projectStore";
import { cn, formatDate } from "@/lib/utils";
import { files as filesApi } from "@/lib/api";
import { ChatSkeleton } from "@/components/common/LoadingSkeleton";

export default function ChatView() {
  const { messages, streaming, streamingContent, error, sendMessage, fetchHistory, cancelStreaming } = useChatStore();
  const { activeProjectId } = useProjectStore();
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProjectId) {
      setLoadingHistory(true);
      fetchHistory(activeProjectId).finally(() => setLoadingHistory(false));
    }
  }, [activeProjectId, fetchHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = () => {
    if (!input.trim() || !activeProjectId || streaming) return;
    sendMessage(activeProjectId, input.trim());
    setInput("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProjectId) return;

    try {
      const result = await filesApi.upload(activeProjectId, file);
      // Show confirmation in chat
      await sendMessage(
        activeProjectId,
        `I just uploaded "${file.name}" (${result.chunks_indexed} chunks indexed). Can you analyze it?`
      );
    } catch (err) {
      console.error("Upload failed:", err);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <span className="text-4xl block mb-4">🐾</span>
          <p className="text-lg">Select or create a project to start</p>
        </div>
      </div>
    );
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!activeProjectId) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const result = await filesApi.upload(activeProjectId, file);
      await sendMessage(activeProjectId, `I just uploaded "${file.name}" (${result.chunks_indexed} chunks indexed). Can you analyze it?`);
    } catch (err) {
      console.error("Drop upload failed:", err);
    }
  };

  return (
    <div
      className={cn("flex-1 flex flex-col", dragOver && "ring-2 ring-reclaw-500 ring-inset bg-reclaw-50/50 dark:bg-reclaw-900/10")}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-reclaw-50/80 dark:bg-reclaw-900/80 pointer-events-none">
          <div className="text-center">
            <Upload size={40} className="mx-auto text-reclaw-500 mb-2" />
            <p className="text-reclaw-700 dark:text-reclaw-400 font-medium">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center max-w-md">
              <span className="text-4xl block mb-4">🐾</span>
              <p className="text-lg mb-2">Ready to research!</p>
              <p className="text-sm">
                Upload interview transcripts, ask research questions, or drop files to get started.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "message-enter max-w-3xl",
              msg.role === "user" ? "ml-auto" : "mr-auto"
            )}
          >
            <div
              className={cn(
                "rounded-2xl px-4 py-3",
                msg.role === "user"
                  ? "bg-reclaw-600 text-white rounded-br-md"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md"
              )}
            >
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Sources:</p>
                  {msg.sources.map((src, i) => (
                    <span
                      key={i}
                      className="inline-block text-xs bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5 mr-1 mb-1"
                    >
                      📄 {src.source.split("/").pop()} ({Math.round(src.score * 100)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 px-1">
              {formatDate(msg.created_at)}
            </p>
          </div>
        ))}

        {/* Streaming response */}
        {streaming && streamingContent && (
          <div className="mr-auto max-w-3xl message-enter">
            <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
              <div className="whitespace-pre-wrap text-sm streaming-cursor">
                {streamingContent}
              </div>
            </div>
          </div>
        )}

        {streaming && !streamingContent && (
          <div className="mr-auto flex items-center gap-2 text-slate-400 px-4">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Thinking...</span>
            <button
              onClick={cancelStreaming}
              className="ml-2 flex items-center gap-1 text-xs text-red-400 hover:text-red-500"
              aria-label="Cancel response"
            >
              <StopCircle size={12} /> Cancel
            </button>
          </div>
        )}

        {streaming && streamingContent && (
          <div className="flex justify-center">
            <button
              onClick={cancelStreaming}
              className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 hover:text-red-500 bg-red-50 dark:bg-red-900/20 rounded-full"
              aria-label="Stop generating"
            >
              <StopCircle size={12} /> Stop generating
            </button>
          </div>
        )}

        {error && (
          <div className="mr-auto max-w-3xl">
            <div className="rounded-2xl px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              ⚠️ {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.csv,.md"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Upload file"
          >
            <Paperclip size={20} />
          </button>

          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your research, or drop files here..."
              rows={1}
              className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-reclaw-500 focus:border-transparent"
              style={{ minHeight: "44px", maxHeight: "120px" }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            aria-label="Send message"
            className={cn(
              "p-2.5 rounded-lg transition-colors",
              input.trim() && !streaming
                ? "bg-reclaw-600 text-white hover:bg-reclaw-700"
                : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
            )}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
