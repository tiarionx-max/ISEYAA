import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ItineraryDto } from './dto/itinerary.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.anthropic = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') ?? 'dummy' });
  }

  async streamChat(userId: string, message: string, res: Response) {
    const systemPrompt = `You are ISEYAA Assistant — the AI companion of Ogun State's digital super-platform.
You help citizens discover tourism attractions, book events and stays, navigate government services,
and understand opportunities across Ogun State's 20 LGAs.
Be concise, helpful, and culturally aware. Respond in the user's language (English or Yoruba).`;

    try {
      const stream = await this.anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      this.logger.error('AI stream error', err);
      res.write(`data: ${JSON.stringify({ error: 'AI service unavailable' })}\n\n`);
      res.end();
    }
  }

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

      const prompt = `You are ISEYAA Travel Planner — the intelligent itinerary engine for Ogun State, Nigeria's premier digital platform.

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
      const stream = await this.anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

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

  async getLgaIntelligence(lgaId: string, question: string) {
    const lga = await this.prisma.lGA.findUnique({ where: { id: lgaId } });

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `LGA: ${lga?.name ?? lgaId}\nQuestion: ${question}\nProvide a concise intelligence brief for Ogun State officials.`,
        },
      ],
    });

    return { answer: (response.content[0] as any).text, lgaId };
  }
}
