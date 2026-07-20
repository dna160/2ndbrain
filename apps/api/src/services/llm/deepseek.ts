/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/llm/deepseek.ts
 * Role    : DeepSeek chat client (OpenAI-compatible API) implementing LlmClient. Returns
 *           content + split token usage for cost metering. Reasoning jobs use deepseek-reasoner.
 * Exports : DeepSeekClient
 */
import type { ChatMessage, ChatOptions, LlmClient, LlmResponse } from './types';

interface DeepSeekChoice {
  message?: { content?: string };
}
interface DeepSeekResponse {
  choices?: DeepSeekChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class DeepSeekClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.deepseek.com',
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<LlmResponse> {
    const startedAt = Date.now();
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: opts.responseFormat ? { type: opts.responseFormat } : undefined,
      }),
    });
    if (!res.ok) throw new Error(`deepseek chat failed: ${res.status}`);
    const json = (await res.json()) as DeepSeekResponse;
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('deepseek: no content in response');
    return {
      content,
      modelId: opts.model,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
      latencyMs: Date.now() - startedAt,
    };
  }
}
