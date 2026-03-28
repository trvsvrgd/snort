import { v4 as uuidv4 } from "uuid";

const ID_RE = /^<!--\s*@id:\s*([0-9a-fA-F-]{8,})\s*-->\s*$/;

export function ensureBlockIds(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isH2 = /^##\s+/.test(line);
    if (isH2) {
      const prev = out.length ? out[out.length - 1] : "";
      const hasId = ID_RE.test(prev.trim());
      if (!hasId) out.push(`<!-- @id: ${uuidv4()} -->`);
    }
    out.push(line);
  }

  return out.join("\n");
}

export function extractBlocks(markdown: string): Map<string, string> {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = new Map<string, string>();

  let currentId: string | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    if (currentId) blocks.set(currentId, currentLines.join("\n").trimEnd());
    currentId = null;
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idMatch = line.trim().match(ID_RE);
    if (idMatch) {
      flush();
      currentId = idMatch[1];
      currentLines.push(line);
      continue;
    }

    if (/^##\s+/.test(line) && currentId === null) {
      currentId = `missing-${i}`;
    }

    if (currentId) currentLines.push(line);
  }

  flush();
  return blocks;
}
