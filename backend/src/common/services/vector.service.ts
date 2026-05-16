import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Index } from '@upstash/vector';

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);
  private index: Index | null = null;

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('UPSTASH_VECTOR_REST_URL');
    const token = this.config.get<string>('UPSTASH_VECTOR_REST_TOKEN');

    if (url && token) {
      this.index = new Index({ url, token });
    } else {
      this.logger.warn(
        '[UPSTASH VECTOR STUB] vector personalisation disabled — set UPSTASH_VECTOR_REST_URL/TOKEN to enable',
      );
    }
  }

  async upsertInteraction(userId: string, message: string, response: string): Promise<void> {
    if (this.index === null) {
      return;
    }
    try {
      await this.index.upsert(
        {
          id: `${userId}-${Date.now()}`,
          data: `User: ${message}\nAI: ${response.slice(0, 200)}`,
          metadata: { userId, timestamp: Date.now(), type: 'chat' },
        },
        { namespace: 'user-interactions' },
      );
    } catch (err: any) {
      this.logger.error('Upstash upsert failed', err?.message);
      // Fire-and-forget: never throw into the caller
    }
  }

  async getPersonalisedContext(userId: string, currentMessage: string): Promise<string> {
    if (this.index === null) {
      return '';
    }
    try {
      // userId comes from JWT (req.user.userId) — never user-supplied; filter injection is not a risk here
      const results = await this.index.query(
        {
          data: currentMessage,
          topK: 5,
          filter: `userId = '${userId}'`,
          includeMetadata: true,
        },
        { namespace: 'user-interactions' },
      );
      return results
        .filter((r) => r.score > 0.7)
        .map((r) => (r.metadata as any)?.summary ?? '')
        .join('\n');
    } catch (err: any) {
      this.logger.error('Upstash query failed', err?.message);
      return '';
    }
  }
}
