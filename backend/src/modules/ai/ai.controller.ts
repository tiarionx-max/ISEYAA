import { Controller, Post, Body, Res, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ItineraryDto } from './dto/itinerary.dto';
import { ChatDto } from './dto/chat.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chat with Iṣẹ́yáá AI concierge (multi-turn, streaming SSE, tool use)' })
  async chat(
    @Req() req: any,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    await this.aiService.streamChatWithTools(req.user.userId, dto, res);
  }

  @Post('recommend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Personalised recommendations powered by Upstash Vector' })
  recommend(@Req() req: any, @Body() body: { query: string }) {
    return this.aiService.getRecommendations(req.user.userId, body.query ?? '');
  }

  @Post('itinerary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate AI travel itinerary with real platform data (streaming SSE)' })
  async itinerary(@Body() dto: ItineraryDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    await this.aiService.streamItinerary(dto, res);
  }

  @Post('lga-intel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI-powered LGA intelligence insights' })
  lgaIntel(@Body() body: { lgaId: string; question: string }) {
    return this.aiService.getLgaIntelligence(body.lgaId, body.question);
  }
}
