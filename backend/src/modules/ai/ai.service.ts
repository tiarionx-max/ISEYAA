import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { VectorService } from '../../common/services/vector.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { ItineraryDto } from './dto/itinerary.dto';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic: Anthropic;

  // ── Tool definitions ──────────────────────────────────────────────────────
  private readonly TOOLS = [
    {
      name: 'get_attractions',
      description:
        'Find tourist attractions in Ogun State. Use when user asks about places to visit, sightseeing, or tourism.',
      input_schema: {
        type: 'object' as const,
        properties: {
          lgaSlug: { type: 'string', description: 'LGA slug, e.g. abeokuta-south' },
          category: {
            type: 'string',
            enum: ['NATURAL', 'CULTURAL', 'HISTORICAL', 'RECREATIONAL', 'RELIGIOUS'],
          },
          limit: { type: 'number', description: 'Max results, default 5' },
        },
        required: ['lgaSlug'],
      },
    },
    {
      name: 'get_events',
      description:
        'Find upcoming events in Ogun State. Use when user asks about activities, festivals, concerts, or things to do.',
      input_schema: {
        type: 'object' as const,
        properties: {
          lgaSlug: { type: 'string', description: 'Optional LGA slug to filter by location' },
          days: { type: 'number', description: 'Look-ahead window in days, default 14' },
          limit: { type: 'number', description: 'Max results, default 5' },
        },
        required: [],
      },
    },
    {
      name: 'get_stays',
      description:
        'Find accommodation options in Ogun State. Use when user asks about hotels, guesthouses, or places to stay.',
      input_schema: {
        type: 'object' as const,
        properties: {
          lgaSlug: { type: 'string', description: 'Optional LGA slug to filter by location' },
          maxPriceNgn: { type: 'number', description: 'Maximum price per night in NGN' },
          limit: { type: 'number', description: 'Max results, default 5' },
        },
        required: [],
      },
    },
    {
      name: 'get_ride_estimate',
      description: 'Estimate the cost of a ride between two locations in Ogun State.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pickup: { type: 'string', description: 'Pickup location name or address' },
          dropoff: { type: 'string', description: 'Dropoff location name or address' },
          vehicleType: { type: 'string', enum: ['car', 'bike', 'tricycle'] },
        },
        required: ['pickup', 'dropoff'],
      },
    },
    {
      name: 'get_weather',
      description: 'Get the current weather conditions for a location in Ogun State.',
      input_schema: {
        type: 'object' as const,
        properties: {
          location: { type: 'string', description: 'Location name, e.g. Abeokuta' },
        },
        required: ['location'],
      },
    },
  ];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private vector: VectorService, // injected from CommonModule (@Global)
    private resilience: ResilienceService,
  ) {
    // maxRetries: 0 — cockatiel is the single source of retry truth for this vendor
    // (RESEARCH.md Pitfall 3: avoid compounding SDK retries with cockatiel retries).
    this.anthropic = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') ?? 'dummy', maxRetries: 0 });
  }

  // ── System prompt ──────────────────────────────────────────────────────────

  private buildSystemPrompt(personalisedContext: string, lgaId?: string | null): string {
    const base = `You are Iṣẹ́yáá Assistant — the AI companion of Ogun State's digital super-platform.
You help citizens discover tourism attractions, book events and stays, navigate government services,
and understand opportunities across Ogun State's 20 LGAs.
Be concise, helpful, and culturally aware. Respond in the user's language (English or Yoruba).`;

    const lgaContext = lgaId ? `\nUSER'S HOME LGA ID: ${lgaId} — prefer results from this LGA when relevant.` : '';

    if (personalisedContext && personalisedContext.length > 0) {
      return `${base}${lgaContext}\n\nPERSONALISED CONTEXT FROM PRIOR INTERACTIONS:\n${personalisedContext}`;
    }
    return `${base}${lgaContext}`;
  }

  // ── Tool executors ─────────────────────────────────────────────────────────

  // ── Tool: get_attractions ──────────────────────────────────────────────────
  private async tool_get_attractions(input: {
    lgaSlug: string;
    category?: string;
    limit?: number;
  }): Promise<unknown> {
    const lga = await this.prisma.lGA.findFirst({
      where: { slug: input.lgaSlug, deletedAt: null },
    });
    if (!lga) {
      return { error: 'LGA not found' };
    }
    const items = await this.prisma.attraction.findMany({
      where: {
        lgaId: lga.id,
        isActive: true,
        deletedAt: null,
        ...(input.category && { category: input.category as any }),
      },
      select: { id: true, name: true, slug: true, category: true, entryFee: true, address: true },
      take: Math.min(input.limit ?? 5, 10),
    });
    return { count: items.length, items };
  }

  // ── Tool: get_events ───────────────────────────────────────────────────────
  private async tool_get_events(input: {
    lgaSlug?: string;
    days?: number;
    limit?: number;
  }): Promise<unknown> {
    const now = new Date();
    const endWindow = new Date(now);
    endWindow.setDate(now.getDate() + (input.days ?? 14));

    let lgaId: string | undefined;
    if (input.lgaSlug) {
      const lga = await this.prisma.lGA.findFirst({
        where: { slug: input.lgaSlug, deletedAt: null },
      });
      lgaId = lga?.id;
    }

    const items = await this.prisma.event.findMany({
      where: {
        ...(lgaId && { lgaId }),
        startDate: { gte: now, lte: endWindow },
        status: { in: ['APPROVED', 'PUBLISHED'] as any },
        deletedAt: null,
      },
      select: { id: true, title: true, slug: true, startDate: true, venue: true },
      take: Math.min(input.limit ?? 5, 10),
    });
    return { count: items.length, items };
  }

  // ── Tool: get_stays ────────────────────────────────────────────────────────
  private async tool_get_stays(input: {
    lgaSlug?: string;
    maxPriceNgn?: number;
    limit?: number;
  }): Promise<unknown> {
    let lgaId: string | undefined;
    if (input.lgaSlug) {
      const lga = await this.prisma.lGA.findFirst({
        where: { slug: input.lgaSlug, deletedAt: null },
      });
      lgaId = lga?.id;
    }

    const items = await this.prisma.property.findMany({
      where: {
        ...(lgaId && { lgaId }),
        isActive: true,
        deletedAt: null,
        ...(input.maxPriceNgn && { pricePerNight: { lte: input.maxPriceNgn } }),
      },
      select: { id: true, name: true, slug: true, type: true, pricePerNight: true, amenities: true },
      take: Math.min(input.limit ?? 5, 10),
      orderBy: { pricePerNight: 'asc' },
    });
    return { count: items.length, items };
  }

  // ── Tool: get_ride_estimate (stub — Phase 6) ───────────────────────────────
  private async tool_get_ride_estimate(input: {
    pickup: string;
    dropoff: string;
    vehicleType?: string;
  }): Promise<unknown> {
    this.logger.warn('[RIDE ESTIMATE STUB] real estimate requires geocoder integration in Phase 6');
    return {
      estimateNgn: 1500,
      lowNgn: 1200,
      highNgn: 1800,
      vehicleType: input.vehicleType ?? 'car',
      stub: true,
    };
  }

  // ── Tool: get_weather (stub — no weather provider in MVP) ─────────────────
  private async tool_get_weather(input: { location: string }): Promise<unknown> {
    this.logger.warn('[WEATHER STUB] no weather provider configured');
    return { temperatureC: 29, condition: 'partly cloudy', location: input.location, stub: true };
  }

  // ── Tool dispatcher ────────────────────────────────────────────────────────
  private async executeTool(name: string, input: any): Promise<unknown> {
    switch (name) {
      case 'get_attractions':
        return this.tool_get_attractions(input);
      case 'get_events':
        return this.tool_get_events(input);
      case 'get_stays':
        return this.tool_get_stays(input);
      case 'get_ride_estimate':
        return this.tool_get_ride_estimate(input);
      case 'get_weather':
        return this.tool_get_weather(input);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // ── streamChatWithTools ───────────────────────────────────────────────────

  async streamChatWithTools(userId: string, dto: ChatDto, res: Response) {
    // L-03: stub guard — fail fast if ANTHROPIC_API_KEY is absent (dev/CI without key)
    if (!this.config.get('ANTHROPIC_API_KEY')) {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI stream unavailable (stub mode)');
      res.write(`data: ${JSON.stringify({ error: 'AI service not configured' })}\n\n`);
      res.end();
      return;
    }

    try {
      // ── 1. Load user context ──────────────────────────────────────────────
      const user = await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: { id: true, lgaId: true },
      });

      // ── 2. Query vector personalisation ──────────────────────────────────
      const lastUserMsg =
        [...dto.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const personalised = await this.vector.getPersonalisedContext(userId, lastUserMsg);

      // ── 3. Build system prompt ────────────────────────────────────────────
      const systemPrompt = this.buildSystemPrompt(personalised, user?.lgaId);

      // ── 4. Agentic loop ───────────────────────────────────────────────────
      const messageHistory = dto.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as any[];

      let accumulatedText = '';

      for (let turn = 0; turn < 3; turn++) {
        // Connection-only retry boundary: resilience wraps only establishing the stream.
        // A mid-stream failure (after the first token) is never retried (RESEARCH.md).
        const stream = await this.resilience.execute('anthropic', async ({ signal }) =>
          this.anthropic.messages.stream(
            {
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1024,
              system: systemPrompt,
              tools: this.TOOLS,
              messages: messageHistory,
            },
            { signal },
          ),
        );

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            accumulatedText += chunk.delta.text;
            res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
          }
        }

        // Use finalMessage() to get assembled tool_use inputs — do NOT reconstruct
        // from input_json_delta deltas (RESEARCH Pitfall 1)
        const finalMessage = await stream.finalMessage();

        if (finalMessage.stop_reason === 'end_turn' || finalMessage.stop_reason === 'stop_sequence') {
          break;
        }

        if (finalMessage.stop_reason === 'tool_use') {
          const toolUses = finalMessage.content.filter((b: any) => b.type === 'tool_use');
          const toolResults: any[] = [];

          for (const toolUse of toolUses) {
            const result = await this.executeTool((toolUse as any).name, (toolUse as any).input);
            res.write(
              `data: ${JSON.stringify({ tool: (toolUse as any).name, result })}\n\n`,
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: (toolUse as any).id,
              content: JSON.stringify(result),
            });
          }

          messageHistory.push({ role: 'assistant', content: finalMessage.content });
          messageHistory.push({ role: 'user', content: toolResults });
        } else {
          // max_tokens or other stop reason — terminate the loop
          break;
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();

      // ── 5. Upsert interaction (fire-and-forget) ───────────────────────────
      this.vector
        .upsertInteraction(userId, lastUserMsg, accumulatedText)
        .catch((err: any) => this.logger.error('vector upsert failed', err?.message));
    } catch (err) {
      this.logger.error('AI stream error', err);
      res.write(`data: ${JSON.stringify({ error: 'AI service unavailable' })}\n\n`);
      res.end();
    }
  }

  // ── getRecommendations ─────────────────────────────────────────────────────

  async getRecommendations(
    userId: string,
    query: string,
  ): Promise<{ context: string; suggestions: string[] }> {
    const context = await this.vector.getPersonalisedContext(userId, query);
    this.logger.log('getRecommendations', {
      userId,
      queryLen: query.length,
      hasContext: context.length > 0,
    });
    // Actual suggestion ranking is a Phase 6 enhancement
    return { context, suggestions: [] };
  }

  // ── streamItinerary ───────────────────────────────────────────────────────

  async streamItinerary(dto: ItineraryDto, res: Response) {
    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // ── 1. Fetch LGA ────────────────────────────────────────────────────
      sendEvent('status', { message: 'Fetching destination data…' });

      const lga = await this.prisma.lGA.findFirst({
        where: { slug: dto.startLgaSlug, deletedAt: null },
      });
      if (!lga) {
        sendEvent('error', { message: `LGA '${dto.startLgaSlug}' not found` });
        res.end();
        return;
      }

      // ── 2. Fetch relevant attractions ────────────────────────────────────
      sendEvent('status', { message: 'Loading attractions…' });

      const attractions = await this.prisma.attraction.findMany({
        where: { lgaId: lga.id, isActive: true, deletedAt: null },
        select: { id: true, name: true, slug: true, description: true, category: true, entryFee: true, address: true },
        take: 20,
      });

      // ── 3. Fetch nearby events ───────────────────────────────────────────
      sendEvent('status', { message: 'Checking upcoming events…' });

      const now = new Date();
      const endWindow = new Date(now);
      endWindow.setDate(now.getDate() + dto.durationDays + 7);

      const events = await this.prisma.event.findMany({
        where: {
          lgaId: lga.id,
          startDate: { gte: now, lte: endWindow },
          status: { in: ['APPROVED', 'PUBLISHED'] as any },
          deletedAt: null,
        },
        select: { id: true, title: true, slug: true, startDate: true, venue: true },
        take: 8,
      });

      // ── 4. Fetch available stays ─────────────────────────────────────────
      sendEvent('status', { message: 'Finding available accommodation…' });

      const properties = await this.prisma.property.findMany({
        where: { lgaId: lga.id, isActive: true, deletedAt: null },
        select: { id: true, name: true, slug: true, type: true, pricePerNight: true, amenities: true },
        take: 8,
        orderBy: { pricePerNight: 'asc' },
      });

      // ── 5. Build context for Claude ─────────────────────────────────────
      const lgaMeta = lga.metadata as Record<string, any> | null;
      const context = [
        `DESTINATION: ${lga.name}, Ogun State, Nigeria`,
        lgaMeta?.history ? `HISTORY: ${lgaMeta.history.slice(0, 400)}` : '',
        `\nATTRACTIONS (${attractions.length} available):`,
        ...attractions.map(
          (a) =>
            `- ${a.name} [${a.category}] | Entry: ₦${a.entryFee ?? 0} | ${a.address} | Link: /api/v1/attractions/${a.id}`,
        ),
        events.length > 0
          ? `\nUPCOMING EVENTS (${events.length}):` +
            events
              .map((e) => `\n- ${e.title} on ${e.startDate.toLocaleDateString()} at ${e.venue} | Link: /api/v1/events/${e.slug}`)
              .join('')
          : '\nNo upcoming events in this period.',
        properties.length > 0
          ? `\nACCOMMODATION OPTIONS (${properties.length}):` +
            properties
              .map(
                (p) =>
                  `\n- ${p.name} [${p.type}] ₦${p.pricePerNight}/night | Link: /api/v1/stays/${p.slug}`,
              )
              .join('')
          : '\nNo accommodation currently listed.',
      ]
        .filter(Boolean)
        .join('\n');

      const prompt = `You are Iṣẹ́yáá Travel Planner — the intelligent itinerary engine for Ogun State, Nigeria's premier digital platform.

TRIP REQUEST:
- Duration: ${dto.durationDays} day(s)
- Starting LGA: ${lga.name}
- Interests: ${dto.interests.join(', ')}
- Budget: ₦${dto.budgetNgn.toLocaleString()} total
- Party size: ${dto.partySize} person(s)

REAL PLATFORM DATA:
${context}

Generate a detailed ${dto.durationDays}-day itinerary using the REAL attractions, events, and stays above.
Each activity MUST include the exact platform_link from the data above (e.g., /api/v1/attractions/...).
Stay within the ₦${dto.budgetNgn.toLocaleString()} total budget for ${dto.partySize} person(s).

Respond with ONLY valid JSON matching this exact structure — no markdown, no explanation:
{
  "title": "string",
  "overview": "string",
  "days": [
    {
      "day": 1,
      "title": "string",
      "activities": [
        {
          "time": "HH:MM",
          "name": "string",
          "description": "string",
          "type": "attraction|event|stay|food|transport",
          "platform_link": "/api/v1/attractions/{id}",
          "estimated_cost_ngn": 0
        }
      ],
      "accommodation": { "name": "string", "platform_link": "/api/v1/stays/{slug}", "price_per_night_ngn": 0 },
      "day_budget_ngn": 0
    }
  ],
  "total_budget_estimate_ngn": 0,
  "tips": ["string"]
}`;

      // ── 6. Stream Claude response ────────────────────────────────────────
      sendEvent('status', { message: 'Generating your itinerary…' });

      let fullText = '';
      // Connection-only retry boundary — see streamChatWithTools comment above.
      const stream = await this.resilience.execute('anthropic', async ({ signal }) =>
        this.anthropic.messages.stream(
          {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
          },
          { signal },
        ),
      );

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text;
          sendEvent('delta', { text: chunk.delta.text });
        }
      }

      // ── 7. Parse and emit structured itinerary ───────────────────────────
      try {
        const parsed = JSON.parse(fullText);
        sendEvent('itinerary', parsed);
      } catch {
        this.logger.warn('Claude output was not valid JSON — sending raw text');
        sendEvent('itinerary', { raw: fullText });
      }

      sendEvent('done', {});
      res.end();
    } catch (err) {
      this.logger.error('Itinerary stream error', err);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI service unavailable' })}\n\n`);
      res.end();
    }
  }

  // ── getLgaIntelligence ────────────────────────────────────────────────────

  async getLgaIntelligence(lgaId: string, question: string) {
    const lga = await this.prisma.lGA.findUnique({ where: { id: lgaId } });
    // M-06: throw 404 instead of silently substituting lgaId as the name
    if (!lga) throw new NotFoundException(`LGA not found: ${lgaId}`);

    try {
      const response = await this.resilience.execute('anthropic', ({ signal }) =>
        this.anthropic.messages.create(
          {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            messages: [
              {
                role: 'user',
                content: `LGA: ${lga.name}\nQuestion: ${question}\nProvide a concise intelligence brief for Ogun State officials.`,
              },
            ],
          },
          { signal },
        ),
      );

      return { answer: (response.content[0] as any).text, lgaId };
    } catch (err) {
      // T-11-01: never surface raw Anthropic error body/message — static string only.
      this.logger.error('LGA intelligence request failed', err);
      throw new ServiceUnavailableException('AI service is temporarily unavailable, please try again shortly');
    }
  }
}
