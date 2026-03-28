import { HttpError } from "./httpErrors.js";
import type { TrackerData } from "./history.js";

export type ProposeEditArgs = {
  block_id?: unknown;
  instruction?: unknown;
  current_markdown?: unknown;
  tracker: TrackerData;
};

export type ProposeEditResult = {
  tool: "propose_edit";
  block_id: string;
  instruction: string;
  context: { recent_history: TrackerData["events"] };
  proposal: {
    action: string;
    summary: string;
    replacement_markdown: string;
  };
};

/** Mock LLM proposal from block id, instruction, and tracker history. */
export async function proposeEditImpl({
  block_id,
  instruction,
  current_markdown: _current_markdown,
  tracker
}: ProposeEditArgs): Promise<ProposeEditResult> {
  const id = typeof block_id === "string" ? block_id.trim() : "";
  if (!id) {
    throw new HttpError(400, "propose_edit needs a block_id (SNORT can't aim at thin air).", {
      code: "MISSING_BLOCK_ID"
    });
  }
  const instr = typeof instruction === "string" ? instruction : "";
  if (!instr.trim()) {
    throw new HttpError(400, "Add an instruction so SNORT knows what to propose.", {
      code: "MISSING_INSTRUCTION"
    });
  }

  const recent = tracker.events.filter((e) => e.block_id === id).slice(-5);

  return {
    tool: "propose_edit",
    block_id: id,
    instruction: instr,
    context: {
      recent_history: recent
    },
    proposal: {
      action: "Edit",
      summary: "Proposed edit (mock). Apply to the selected block.",
      replacement_markdown: `<!-- @id: ${id} -->\n## (unchanged title)\n\n${instr}\n`
    }
  };
}
