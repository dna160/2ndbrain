/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/llm/parse.ts
 * Role    : parseStructured<T> — call an LlmClient for JSON, rescue markdown-fenced output,
 *           validate against a zod schema, and on failure do ONE repair retry that feeds the
 *           zod error back verbatim (docs/04 shared guardrails). Generalized from Lynkbot's
 *           routes/v1/ai.ts fence-rescue parser.
 * Exports : parseStructured(), extractJson()
 */
import type { ZodType, ZodTypeDef } from 'zod';

import type { ChatMessage, LlmClient, LlmUsage } from './types';

/** Strip a ```json … ``` fence if present, else return the trimmed input. */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence?.[1] ? fence[1].trim() : trimmed;
}

type ParseAttempt<T> = { ok: true; data: T } | { ok: false; error: string };

function tryParse<T>(schema: ZodType<T, ZodTypeDef, unknown>, content: string): ParseAttempt<T> {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(content));
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${String(err)}` };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: JSON.stringify(result.error.issues) };
  }
  return { ok: true, data: result.data };
}

export interface StructuredRequest<T> {
  /** Input is `unknown`: LLM JSON is arbitrary, and shape-normalizing transforms mean
   *  a schema's input and output types legitimately differ. */
  schema: ZodType<T, ZodTypeDef, unknown>;
  system: string;
  user: string;
  model: string;
  temperature?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: LlmUsage;
}

export async function parseStructured<T>(
  client: LlmClient,
  req: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const messages: ChatMessage[] = [
    { role: 'system', content: req.system },
    { role: 'user', content: req.user },
  ];
  const opts = {
    model: req.model,
    temperature: req.temperature,
    responseFormat: 'json_object' as const,
  };

  const first = await client.chat(messages, opts);
  const firstAttempt = tryParse(req.schema, first.content);
  if (firstAttempt.ok) {
    return { data: firstAttempt.data, usage: first.usage };
  }

  // One repair retry — feed the validation error back verbatim.
  const repair = await client.chat(
    [
      ...messages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: `Your previous response failed validation:\n${firstAttempt.error}\nFix and re-emit the full JSON only.`,
      },
    ],
    opts,
  );
  const usage: LlmUsage = {
    promptTokens: first.usage.promptTokens + repair.usage.promptTokens,
    completionTokens: first.usage.completionTokens + repair.usage.completionTokens,
  };

  const retry = tryParse(req.schema, repair.content);
  if (retry.ok) {
    return { data: retry.data, usage };
  }
  throw new Error(`parseStructured: validation failed after repair — ${retry.error}`);
}
