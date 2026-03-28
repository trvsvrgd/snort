import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

/** Yjs sync endpoint (override with `VITE_YJS_WS_URL` in `.env` for non-default hosts). */
const YJS_WS_URL = import.meta.env.VITE_YJS_WS_URL ?? "ws://localhost:1234";

type ValidationResult = {
  ok: boolean;
  schemaFile: string | null;
  errors: string[];
  structured: unknown;
};

type TopicResponse = {
  name: string;
  markdown: string;
  validation: ValidationResult;
};

type TopicsListResponse = { topics: string[] };

type TrackerEvent = {
  block_id: string;
  timestamp: string;
  author: "Human" | "LLM";
  action: "Add" | "Edit" | "Delete";
  summary: string;
};

type Tracker = { version: number; events: TrackerEvent[] };
type ChatMessage = { role: string; content: unknown };

type ApiErrorBody = { ok?: boolean; error?: string; code?: string };

/**
 * Reads JSON `{ error, code }` from failed API responses when present.
 */
async function readApiErrorMessage(res: Response): Promise<string> {
  const fallback = `${res.status} ${res.statusText}`;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return fallback;
  try {
    const data = (await res.json()) as ApiErrorBody;
    if (typeof data.error === "string" && data.error.length > 0) {
      return data.code ? `${data.error} (${data.code})` : data.error;
    }
  } catch {
    /* ignore malformed JSON */
  }
  return fallback;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return (await res.json()) as T;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return (await res.json()) as T;
}

function extractIds(markdown: string) {
  const ids: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.trim().match(/^<!--\s*@id:\s*([0-9a-fA-F-]{8,})\s*-->\s*$/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getReplacementMarkdown(content: unknown) {
  if (typeof content !== "object" || content === null) return undefined;
  const proposal = (content as { proposal?: unknown }).proposal;
  if (typeof proposal !== "object" || proposal === null) return undefined;
  const replacement = (proposal as { replacement_markdown?: unknown }).replacement_markdown;
  return typeof replacement === "string" ? replacement : undefined;
}

function stringifyContent(content: unknown) {
  if (typeof content === "string") return content;
  if (content == null) return "null";
  return JSON.stringify(content, null, 2);
}

function shortenId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function App() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>("vendor-evaluation.md");
  const [markdown, setMarkdown] = useState<string>("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [topicLoadError, setTopicLoadError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [author, setAuthor] = useState<"Human" | "LLM">("Human");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [isTopicLoading, setIsTopicLoading] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [targetBlockId, setTargetBlockId] = useState<string>("");

  const ydoc = useMemo(() => new Y.Doc(), []);
  const ytext = useMemo(() => ydoc.getText("markdown"), [ydoc]);
  const blockIds = useMemo(() => extractIds(markdown), [markdown]);
  const recentEvents = useMemo(() => tracker?.events.slice().reverse().slice(0, 10) ?? [], [tracker]);

  useEffect(() => {
    apiGet<TopicsListResponse>("/api/topics")
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics(["vendor-evaluation.md"]));
  }, []);

  useEffect(() => {
    if (saveSuccess) {
      const t = window.setTimeout(() => setSaveSuccess(null), 4500);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [saveSuccess]);

  useEffect(() => {
    let cancelled = false;

    async function loadTopicAndHistory() {
      setIsTopicLoading(true);
      setTopicLoadError(null);
      setHistoryError(null);
      setSaveError(null);
      setChatError(null);

      try {
        const [topicResult, historyResult] = await Promise.allSettled([
          apiGet<TopicResponse>(`/api/topics/${encodeURIComponent(selectedTopic)}`),
          apiGet<Tracker>("/api/history")
        ]);

        if (cancelled) return;

        if (topicResult.status === "fulfilled") {
          const topic = topicResult.value;
          setMarkdown(topic.markdown);
          setValidation(topic.validation);
          ydoc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, topic.markdown);
          });
          setTargetBlockId(extractIds(topic.markdown)[0] ?? "");
        } else {
          const msg =
            topicResult.reason instanceof Error ? topicResult.reason.message : String(topicResult.reason);
          setTopicLoadError(msg);
          setMarkdown("");
          setValidation({
            ok: false,
            schemaFile: null,
            errors: [msg],
            structured: null
          });
        }

        if (historyResult.status === "fulfilled") {
          setTracker(historyResult.value);
        } else {
          const msg =
            historyResult.reason instanceof Error ? historyResult.reason.message : String(historyResult.reason);
          setHistoryError(msg);
          setTracker(null);
        }
      } finally {
        if (!cancelled) setIsTopicLoading(false);
      }
    }

    void loadTopicAndHistory();

    return () => {
      cancelled = true;
    };
  }, [selectedTopic, ydoc, ytext]);

  useEffect(() => {
    const onUpdate = () => setMarkdown(ytext.toString());
    ytext.observe(onUpdate);
    return () => ytext.unobserve(onUpdate);
  }, [ytext]);

  async function save() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const r = await apiPut<{ markdown: string; validation: ValidationResult }>(
        `/api/topics/${encodeURIComponent(selectedTopic)}`,
        { markdown: ytext.toString(), author }
      );
      setValidation(r.validation);
      setMarkdown(r.markdown);
      setTracker(await apiGet<Tracker>("/api/history"));
      setSaveSuccess("Happy snort—saved, validated, and logged to history.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function runProposeEdit() {
    if (!targetBlockId.trim()) {
      setChatError("Choose a block before requesting an edit.");
      return;
    }
    if (!chatInput.trim()) {
      setChatError("Add an instruction before running propose_edit.");
      return;
    }

    setIsProposing(true);
    setChatError(null);

    try {
      const tool = {
        name: "propose_edit",
        args: { block_id: targetBlockId, instruction: chatInput, current_markdown: ytext.toString() }
      };
      const r = await apiPost<ChatMessage>("/api/chat", { tool });
      setChatLog((messages) => [...messages, { role: "user", content: chatInput }, r]);
      setChatInput("");
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProposing(false);
    }
  }

  function applyProposal() {
    setChatError(null);
    const replacement = [...chatLog]
      .reverse()
      .map((message) => getReplacementMarkdown(message.content))
      .find(Boolean);
    if (!replacement) {
      setChatError("No proposal in the log yet—run propose_edit first so SNORT has something to apply.");
      return;
    }

    const md = ytext.toString();
    const lines = md.split(/\r?\n/);
    const idLineIdx = lines.findIndex((l) => l.trim().includes(`@id: ${targetBlockId}`));
    if (idLineIdx < 0) {
      setChatError(
        `Can't find that block ID in the editor. Pick a block that exists in this topic, or paste the full @id line.`
      );
      return;
    }

    // Replace from id line until before next id line.
    let end = lines.length;
    for (let i = idLineIdx + 1; i < lines.length; i += 1) {
      if (lines[i].trim().startsWith("<!--") && lines[i].includes("@id:")) {
        end = i;
        break;
      }
    }
    const newLines = [...lines.slice(0, idLineIdx), ...replacement.trimEnd().split("\n"), ...lines.slice(end)];
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, newLines.join("\n"));
    });
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <div className="grid min-h-screen gap-4 p-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="panel-surface flex min-h-0 flex-col rounded-3xl border border-white/10 p-5">
          <div className="space-y-4">
            <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200">
              SNORT workspace
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">SNORT</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Cleaner editing for markdown topics, machine validation, history tracking, and assisted
                block updates.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Topics</div>
                <div className="mt-2 text-2xl font-semibold text-white">{topics.length}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Block IDs</div>
                <div className="mt-2 text-2xl font-semibold text-white">{blockIds.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Topics</div>
              <div className="text-xs text-slate-500">
                {isTopicLoading ? "Loading…" : selectedTopic}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
              {topics.map((topic) => {
                const isSelected = topic === selectedTopic;
                return (
                  <button
                    key={topic}
                    onClick={() => setSelectedTopic(topic)}
                    className={[
                      "rounded-2xl border px-3 py-3 text-left text-sm transition-all",
                      isSelected
                        ? "border-cyan-400/35 bg-cyan-400/14 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                        : "border-white/8 bg-white/4 text-slate-300 hover:border-white/16 hover:bg-white/7"
                    ].join(" ")}
                  >
                    <div className="font-medium">{topic}</div>
                    <div className="mt-1 text-xs text-slate-500">Open topic and sync editor state.</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Save as
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50"
                value={author}
                onChange={(e) => setAuthor(e.target.value as "Human" | "LLM")}
              >
                <option value="Human">Human</option>
                <option value="LLM">LLM</option>
              </select>
            </label>

            {topicLoadError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                Topic load error: {topicLoadError}
              </div>
            ) : null}

            {saveError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                Save failed: {saveError}
              </div>
            ) : null}

            {saveSuccess ? (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                {saveSuccess}
              </div>
            ) : null}

            <button
              onClick={save}
              disabled={isSaving}
              className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/60"
            >
              {isSaving ? "Saving..." : "Save + track"}
            </button>
          </div>
        </aside>

        <main className="panel-surface flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Current topic</div>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {isTopicLoading ? "Loading topic…" : selectedTopic}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Edit markdown directly while preserving inline <code> @id </code> comments.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium",
                  validation?.ok
                    ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border border-amber-400/20 bg-amber-400/10 text-amber-200"
                ].join(" ")}
              >
                {validation?.ok ? "Validation passing" : "Needs review"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium text-slate-300">
                {blockIds.length} block IDs
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-4">
            <div className="editor-shell flex h-full min-h-[440px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/72">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-3 text-sm">
                <div className="font-medium text-slate-100">Markdown editor</div>
                <div className="text-xs text-slate-500">Monaco, wrapped lines, distraction-reduced chrome</div>
              </div>
              <div className="min-h-0 flex-1">
                <Editor
                  key={selectedTopic}
                  height="100%"
                  defaultLanguage="markdown"
                  value={markdown}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: "on",
                    fontSize: 14,
                    lineNumbers: "off",
                    glyphMargin: false,
                    folding: false,
                    overviewRulerBorder: false,
                    overviewRulerLanes: 0,
                    renderLineHighlight: "none",
                    scrollBeyondLastLine: false,
                    padding: { top: 18, bottom: 18 }
                  }}
                  onMount={(editor, monaco) => {
                    monaco.editor.defineTheme("snort-clean", {
                      base: "vs-dark",
                      inherit: true,
                      rules: [],
                      colors: {
                        "editor.background": "#0b1220",
                        "editor.foreground": "#e2e8f0",
                        "editor.selectionBackground": "#0ea5e955",
                        "editorLineNumber.foreground": "#475569",
                        "editorCursor.foreground": "#22d3ee",
                        "editor.inactiveSelectionBackground": "#0f172a"
                      }
                    });
                    monaco.editor.setTheme("snort-clean");

                    const provider = new WebsocketProvider(YJS_WS_URL, `topic:${selectedTopic}`, ydoc);
                    const model = editor.getModel();
                    if (!model) {
                      provider.destroy();
                      return;
                    }

                    const binding = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness);
                    editor.onDidDispose(() => {
                      binding.destroy();
                      provider.destroy();
                    });
                  }}
                  onChange={(value) => {
                    if (typeof value === "string") setMarkdown(value);
                  }}
                />
              </div>
            </div>
          </div>
        </main>

        <section className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1.15fr)_minmax(0,0.9fr)_auto]">
          <div className="panel-surface min-h-0 overflow-hidden rounded-3xl border border-white/10">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Validation</div>
              <h3 className="mt-2 text-lg font-semibold text-white">Template status</h3>
            </div>
            <div className="space-y-4 overflow-auto p-5 text-sm">
              {validation ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Schema</div>
                      <div className="mt-2 text-sm text-slate-100">{validation.schemaFile ?? "None"}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</div>
                      <div className={["mt-2 text-sm font-medium", validation.ok ? "text-emerald-300" : "text-amber-300"].join(" ")}>
                        {validation.ok ? "Passing" : "Invalid"}
                      </div>
                    </div>
                  </div>

                  {!validation.ok && validation.errors.length ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-100">
                      <div className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Issues</div>
                      <ul className="mt-2 space-y-2">
                        {validation.errors.map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      Derived structure
                    </div>
                    <pre className="rounded-2xl border border-white/8 bg-slate-950/80 p-4 text-xs leading-6 text-slate-300">
                      {stringifyContent(validation.structured)}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-slate-400">
                  No validation loaded.
                </div>
              )}
            </div>
          </div>

          <div className="panel-surface min-h-0 overflow-hidden rounded-3xl border border-white/10">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">History</div>
              <h3 className="mt-2 text-lg font-semibold text-white">Recent tracked changes</h3>
            </div>
            <div className="overflow-auto p-4">
              {historyError ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                  History failed to load: {historyError}
                </div>
              ) : null}

              {recentEvents.length ? (
                <div className="space-y-2">
                  {recentEvents.map((event, index) => (
                    <button
                      key={`${event.block_id}-${event.timestamp}-${index}`}
                      onClick={() => setTargetBlockId(event.block_id)}
                      className="w-full rounded-2xl border border-white/8 bg-white/4 p-3 text-left transition hover:border-cyan-400/25 hover:bg-cyan-400/8"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-white" title={event.block_id}>
                            {shortenId(event.block_id)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{formatTimestamp(event.timestamp)}</div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                          {event.action}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        {event.author} • {event.summary || "Tracked change"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-slate-400">
                  No history yet.
                </div>
              )}
            </div>
          </div>

          <div className="panel-surface rounded-3xl border border-white/10 p-5">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Assistant</div>
            <h3 className="mt-2 text-lg font-semibold text-white">Propose block edits</h3>
            <p className="mt-1 text-sm text-slate-400">
              Use a block ID from the current topic or click an item in history to target it.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Target block ID
                <input
                  value={targetBlockId}
                  onChange={(e) => setTargetBlockId(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50"
                  placeholder="uuid"
                />
              </label>

              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Instruction
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="mt-2 h-28 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50"
                  placeholder="Tighten this requirement, add a missing acceptance criterion, or rewrite for clarity."
                />
              </label>

              {chatError ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                  {chatError}
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  onClick={runProposeEdit}
                  disabled={isProposing}
                  className="flex-1 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isProposing ? "Working..." : "Run propose_edit"}
                </button>
                <button
                  onClick={applyProposal}
                  className="flex-1 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Apply proposal
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Recent assistant activity</div>
              <div className="max-h-48 space-y-2 overflow-auto">
                {chatLog.length ? (
                  chatLog.slice(-4).map((message, idx) => (
                    <pre
                      key={idx}
                      className="overflow-auto rounded-2xl border border-white/8 bg-slate-950/78 p-3 text-xs leading-6 text-slate-300"
                    >
                      {message.role}: {stringifyContent(message.content)}
                    </pre>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-slate-400">
                    No assistant activity yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
