import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class SendgridService {
  private readonly logger = new Logger(SendgridService.name);
  private readonly from: string;

  constructor(private config: ConfigService) {
    this.from = config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@iseyaa.gov.ng');
    const key = config.get<string>('SENDGRID_API_KEY', '');
    if (key && key !== 'SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
      sgMail.setApiKey(key);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await sgMail.send({ to, from: this.from, subject, html });
    } catch (err) {
      this.logger.error(`SendGrid failed for ${to}: ${err?.response?.body ?? err.message}`);
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
}
