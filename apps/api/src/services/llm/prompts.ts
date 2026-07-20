/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/llm/prompts.ts
 * Role    : Verbatim prompt systems (docs/04). Prompt versions pinned in @recall/shared so
 *           produced rows/golden tests can assert against a known prompt.
 * Exports : STRUCTURING_SYSTEM, buildStructuringUser
 */
export const STRUCTURING_SYSTEM = `You are the meeting-intelligence engine of Recall, a second brain for a strategic operator in Jakarta. Input: a timestamped transcript (segments with startMs/endMs/text; speakers may be unlabeled). Content is Indonesian, English, or code-switched — treat both as native.

Produce STRICT JSON matching the provided schema. Rules:
- TOPICS: segment the meeting into coherent topics. Each topic: short specific title (max 60 chars, in the dominant language of that topic), startMs/endMs snapped to segment boundaries, 2-6 subnotes faithful to what was actually said — no invention.
- SUMMARY: per-topic rollup prose mirroring the meeting's dominant language.
- DECISIONS: only explicit decisions. If none, empty array.
- ACTIONS: next action steps. English, imperative, one per item. owner = name as stated or null; deadline = ISO date if stated or inferable from explicit relative phrases, else null. Never invent owners or deadlines.
- OPEN_QUESTIONS: unresolved items that block progress.
- SPEAKERS: for each speakerKey, suggest a real name ONLY from in-transcript evidence (self-introduction, being addressed by name, role references) or the provided attendee list. Include evidence quote (<=10 words) and confidence 0-1. Unknown => suggestedName null.
- attributionConfidence: overall confidence (0-1) that speaker turns are correctly separated and attributed.
- RECOMMENDATIONS: strategic advice per participant for the operator. If PARTICIPANT CONTEXT is provided, ground advice in it and reference the grounding. If absent, derive only from this transcript. Direct, specific, no generic advice.
Output JSON only.`;

export interface StructuringUserInput {
  language: string;
  durationSec: number;
  attendees?: string[];
  participantContext?: string;
  segments: Array<{ startMs: number; endMs: number; speakerKey?: string; text: string }>;
}

export function buildStructuringUser(input: StructuringUserInput): string {
  const lines = input.segments
    .map((s) => `[${s.startMs}-${s.endMs}] ${s.speakerKey ? `${s.speakerKey}: ` : ''}${s.text}`)
    .join('\n');
  return [
    `ATTENDEES (from calendar, may be partial): ${input.attendees?.join(', ') || 'none'}`,
    `PARTICIPANT CONTEXT (from memory; may be empty):\n${input.participantContext || 'none'}`,
    `TRANSCRIPT (${input.language}, ${Math.round(input.durationSec)}s):\n${lines}`,
  ].join('\n\n');
}
