/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/llm/prompts.ts
 * Role    : Verbatim prompt systems (docs/04). Prompt versions pinned in @recall/shared so
 *           produced rows/golden tests can assert against a known prompt.
 * Exports : DIGEST_SYSTEM, CONSOLIDATION_SYSTEM, BRIEF_SYSTEM
 */

export const DIGEST_SYSTEM = `You are the nightly digest engine. Input: today's events, open tasks, tomorrow's calendar, memory context. STRICT JSON: sections happened[], commitmentsByMe[], commitmentsToMe[], conflicts[], recommendations[]. Every item: text + provenanceEventIds (required) — an item you cannot source does not exist. recommendations: ranked, each typed {kind: book|reply|prepare|decide, text, urgency 1-3, draftPayload? (ONLY for kind=book: title, proposed ISO start/end, attendees — OMIT the draftPayload key entirely for every other kind; never emit it as an empty object or null)}. Conflicts include tomorrow's calendar overlaps and commitment-vs-calendar collisions. Concise, operator-grade, no filler. Bilingual input; digest prose in the operator's dominant language of the day; task/recommendation text in English.`;

export function buildDigestUser(input: {
  events: Array<{ id: string; content: string | null }>;
  tasks: Array<{ id: string; title: string }>;
  tomorrow: Array<{ id: string; title: string | null; startAt: string }>;
  memoryContext: string;
}): string {
  return [
    `TODAY'S EVENTS:\n${input.events.map((e) => `[${e.id}] ${e.content ?? '(no text)'}`).join('\n') || 'none'}`,
    `OPEN TASKS:\n${input.tasks.map((t) => `[${t.id}] ${t.title}`).join('\n') || 'none'}`,
    `TOMORROW'S CALENDAR:\n${input.tomorrow.map((c) => `[${c.id}] ${c.startAt} ${c.title ?? ''}`).join('\n') || 'none'}`,
    `MEMORY CONTEXT:\n${input.memoryContext || 'none'}`,
  ].join('\n\n');
}

export const CONSOLIDATION_SYSTEM = `You are the memory consolidation engine of Recall. Input: today's normalized events (messages, meeting summaries, calendar items) plus the current entity roster (id, kind, name, aka). Extract durable knowledge. STRICT JSON per schema.

- FACTS: atomic, self-contained statements worth remembering beyond this week. One fact = one claim. Attach entityRefs (existing ids, or {newEntity:{kind,name}} when clearly new), confidence 0-1, and sourceEventIds (REQUIRED, non-empty). Exclude trivia, pleasantries, and anything true only today.
- RELATIONS: typed links between entities. relation in {works_at, founder_of, partner_in, invested_in, advises, client_of, supplier_of, member_of, blocks, related_to}. Use related_to only when nothing else fits. strengthDelta 0-1, sourceEventIds required.
- CONTRADICTIONS: where today's evidence conflicts with provided EXISTING MEMORIES — reference memoryId, state the conflict in one sentence.
- SENSITIVE: mark facts involving personal/confidential matters (health, conflicts, finances of named individuals, client-confidential terms) sensitivity="sensitive".
- coreNominations: facts that appear foundational and recurrent — nominate, do not assert.
No speculation. If evidence is thin, lower confidence rather than omitting the uncertainty.`;

export function buildConsolidationUser(input: {
  events: Array<{ id: string; content: string | null; occurredAt: string }>;
  roster: Array<{ id: string; kind: string; name: string }>;
  memories: Array<{ id: string; content: string }>;
}): string {
  return [
    `EVENTS:\n${input.events.map((e) => `[${e.id}] ${e.content ?? '(no text)'}`).join('\n')}`,
    `ENTITY ROSTER:\n${input.roster.map((e) => `${e.id} ${e.kind}: ${e.name}`).join('\n') || 'none'}`,
    `EXISTING MEMORIES (for contradiction checking):\n${input.memories.map((m) => `${m.id}: ${m.content}`).join('\n') || 'none'}`,
  ].join('\n\n');
}

export const BRIEF_SYSTEM = `You write a pre-meeting brief delivered over WhatsApp 60 minutes before a meeting. Audience: the operator, on mobile, in a hurry. Max 900 characters. Structure: (1) one-line frame of the meeting; (2) per attendee: who they are + relationship state + open commitments both directions (from OPEN TASKS and MEMORY CONTEXT, cite nothing you weren't given); (3) last meeting's unresolved actions if any; (4) suggested posture: one or two sentences, specific. Language: mirror the operator's dominant language with this attendee set. Plain text, no markdown. Exclude anything marked sensitive.`;

