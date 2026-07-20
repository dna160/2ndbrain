/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/llm/types.ts
 * Role    : Recall LLM client contract (adapted from Lynkbot packages/ai ILLMClient).
 *           Slimmer surface — one `chat` call returning content + split token usage for cost.
 * Exports : LlmClient, ChatMessage, ChatOptions, LlmResponse, LlmUsage
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmResponse {
  content: string;
  modelId: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmClient {
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<LlmResponse>;
}
