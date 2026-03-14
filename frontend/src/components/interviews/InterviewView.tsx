"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Mic,
  Tag,
  Sparkles,
  Upload,
  FileText,
  Clock,
  Play,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { files as filesApi, findings as findingsApi, chat as chatApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ApiError } from "@/hooks/useApiCall";

interface TranscriptSegment {
  timestamp: string;
  speaker: string;
  text: string;
  highlighted: boolean;
}

export default function InterviewView() {
  const { activeProjectId } = useProjectStore();
  const [projectFiles, setProjectFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [nuggets, setNuggets] = useState<any[]>([]);
  const [tags, setTags] = useState<Record<string, number>>({});
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProjectData = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const [fileResult, nuggetResult] = await Promise.all([
        filesApi.list(activeProjectId),
        findingsApi.nuggets(activeProjectId),
      ]);
      setProjectFiles(fileResult.files || []);
      setNuggets(nuggetResult);

      // Build tag counts
      const tagCounts: Record<string, number> = {};
      nuggetResult.forEach((nug: any) => {
        (nug.tags || []).forEach((t: string) => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      });
      setTags(tagCounts);
    } catch (e: any) {
      setError(e.message || "Failed to load project data");
    }
    setLoading(false);
  }, [activeProjectId]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  useEffect(() => {
    if (!transcriptText) { setSegments([]); return; }
    setSegments(parseTranscript(transcriptText));
  }, [transcriptText]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !activeProjectId) return;
    setError(null);

    for (const file of Array.from(fileList)) {
      try {
        await filesApi.upload(activeProjectId, file);
      } catch (err: any) {
        setError(`Upload failed: ${err.message}`);
      }
    }
    await loadProjectData();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (filename: string) => {
    setSelectedFile(filename);
    // For now show the filename — actual content loading needs a file content API
    setTranscriptText(`[Loading transcript: ${filename}]\n\nTo analyze this file, click "Analyze" below or type in chat:\n"analyze the interview transcript ${filename}"`);
  };

  const handleAnalyze = async () => {
    if (!activeProjectId || !selectedFile) return;
    setAnalyzing(true);
    setAnalysisResult("");
    setError(null);

    try {
      // Use the chat API with skill intent to trigger analysis
      let result = "";
      for await (const event of chatApi.send(activeProjectId, `analyze the interview transcript ${selectedFile}`)) {
        if (event.type === "chunk") {
          result += event.content;
          setAnalysisResult(result);
        } else if (event.type === "error") {
          setError(event.message);
        }
      }

      // Refresh nuggets after analysis
      await loadProjectData();
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    }
    setAnalyzing(false);
  };

  const handleBatchAnalyze = async () => {
    if (!activeProjectId || projectFiles.length === 0) return;
    setAnalyzing(true);
    setAnalysisResult("");
    setError(null);

    try {
      let result = "";
      for await (const event of chatApi.send(activeProjectId, `analyze all interview transcripts in this project`)) {
        if (event.type === "chunk") {
          result += event.content;
          setAnalysisResult(result);
        }
      }
      await loadProjectData();
    } catch (e: any) {
      setError(e.message || "Batch analysis failed");
    }
    setAnalyzing(false);
  };

  const filteredNuggets = activeTag
    ? nuggets.filter((n) => (n.tags || []).includes(activeTag))
    : nuggets;

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <p>Select a project to view interviews.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Transcript */}
      <div className="flex-1 flex flex-col border-r border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Mic size={16} className="text-reclaw-600" />
            🎙️ Interviews & Transcripts
          </h2>
          <div className="flex items-center gap-2">
            {projectFiles.length > 0 && (
              <button
                onClick={handleBatchAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-200 disabled:opacity-50"
              >
                {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Analyze All
              </button>
            )}
            <input ref={fileInputRef} type="file" multiple className="hidden" accept=".txt,.pdf,.docx,.md,.csv" onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700"
            >
              <Upload size={12} /> Upload
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3">
            <ApiError error={error} onRetry={loadProjectData} />
          </div>
        )}

        {/* File tabs */}
        {projectFiles.length > 0 && (
          <div className="flex gap-1 p-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            {projectFiles.map((f) => (
              <button
                key={f.name}
                onClick={() => handleFileSelect(f.name)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors",
                  selectedFile === f.name
                    ? "bg-reclaw-100 dark:bg-reclaw-900/30 text-reclaw-700"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                )}
              >
                <FileText size={12} />
                {f.name}
                <span className="text-[10px] text-slate-400">
                  ({(f.size_bytes / 1024).toFixed(0)}KB)
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : !selectedFile && projectFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
              <Mic size={48} className="text-slate-300" />
              <p className="text-sm font-medium">No interview files yet</p>
              <p className="text-xs text-center max-w-xs">
                Upload interview transcripts (TXT, PDF, DOCX) and ReClaw will extract nuggets, themes, and insights automatically.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 text-sm mt-2"
              >
                <Upload size={14} /> Upload Transcripts
              </button>
            </div>
          ) : !selectedFile ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <ChevronRight size={24} className="text-slate-300" />
              <p className="text-sm">Select a file above to view its transcript</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Analyze button for selected file */}
              {selectedFile && !analyzing && (
                <button
                  onClick={handleAnalyze}
                  className="flex items-center gap-2 px-4 py-2 bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 text-sm"
                >
                  <Sparkles size={14} /> Analyze "{selectedFile}"
                </button>
              )}

              {/* Analysis result (streaming) */}
              {analysisResult && (
                <div className="rounded-xl bg-reclaw-50 dark:bg-reclaw-900/10 border border-reclaw-200 dark:border-reclaw-800 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-reclaw-600" />
                    <span className="text-xs font-semibold text-reclaw-700 dark:text-reclaw-400">
                      Analysis Result {analyzing && "(streaming...)"}
                    </span>
                  </div>
                  <div className={cn("text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap", analyzing && "streaming-cursor")}>
                    {analysisResult}
                  </div>
                </div>
              )}

              {/* Transcript segments */}
              {segments.length > 0 ? (
                segments.map((seg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg p-3 transition-colors",
                      seg.highlighted
                        ? "bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {seg.timestamp && (
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock size={10} /> {seg.timestamp}
                        </span>
                      )}
                      {seg.speaker && (
                        <span className="text-xs font-medium text-reclaw-600">{seg.speaker}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{seg.text}</p>
                  </div>
                ))
              ) : transcriptText ? (
                <pre className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                  {transcriptText}
                </pre>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Right: Tags & Nuggets */}
      <div className="w-80 flex flex-col bg-slate-50 dark:bg-slate-900">
        {/* Tags */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
            <Tag size={12} /> Tags ({Object.keys(tags).length})
          </h3>
          {Object.keys(tags).length === 0 ? (
            <p className="text-xs text-slate-400">Run interview analysis to extract themes and tags.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setActiveTag(null)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full transition-colors",
                  !activeTag ? "bg-reclaw-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600"
                )}
              >
                All ({nuggets.length})
              </button>
              {Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full transition-colors",
                    activeTag === tag ? "bg-purple-600 text-white" : "bg-purple-100 dark:bg-purple-900/30 text-purple-700"
                  )}
                >
                  {tag} ({count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nuggets */}
        <div className="flex-1 overflow-y-auto p-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
            <Sparkles size={12} /> Nuggets ({filteredNuggets.length})
          </h3>

          {filteredNuggets.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">
                No nuggets yet. Upload transcripts and click "Analyze" to extract evidence.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNuggets.map((nugget) => (
                <div key={nugget.id} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    "{nugget.text}"
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">
                      📄 {(nugget.source || "").split("/").pop()}
                    </span>
                    {nugget.source_location && (
                      <span className="text-[10px] text-slate-400">@ {nugget.source_location}</span>
                    )}
                    {(nugget.tags || []).map((tag: string, i: number) => (
                      <span key={i} className="text-[10px] bg-purple-100 dark:bg-purple-900/30 rounded px-1 py-0.5 text-purple-600">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">🔗 Quick Actions</h3>
          <div className="space-y-1">
            {[
              { label: "Run thematic analysis on nuggets", intent: "run thematic analysis on all nuggets" },
              { label: "Generate affinity map", intent: "create affinity map from findings" },
              { label: "Create synthesis report", intent: "synthesize all findings into a report" },
            ].map((action) => (
              <button
                key={action.label}
                onClick={async () => {
                  if (!activeProjectId) return;
                  setAnalyzing(true);
                  setAnalysisResult("");
                  try {
                    let result = "";
                    for await (const event of chatApi.send(activeProjectId, action.intent)) {
                      if (event.type === "chunk") { result += event.content; setAnalysisResult(result); }
                    }
                    await loadProjectData();
                  } catch (e) {}
                  setAnalyzing(false);
                }}
                disabled={analyzing}
                className="w-full text-left text-xs text-reclaw-600 hover:text-reclaw-700 py-1 disabled:opacity-50"
              >
                → {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseTranscript(text: string): TranscriptSegment[] {
  const lines = text.split("\n");
  const segments: TranscriptSegment[] = [];
  const patterns = [
    /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*([^:]+):\s*(.+)/,
    /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*([^:]+):\s*(.+)/,
    /^([^(]+)\s*\((\d{1,2}:\d{2}(?::\d{2})?)\):\s*(.+)/,
  ];

  let current: TranscriptSegment | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      if (current) { segments.push(current); current = null; }
      continue;
    }

    let matched = false;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        if (current) segments.push(current);
        const isP3 = pattern === patterns[2];
        current = {
          timestamp: isP3 ? match[2] : match[1],
          speaker: (isP3 ? match[1] : match[2]).trim(),
          text: match[3].trim(),
          highlighted: false,
        };
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (current) { current.text += " " + line.trim(); }
      else { current = { timestamp: "", speaker: "", text: line.trim(), highlighted: false }; }
    }
  }

  if (current) segments.push(current);
  return segments;
}
