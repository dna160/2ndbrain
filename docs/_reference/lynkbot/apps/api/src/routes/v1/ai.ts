/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/routes/v1/ai.ts
 * Role    : AI-assisted content generation endpoints for the dashboard.
 *           generate-product-copy: given a product name + brief, returns AI-generated copy.
 *           chat: single-turn AI assistant for dashboard operators.
 *           generate-flow: generate a FlowDefinition from a natural language prompt (PRD §9.2).
 *           modify-flow: modify an existing flow via natural language instruction (PRD §9.3).
 * Exports : aiRoutes (Fastify plugin)
 */
import type { FastifyPluginAsync } from 'fastify';
import { getLLMClient } from '@lynkbot/ai';
import { requireFeature } from '../../middleware/featureGate';
import {
  db,
  flowTemplates,
  flowDefinitions,
  buyers,
  eq,
  sql,
} from '@lynkbot/db';
import {
  FLOW_GENERATION_SYSTEM_PROMPT,
  FLOW_MODIFICATION_SYSTEM_PROMPT,
  buildFlowGenPrompt,
  buildFlowModPrompt,
  computeRiskScore,
} from '@lynkbot/flow-engine';
import type { FlowDefinition } from '@lynkbot/flow-engine';

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /v1/ai/generate-product-copy
   * Generate product marketing copy using xAI/Grok.
   * Body: { name, brief?, existingDescription?, language? }
   */
  fastify.post<{
    Body: {
      name: string;
      brief?: string;
      existingDescription?: string;
      language?: 'id' | 'en';
    }
  }>(
    '/v1/ai/generate-product-copy',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { name, brief, existingDescription, language = 'id' } = request.body ?? {};

      if (!name?.trim()) {
        return reply.status(400).send({ error: 'name is required' });
      }

      const systemPrompt = language === 'id'
        ? `Kamu adalah copywriter e-commerce profesional yang ahli dalam menulis konten produk digital untuk pasar Indonesia. Selalu jawab dalam Bahasa Indonesia. Fokus pada manfaat emosional dan hasil nyata, bukan fitur teknis. Gaya bahasa: hangat, persuasif, dan kepercayaan tinggi.`
        : `You are a professional e-commerce copywriter specializing in digital products. Focus on emotional benefits and tangible outcomes, not technical features. Tone: warm, persuasive, high-trust.`;

      const userPrompt = [
        `Buat konten pemasaran lengkap untuk produk berikut:`,
        `Nama produk: ${name}`,
        brief ? `Brief: ${brief}` : '',
        existingDescription ? `Deskripsi saat ini (gunakan sebagai referensi): ${existingDescription}` : '',
        ``,
        `Hasilkan dalam format JSON yang valid dengan struktur berikut:`,
        `{`,
        `  "description": "deskripsi produk 2-3 paragraf yang menarik",`,
        `  "tagline": "tagline singkat max 80 karakter",`,
        `  "keyOutcomes": ["outcome 1", "outcome 2", "outcome 3", "outcome 4", "outcome 5"],`,
        `  "problemsSolved": ["masalah 1", "masalah 2", "masalah 3"],`,
        `  "faqPairs": [`,
        `    {"q": "pertanyaan 1", "a": "jawaban 1"},`,
        `    {"q": "pertanyaan 2", "a": "jawaban 2"},`,
        `    {"q": "pertanyaan 3", "a": "jawaban 3"},`,
        `    {"q": "pertanyaan 4", "a": "jawaban 4"},`,
        `    {"q": "pertanyaan 5", "a": "jawaban 5"}`,
        `  ],`,
        `  "bookPersonaPrompt": "instruksi singkat untuk AI sales bot tentang cara menjual produk ini (max 200 kata)"`,
        `}`,
        ``,
        `Penting: hanya output JSON valid, tidak ada teks lain di luar JSON.`,
      ].filter(Boolean).join('\n');

      const llm = getLLMClient();

      try {
        const response = await llm.chat(
          [{ role: 'user', content: userPrompt }],
          {
            system: systemPrompt,
            maxTokens: 2048,
            temperature: 0.8,
            responseFormat: 'json_object',
          },
        );

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(response.content);
        } catch {
          return reply.status(502).send({ error: 'AI returned malformed JSON', raw: response.content });
        }

        return reply.send({
          ...parsed,
          _meta: { modelId: response.modelId, tokensUsed: response.tokensUsed, latencyMs: response.latencyMs },
        });
      } catch (err: any) {
        return reply.status(502).send({ error: `AI generation failed: ${err?.message ?? 'unknown'}` });
      }
    },
  );

  /**
   * POST /v1/ai/chat
   * Single-turn assistant for dashboard operators (not buyer-facing).
   * Body: { message, context? }
   */
  fastify.post<{
    Body: { message: string; context?: string }
  }>(
    '/v1/ai/chat',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { message, context } = request.body ?? {};

      if (!message?.trim()) {
        return reply.status(400).send({ error: 'message is required' });
      }

      const llm = getLLMClient();
      const systemPrompt = [
        'You are a helpful business assistant for LynkBot, a WhatsApp commerce automation platform.',
        'You help store operators with: product copy, customer service scripts, business strategy, order handling.',
        'Be concise and practical. Respond in the same language the user writes in.',
        context ? `\nBusiness context:\n${context}` : '',
      ].filter(Boolean).join('\n');

      try {
        const response = await llm.chat(
          [{ role: 'user', content: message }],
          { system: systemPrompt, maxTokens: 1024, temperature: 0.7 },
        );

        return reply.send({
          reply: response.content,
          _meta: { modelId: response.modelId, tokensUsed: response.tokensUsed, latencyMs: response.latencyMs },
        });
      } catch (err: any) {
        return reply.status(502).send({ error: `AI error: ${err?.message ?? 'unknown'}` });
      }
    },
  );

  /**
   * POST /v1/ai/generate-flow
   * Generate a FlowDefinition from a natural language prompt (PRD §9.2).
   * AI-generated flows are always returned as JSON — the frontend saves them as 'draft'.
   * Body: { prompt, productId?, audienceSegment? }
   */
  fastify.post<{
    Body: { prompt: string; productId?: string; audienceSegment?: string };
  }>(
    '/v1/ai/generate-flow',
    { preHandler: [fastify.authenticate, requireFeature('ai_flow_generator')] },
    async (request, reply) => {
      const { prompt, productId, audienceSegment } = request.body ?? {};
      if (!prompt?.trim()) {
        return reply.status(400).send({ error: 'prompt is required' });
      }

      const { tenantId } = request.user;

      // 1. Fetch context: approved templates + buyer tags
      const tenantTemplates = await db.query.flowTemplates.findMany({
        where: eq(flowTemplates.tenantId, tenantId),
        columns: { name: true, category: true, status: true },
      });

      const buyerTagRows = await db
        .selectDistinct({ tag: sql<string>`jsonb_array_elements_text(${buyers.tags})` })
        .from(buyers)
        .where(eq(buyers.tenantId, tenantId))
        .catch(() => [] as { tag: string }[]);

      const availableTags = buyerTagRows.map(r => r.tag).filter(Boolean);

      // 2. Build prompt
      const userMessage = buildFlowGenPrompt({
        userPrompt: prompt,
        availableTemplates: tenantTemplates.map(t => ({
          name: t.name,
          category: t.category,
          status: t.status,
        })),
        availableTags,
        audienceSegment,
      });

      const llm = getLLMClient();
      let rawContent = '';
      let parseError: string | undefined;
      let flowDefinition: FlowDefinition = { nodes: [], edges: [] };

      try {
        const response = await llm.chat(
          [{ role: 'user', content: userMessage }],
          {
            system: FLOW_GENERATION_SYSTEM_PROMPT,
            maxTokens: 4096,
            temperature: 0.5,
            responseFormat: 'json_object',
          },
        );
        // GrokClient returns modelId='error' when both primary and fallback fail
        // (e.g. 429 credits exhausted, network error). Treat as service unavailable.
        if ((response as any).modelId === 'error') {
          request.log.error({
            event: 'ai_flow_generate_dual_failure',
            tenantId,
            prompt: prompt.slice(0, 200),
            rawContent: response.content,
            latencyMs: response.latencyMs,
          }, 'AI generate-flow: both primary and fallback models failed');
          return reply.status(502).send({
            error: 'AI service temporarily unavailable. Check xAI credits at console.x.ai or try again in a few minutes.',
          });
        }
        request.log.info({
          event: 'ai_flow_generate_llm_ok',
          tenantId,
          modelId: response.modelId,
          tokensUsed: response.tokensUsed,
          latencyMs: response.latencyMs,
          rawContentLength: response.content.length,
          rawContentPreview: response.content.slice(0, 300),
        }, 'AI generate-flow: LLM response received');
        rawContent = response.content;
      } catch (err: any) {
        request.log.error({
          event: 'ai_flow_generate_llm_throw',
          tenantId,
          prompt: prompt.slice(0, 200),
          err: err?.message,
        }, 'AI generate-flow: llm.chat() threw');
        return reply.status(502).send({ error: `AI generation failed: ${err?.message ?? 'unknown'}` });
      }

      // 3. Lenient parse — return best-effort even if malformed
      try {
        const parsed = JSON.parse(rawContent) as any;
        // Normalise: some models wrap the result — { flowDefinition: { nodes, edges } }
        // or { flow: { nodes, edges } }. Unwrap if top-level has no 'nodes' array.
        // Always ensure edges is an array — models often omit it
        const ensureEdges = (f: any): FlowDefinition => ({ ...f, edges: Array.isArray(f.edges) ? f.edges : [] });
        if (Array.isArray(parsed?.nodes)) {
          flowDefinition = ensureEdges(parsed);
        } else if (Array.isArray(parsed?.flowDefinition?.nodes)) {
          flowDefinition = ensureEdges(parsed.flowDefinition);
        } else if (Array.isArray(parsed?.flow?.nodes)) {
          flowDefinition = ensureEdges(parsed.flow);
        } else {
          // Unexpected shape — record as parse error but continue (best-effort)
          parseError = `Unexpected response shape from AI — no nodes array found`;
          request.log.warn({
            event: 'ai_flow_generate_unexpected_shape',
            tenantId,
            topLevelKeys: Object.keys(parsed ?? {}),
            rawContentPreview: rawContent.slice(0, 500),
          }, 'AI generate-flow: parsed OK but no nodes array at expected path');
        }
      } catch (e: any) {
        parseError = `JSON parse failed: ${e.message}`;
        request.log.warn({
          event: 'ai_flow_generate_json_parse_fail',
          tenantId,
          parseError,
          rawContent, // full content logged so you can reproduce the issue
        }, 'AI generate-flow: JSON.parse failed, attempting markdown fence extraction');
        // Attempt to extract JSON from markdown fences
        const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match?.[1]) {
          try {
            flowDefinition = JSON.parse(match[1]) as FlowDefinition;
            parseError = undefined;
            request.log.info({ event: 'ai_flow_generate_fence_rescued', tenantId },
              'AI generate-flow: JSON rescued from markdown fences');
          } catch {
            // Keep parseError
          }
        }
      }

      // If we still have no nodes and there's a parse error, fail hard
      if (parseError && (!flowDefinition.nodes || flowDefinition.nodes.length === 0)) {
        request.log.error({
          event: 'ai_flow_generate_empty_result',
          tenantId,
          parseError,
          rawContent,
        }, 'AI generate-flow: failed — empty nodes after all parse attempts');
        return reply.status(502).send({
          error: `AI returned an unparseable response. ${parseError}. Try rephrasing your prompt.`,
        });
      }

      // 4. Extract placeholder templates
      const nodes = flowDefinition?.nodes ?? [];
      const missingTemplates = nodes
        .filter((n: any) => n.config?.templatePlaceholder === true)
        .map((n: any) => ({
          nodeId: n.id,
          suggestedName: n.config?.templateName ?? '',
          suggestedBody: n.config?.suggestedBody ?? '',
        }));

      // 5. Compliance warnings
      const warnings: string[] = [];
      const hasDelay = nodes.some((n: any) => n.type === 'DELAY');
      if (!hasDelay && nodes.length > 2) {
        warnings.push('No DELAY nodes found — consider adding delays between messages (min 3000ms).');
      }
      const hasEndFlow = nodes.some((n: any) => n.type === 'END_FLOW');
      if (!hasEndFlow) {
        warnings.push('No END_FLOW node found — all flows should have at least one exit point.');
      }

      // 6. Stub risk estimate (draft flows cannot be activated until real compute runs)
      const { score: riskScoreEstimate } = computeRiskScore({
        broadcastsSent7d: 0,
        uniqueOptedInBuyers: 0,
        averageTemplateQualityScore: 1,
        noReplyRate7d: 0,
        buyersWithInboundHistory: 0,
        totalBuyers: 0,
        averageDelayBetweenNodesMs: hasDelay ? 3000 : 0,
      });

      return reply.send({
        flowDefinition,
        missingTemplates,
        warnings,
        riskScoreEstimate,
        ...(parseError ? { parseError } : {}),
      });
    },
  );

  /**
   * POST /v1/ai/modify-flow
   * Modify an existing FlowDefinition via natural language instruction (PRD §9.3).
   * Body: { flowId, instruction }
   */
  fastify.post<{
    Body: { flowId: string; instruction: string };
  }>(
    '/v1/ai/modify-flow',
    { preHandler: [fastify.authenticate, requireFeature('ai_flow_generator')] },
    async (request, reply) => {
      const { flowId, instruction } = request.body ?? {};
      if (!flowId?.trim()) return reply.status(400).send({ error: 'flowId is required' });
      if (!instruction?.trim()) return reply.status(400).send({ error: 'instruction is required' });

      const { tenantId } = request.user;

      const flow = await db.query.flowDefinitions.findFirst({
        where: eq(flowDefinitions.id, flowId),
        columns: { tenantId: true, definition: true },
      });

      if (!flow || flow.tenantId !== tenantId) {
        return reply.status(404).send({ error: 'Flow not found' });
      }

      const userMessage = buildFlowModPrompt({
        instruction,
        currentFlow: flow.definition,
      });

      const llm = getLLMClient();
      let rawContent = '';

      try {
        const response = await llm.chat(
          [{ role: 'user', content: userMessage }],
          {
            system: FLOW_MODIFICATION_SYSTEM_PROMPT,
            maxTokens: 4096,
            temperature: 0.3,
            responseFormat: 'json_object',
          },
        );
        if ((response as any).modelId === 'error') {
          request.log.error({
            event: 'ai_flow_modify_dual_failure',
            tenantId,
            flowId,
            rawContent: response.content,
            latencyMs: response.latencyMs,
          }, 'AI modify-flow: both primary and fallback models failed');
          return reply.status(502).send({ error: 'AI service temporarily unavailable. Try again in a few minutes.' });
        }
        request.log.info({
          event: 'ai_flow_modify_llm_ok',
          tenantId,
          flowId,
          modelId: response.modelId,
          tokensUsed: response.tokensUsed,
          latencyMs: response.latencyMs,
          rawContentPreview: response.content.slice(0, 300),
        }, 'AI modify-flow: LLM response received');
        rawContent = response.content;
      } catch (err: any) {
        request.log.error({
          event: 'ai_flow_modify_llm_throw',
          tenantId,
          flowId,
          err: err?.message,
        }, 'AI modify-flow: llm.chat() threw');
        return reply.status(502).send({ error: `AI modification failed: ${err?.message ?? 'unknown'}` });
      }

      let flowDefinition: FlowDefinition = { nodes: [], edges: [] };
      let parseError: string | undefined;

      try {
        flowDefinition = JSON.parse(rawContent) as FlowDefinition;
      } catch (e: any) {
        parseError = `JSON parse failed: ${e.message}`;
        request.log.warn({
          event: 'ai_flow_modify_json_parse_fail',
          tenantId,
          flowId,
          parseError,
          rawContent,
        }, 'AI modify-flow: JSON.parse failed, attempting markdown fence extraction');
        const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match?.[1]) {
          try {
            flowDefinition = JSON.parse(match[1]) as FlowDefinition;
            parseError = undefined;
          } catch { /* keep parseError */ }
        }
      }

      const missingTemplates = (flowDefinition?.nodes ?? [])
        .filter((n: any) => n.config?.templatePlaceholder === true)
        .map((n: any) => ({
          nodeId: n.id,
          suggestedName: n.config?.templateName ?? '',
          suggestedBody: n.config?.suggestedBody ?? '',
        }));

      return reply.send({
        flowDefinition,
        missingTemplates,
        warnings: [],
        riskScoreEstimate: 10, // conservative default for modifications
        ...(parseError ? { parseError } : {}),
      });
    },
  );
};
