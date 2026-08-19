import { Controller, Post, Headers, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('flutterwave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Flutterwave payment webhook' })
  handleFlutterwave(
    @Headers('verif-hash') hash: string,
    @Body() body: any,
  ) {
    return this.webhooksService.handleFlutterwave(hash, body);
  }
}
