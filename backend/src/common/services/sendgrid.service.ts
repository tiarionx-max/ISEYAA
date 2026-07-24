import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

const PLACEHOLDER_KEY = 're_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

@Injectable()
export class SendgridService {
  private readonly logger = new Logger(SendgridService.name);
  private readonly from: string;
  private readonly client?: Resend;

  constructor(private config: ConfigService) {
    this.from = config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@iseyaa.gov.ng');
    const key = config.get<string>('RESEND_API_KEY', '');
    if (key && key !== PLACEHOLDER_KEY) {
      this.client = new Resend(key);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.client) {
      this.logger.error(`Resend not configured (RESEND_API_KEY missing) — email to ${to} not sent`);
      return;
    }
    try {
      const { error } = await this.client.emails.send({ to, from: this.from, subject, html });
      if (error) {
        this.logger.error(`Resend failed for ${to}: ${error.name} - ${error.message}`);
      }
    } catch (err) {
      // defensive only — resend's SDK resolves rather than rejects for API-level
      // failures, but keeps parity if a future SDK version changes this contract
      this.logger.error(`Resend failed for ${to}: ${err.message}`);
    }
  }

  // Deliberately does NOT call this.sendEmail() and has NO try/catch — the caller
  // (resilience.execute('sendgrid', ...) via dispatchOtp in auth.service.ts) depends
  // on a real rejection propagating here to trigger the SMS fallback (OTP-02).
  // Resend never rejects on its own — this explicit `if (error) throw` reconstructs
  // the throw contract @sendgrid/mail used to provide. See RESEARCH.md Pitfall 1.
  async sendOtpEmail(to: string, firstName: string, otp: string): Promise<void> {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Your verification code</h2>
        <p>Hello ${firstName},</p>
        <p style="font-size:28px;font-family:monospace;letter-spacing:4px;font-weight:700;">${otp}</p>
        <p>This code expires in 5 minutes. Do not share it with anyone.</p>
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá — Ogun State Digital Platform</p>
      </div>
    `;

    if (!this.client) {
      throw new Error('Resend client not configured — RESEND_API_KEY missing');
    }
    const { error } = await this.client.emails.send({
      to,
      from: this.from,
      subject: 'Your Iṣẹ́yáá verification code',
      html,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
    }
  }

  async sendTicketConfirmation(params: {
    to: string;
    firstName: string;
    eventTitle: string;
    ticketType: string;
    qrImageUrl: string;
    qrCode: string;
    date: Date;
    venue: string;
  }): Promise<void> {
    const { to, firstName, eventTitle, ticketType, qrImageUrl, qrCode, date, venue } = params;
    const dateStr = new Date(date).toLocaleDateString('en-NG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Ticket Confirmed</h2>
        <p>Hello ${firstName},</p>
        <p>Your ticket for <strong>${eventTitle}</strong> has been confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;"><strong>Ticket Type</strong></td><td style="padding:8px;">${ticketType}</td></tr>
          <tr><td style="padding:8px;"><strong>Date</strong></td><td style="padding:8px;">${dateStr}</td></tr>
          <tr><td style="padding:8px;"><strong>Venue</strong></td><td style="padding:8px;">${venue}</td></tr>
          <tr><td style="padding:8px;"><strong>Ticket Code</strong></td><td style="padding:8px;font-family:monospace;">${qrCode}</td></tr>
        </table>
        <p>Present this QR code at the entrance:</p>
        <img src="${qrImageUrl}" alt="QR Code" style="width:200px;height:200px;display:block;" />
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá — Ogun State Digital Platform</p>
      </div>
    `;

    await this.sendEmail(to, `Your ticket for ${eventTitle}`, html);
  }

  async sendStudioBookingConfirmation(params: {
    to: string;
    firstName: string;
    slotName: string;
    slotType: string;
    startTime: Date;
    endTime: Date;
    totalPrice: number;
  }): Promise<void> {
    const { to, firstName, slotName, slotType, startTime, endTime, totalPrice } = params;
    const fmt = (d: Date) => new Date(d).toLocaleString('en-NG');

    const checklist = [
      'Bring your own storage media (USB drive or hard disk)',
      'Arrive 10 minutes early for setup',
      'Wear comfortable, non-restrictive clothing for recording sessions',
      'Bring any scripts or musical scores',
      'Ensure you have cleared rights for any material you plan to record',
    ];

    const checklistHtml = checklist.map((item) => `<li>${item}</li>`).join('');

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Studio Booking Confirmed</h2>
        <p>Hello ${firstName},</p>
        <p>Your studio booking at <strong>${slotName}</strong> (${slotType}) is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;"><strong>Start</strong></td><td style="padding:8px;">${fmt(startTime)}</td></tr>
          <tr><td style="padding:8px;"><strong>End</strong></td><td style="padding:8px;">${fmt(endTime)}</td></tr>
          <tr><td style="padding:8px;"><strong>Total</strong></td><td style="padding:8px;">&#8358;${totalPrice.toLocaleString()}</td></tr>
        </table>
        <h3>Preparation Checklist</h3>
        <ul>${checklistHtml}</ul>
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá Creative Studio — Ogun State</p>
      </div>
    `;

    await this.sendEmail(to, `Studio booking confirmed — ${slotName}`, html);
  }

  async sendBookingConfirmation(params: {
    to: string;
    firstName: string;
    propertyName: string;
    checkIn: Date;
    checkOut: Date;
    guests: number;
    totalPrice: number;
    role: 'guest' | 'host';
  }): Promise<void> {
    const { to, firstName, propertyName, checkIn, checkOut, guests, totalPrice, role } = params;
    const fmt = (d: Date) => new Date(d).toLocaleDateString('en-NG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

    const subject = role === 'guest' ? `Booking confirmed — ${propertyName}` : `New booking at ${propertyName}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Booking Confirmed</h2>
        <p>Hello ${firstName},</p>
        <p>${role === 'guest' ? `Your booking at <strong>${propertyName}</strong> is confirmed.` : `You have a new booking at <strong>${propertyName}</strong>.`}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;"><strong>Check-in</strong></td><td style="padding:8px;">${fmt(checkIn)}</td></tr>
          <tr><td style="padding:8px;"><strong>Check-out</strong></td><td style="padding:8px;">${fmt(checkOut)}</td></tr>
          <tr><td style="padding:8px;"><strong>Guests</strong></td><td style="padding:8px;">${guests}</td></tr>
          <tr><td style="padding:8px;"><strong>Total</strong></td><td style="padding:8px;">&#8358;${totalPrice.toLocaleString()}</td></tr>
        </table>
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá — Ogun State Digital Platform</p>
      </div>
    `;

    await this.sendEmail(to, subject, html);
  }

  // Deliberately has NO try/catch (mirrors sendOtpEmail(), NOT sendEmail()'s swallow
  // behavior) — the caller (ministry-export-scheduler.service.ts, via
  // resilience.execute('sendgrid', ...)) depends on a real rejection propagating
  // here to mark lastStatus = FAILED.
  async sendMinistryDigest(params: {
    to: string[];
    subject: string;
    html: string;
    attachments?: Array<{ content: string; filename: string; type: string; disposition: string }>;
  }): Promise<void> {
    const { to, subject, html, attachments } = params;

    if (!this.client) {
      throw new Error('Resend client not configured — RESEND_API_KEY missing');
    }
    const { error } = await this.client.emails.send({
      to,
      from: this.from,
      subject,
      html,
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map((a) => ({
              content: a.content,
              filename: a.filename,
              contentType: a.type,
            })),
          }
        : {}),
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
    }
  }
}
