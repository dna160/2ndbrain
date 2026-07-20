/**
 * Typed API client — validates every response against a @recall/shared zod schema, so the
 * dashboard consumes inferred types (CLAUDE.md: shared schemas are the contract).
 */
import type { ZodType } from 'zod';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface FetchOptions {
  token?: string | null;
  method?: string;
  body?: unknown;
}

export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  opts: FetchOptions = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${opts.method ?? 'GET'} ${path}`);
  }
  return schema.parse(await res.json());
}
