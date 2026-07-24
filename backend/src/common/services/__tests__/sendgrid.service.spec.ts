import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { SendgridService } from '../sendgrid.service';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => def),
};

describe('SendgridService', () => {
  let service: SendgridService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SendgridService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    service = module.get<SendgridService>(SendgridService);
  });

  describe('sendOtpEmail', () => {
    it('Test 1: resolves when sgMail.send() resolves, and includes the exact otp string in the HTML body', async () => {
      (sgMail.send as jest.Mock).mockResolvedValue([{}, {}]);

      await expect(service.sendOtpEmail('user@example.com', 'Ade', '482913')).resolves.toBeUndefined();

      expect(sgMail.send).toHaveBeenCalledTimes(1);
      const sentArgs = (sgMail.send as jest.Mock).mock.calls[0][0];
      expect(sentArgs.html).toContain('482913');
      expect(sentArgs.to).toBe('user@example.com');
    });

    it('Test 2: REJECTS (propagates the sgMail.send() error) when sgMail.send() rejects — proves Pitfall 1 is fixed', async () => {
      (sgMail.send as jest.Mock).mockRejectedValue(new Error('SendGrid API error'));

      await expect(service.sendOtpEmail('user@example.com', 'Ade', '482913')).rejects.toThrow(
        'SendGrid API error',
      );
    });
  });

  describe('sendEmail — regression', () => {
    it('Test 3: still resolves without throwing when sgMail.send() rejects (existing fire-and-forget behavior unchanged)', async () => {
      (sgMail.send as jest.Mock).mockRejectedValue(new Error('SendGrid API error'));

      await expect(
        service.sendEmail('user@example.com', 'Subject', '<p>body</p>'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendMinistryDigest', () => {
    it('Test 1: resolves when sgMail.send() resolves, and captured call args include to[] and a 2-entry attachments array matching input verbatim', async () => {
      (sgMail.send as jest.Mock).mockResolvedValue([{}, {}]);

      const attachments = [
        { content: 'base64pdf', filename: 'ministry-digest.pdf', type: 'application/pdf', disposition: 'attachment' },
        { content: 'base64csv', filename: 'ministry-digest.csv', type: 'text/csv', disposition: 'attachment' },
      ];

      await expect(
        service.sendMinistryDigest({
          to: ['a@gov.ng', 'b@gov.ng'],
          subject: 'Ministry Export Digest',
          html: '<p>...</p>',
          attachments,
        }),
      ).resolves.toBeUndefined();

      expect(sgMail.send).toHaveBeenCalledTimes(1);
      const sentArgs = (sgMail.send as jest.Mock).mock.calls[0][0];
      expect(sentArgs.to).toEqual(['a@gov.ng', 'b@gov.ng']);
      expect(sentArgs.attachments).toHaveLength(2);
      expect(sentArgs.attachments).toEqual(attachments);
    });

    it('Test 2: omitting attachments (or passing an empty array) results in sgMail.send() being called WITHOUT an attachments key at all', async () => {
      (sgMail.send as jest.Mock).mockResolvedValue([{}, {}]);

      await service.sendMinistryDigest({
        to: ['a@gov.ng'],
        subject: 'Ministry Export Digest',
        html: '<p>...</p>',
      });

      let sentArgs = (sgMail.send as jest.Mock).mock.calls[0][0];
      expect(sentArgs).not.toHaveProperty('attachments');

      jest.clearAllMocks();
      (sgMail.send as jest.Mock).mockResolvedValue([{}, {}]);

      await service.sendMinistryDigest({
        to: ['a@gov.ng'],
        subject: 'Ministry Export Digest',
        html: '<p>...</p>',
        attachments: [],
      });

      sentArgs = (sgMail.send as jest.Mock).mock.calls[0][0];
      expect(sentArgs).not.toHaveProperty('attachments');
    });

    it('Test 3: REJECTS (propagates the sgMail.send() error) when sgMail.send() rejects — proves the same NO-swallow contract as sendOtpEmail', async () => {
      (sgMail.send as jest.Mock).mockRejectedValue(new Error('SendGrid API error'));

      await expect(
        service.sendMinistryDigest({
          to: ['a@gov.ng'],
          subject: 'Ministry Export Digest',
          html: '<p>...</p>',
        }),
      ).rejects.toThrow('SendGrid API error');
    });
  });
});
