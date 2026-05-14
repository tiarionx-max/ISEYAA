import { Controller, Post, Headers, Body, RawBodyRequest, Req, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('paystack')
  @HttpCode(200)
  @ApiOperation({ summary: 'Paystack payment webhook' })
  handlePaystack(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.webhooksService.handlePaystack(signature, body, req.rawBody);
  }

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
