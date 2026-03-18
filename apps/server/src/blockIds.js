import { v4 as uuidv4 } from "uuid";

const ID_RE = /^<!--\s*@id:\s*([0-9a-fA-F-]{8,})\s*-->\s*$/;

export function ensureBlockIds(markdown) {
  // Ensures every H2 section has an immediately preceding <!-- @id: ... --> line.
  // If missing, inserts a UUID tag.
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];

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

export function extractBlocks(markdown) {
  // Extract blocks keyed by @id. We treat each H2 section as a block.
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = new Map();

  let currentId = null;
  let currentLines = [];

  function flush() {
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
      // In case a H2 appears without ID (shouldn't after ensureBlockIds), start an anonymous block.
      currentId = `missing-${i}`;
    }

    if (currentId) currentLines.push(line);
  }

  flush();
  return blocks;
}

