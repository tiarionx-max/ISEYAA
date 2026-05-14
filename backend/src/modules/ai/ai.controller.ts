import { Controller, Post, Body, Res, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ItineraryDto } from './dto/itinerary.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chat with ISEYAA AI assistant (streaming SSE)' })
  async chat(
    @Req() req: any,
    @Body() body: { message: string; conversationId?: string },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    await this.aiService.streamChat(req.user.userId, body.message, res);
  }

  @Post('itinerary')
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
