import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

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

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
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

export function App() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>("vendor-evaluation.md");
  const [markdown, setMarkdown] = useState<string>("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [author, setAuthor] = useState<"Human" | "LLM">("Human");

  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<Array<{ role: string; content: unknown }>>([]);
  const [targetBlockId, setTargetBlockId] = useState<string>("");

  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const ydoc = useMemo(() => new Y.Doc(), []);
  const ytext = useMemo(() => ydoc.getText("markdown"), [ydoc]);

  useEffect(() => {
    apiGet<TopicsListResponse>("/api/topics")
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics(["vendor-evaluation.md"]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet<TopicResponse>(`/api/topics/${encodeURIComponent(selectedTopic)}`).then((r) => {
      if (cancelled) return;
      setMarkdown(r.markdown);
      setValidation(r.validation);
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, r.markdown);
      });
      const ids = extractIds(r.markdown);
      setTargetBlockId(ids[0] ?? "");
    });
    apiGet<Tracker>("/api/history").then((t) => {
      if (!cancelled) setTracker(t);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTopic, ydoc, ytext]);

  useEffect(() => {
    const onUpdate = () => setMarkdown(ytext.toString());
    ytext.observe(onUpdate);
    return () => ytext.unobserve(onUpdate);
  }, [ytext]);

  useEffect(() => {
    const provider = new WebsocketProvider("ws://localhost:1234", `topic:${selectedTopic}`, ydoc);
    return () => provider.destroy();
  }, [selectedTopic, ydoc]);

  async function save() {
    const r = await apiPut<{ markdown: string; validation: ValidationResult }>(
      `/api/topics/${encodeURIComponent(selectedTopic)}`,
      { markdown: ytext.toString(), author }
    );
    setValidation(r.validation);
    setMarkdown(r.markdown);
    const t = await apiGet<Tracker>("/api/history");
    setTracker(t);
  }

  async function runProposeEdit() {
    const tool = {
      name: "propose_edit",
      args: { block_id: targetBlockId, instruction: chatInput, current_markdown: ytext.toString() }
    };
    const r = await apiPost<{ role: string; content: any }>("/api/chat", { tool });
    setChatLog((l) => [...l, { role: "user", content: chatInput }, r]);
    setChatInput("");
  }

  function applyProposal() {
    const last = [...chatLog].reverse().find((m) => (m as any)?.content?.proposal?.replacement_markdown);
    const replacement = (last as any)?.content?.proposal?.replacement_markdown as string | undefined;
    if (!replacement) return;

    const md = ytext.toString();
    const lines = md.split(/\r?\n/);
    const idLineIdx = lines.findIndex((l) => l.trim().includes(`@id: ${targetBlockId}`));
    if (idLineIdx < 0) return;

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
    <div className="h-screen w-screen flex">
      <aside className="w-64 border-r border-slate-800 bg-slate-950 p-3 flex flex-col gap-3">
        <div className="text-sm font-semibold tracking-wide">Topics</div>
        <div className="flex flex-col gap-1 overflow-auto">
          {topics.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTopic(t)}
              className={[
                "text-left px-2 py-1 rounded",
                t === selectedTopic ? "bg-slate-800" : "hover:bg-slate-900"
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <label className="text-xs text-slate-300">
            Author
            <select
              className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1"
              value={author}
              onChange={(e) => setAuthor(e.target.value as any)}
            >
              <option value="Human">Human</option>
              <option value="LLM">LLM</option>
            </select>
          </label>
          <button onClick={save} className="w-full bg-indigo-600 hover:bg-indigo-500 rounded px-3 py-2 text-sm">
            Save + Track
          </button>
        </div>
      </aside>

      <main className="flex-1 grid grid-cols-12">
        <section className="col-span-7 border-r border-slate-800">
          <div className="px-3 py-2 border-b border-slate-800 text-sm flex items-center justify-between">
            <div className="font-semibold">Markdown (human)</div>
            <div className="text-xs text-slate-400">IDs preserved as <code>&lt;!-- @id: ... --&gt;</code></div>
          </div>
          <div className="h-[calc(100vh-41px)]">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={markdown}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 13 }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;
                const provider = new WebsocketProvider("ws://localhost:1234", `topic:${selectedTopic}`, ydoc);
                const model = editor.getModel();
                if (!model) return;
                new MonacoBinding(ytext, model, new Set([editor]), provider.awareness);
              }}
              onChange={(v) => {
                if (typeof v === "string") setMarkdown(v);
              }}
            />
          </div>
        </section>

        <section className="col-span-3 border-r border-slate-800 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 text-sm font-semibold">Template validation (machine)</div>
          <div className="p-3 overflow-auto text-xs flex-1">
            {validation ? (
              <>
                <div className="mb-2">
                  <div>
                    Schema: <span className="text-slate-200">{validation.schemaFile ?? "—"}</span>
                  </div>
                  <div>
                    Status:{" "}
                    <span className={validation.ok ? "text-emerald-400" : "text-rose-400"}>
                      {validation.ok ? "OK" : "INVALID"}
                    </span>
                  </div>
                </div>
                {!validation.ok && validation.errors.length ? (
                  <ul className="list-disc ml-4 mb-3 text-rose-300">
                    {validation.errors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="text-slate-300 mb-1">Derived structure</div>
                <pre className="bg-slate-900 border border-slate-800 rounded p-2 whitespace-pre-wrap break-words">
                  {JSON.stringify(validation.structured, null, 2)}
                </pre>
              </>
            ) : (
              <div className="text-slate-400">No validation loaded.</div>
            )}
          </div>
        </section>

        <section className="col-span-2 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 text-sm font-semibold">History</div>
          <div className="p-3 overflow-auto text-xs flex-1">
            {tracker ? (
              <table className="w-full text-left border-collapse">
                <thead className="text-slate-300">
                  <tr>
                    <th className="pb-2">Block_ID</th>
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Who</th>
                    <th className="pb-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tracker.events
                    .slice()
                    .reverse()
                    .slice(0, 50)
                    .map((e, idx) => (
                      <tr
                        key={`${e.block_id}-${e.timestamp}-${idx}`}
                        className="border-t border-slate-900 hover:bg-slate-900 cursor-pointer"
                        onClick={() => setTargetBlockId(e.block_id)}
                      >
                        <td className="py-1 pr-2 truncate max-w-[6rem]" title={e.block_id}>
                          {e.block_id}
                        </td>
                        <td className="py-1 pr-2">{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td className="py-1 pr-2">{e.author}</td>
                        <td className="py-1">{e.action}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="text-slate-400">No history yet.</div>
            )}
          </div>

          <div className="border-t border-slate-800 p-3">
            <div className="text-xs text-slate-300 mb-1">LLM sidebar (mock)</div>
            <label className="text-xs text-slate-400">
              Block_ID
              <input
                value={targetBlockId}
                onChange={(e) => setTargetBlockId(e.target.value)}
                className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1"
                placeholder="uuid"
              />
            </label>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="mt-2 w-full h-20 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              placeholder="Instruction for propose_edit (e.g., tighten requirements wording)."
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={runProposeEdit}
                className="flex-1 bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 text-xs"
              >
                propose_edit
              </button>
              <button
                onClick={applyProposal}
                className="flex-1 bg-emerald-700 hover:bg-emerald-600 rounded px-2 py-1 text-xs"
              >
                Apply
              </button>
            </div>
            <div className="mt-2 max-h-32 overflow-auto text-[11px] text-slate-300">
              {chatLog.slice(-4).map((m, idx) => (
                <pre
                  key={idx}
                  className="whitespace-pre-wrap break-words bg-slate-950 border border-slate-900 rounded p-2 mb-2"
                >
                  {m.role}: {typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2)}
                </pre>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

