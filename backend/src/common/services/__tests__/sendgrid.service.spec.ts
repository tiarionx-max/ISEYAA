import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SendgridService } from '../sendgrid.service';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'RESEND_API_KEY') return 're_test_key_1234567890';
    return def;
  }),
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
    it('Test 1: resolves when resend.emails.send() resolves, and includes the exact otp string in the HTML body', async () => {
      mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });

      await expect(service.sendOtpEmail('user@example.com', 'Ade', '482913')).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentArgs = mockSend.mock.calls[0][0];
      expect(sentArgs.html).toContain('482913');
      expect(sentArgs.to).toBe('user@example.com');
    });

    it('Test 2: REJECTS (propagates a real Error) when resend.emails.send() resolves with { error } — proves Pitfall 1 is fixed', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Resend API error', name: 'application_error', statusCode: 500 },
      });

      await expect(service.sendOtpEmail('user@example.com', 'Ade', '482913')).rejects.toThrow(
        'Resend send failed: application_error - Resend API error',
      );
    });
  });

  describe('sendEmail — regression', () => {
    it('Test 3: still resolves without throwing when resend.emails.send() resolves with { error } (existing fire-and-forget behavior unchanged)', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Resend API error', name: 'application_error', statusCode: 500 },
      });

      await expect(
        service.sendEmail('user@example.com', 'Subject', '<p>body</p>'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendMinistryDigest', () => {
    it('Test 1: resolves when resend.emails.send() resolves, and captured call args include to[] and a 2-entry attachments array mapped to Resend shape', async () => {
      mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });

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

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentArgs = mockSend.mock.calls[0][0];
      expect(sentArgs.to).toEqual(['a@gov.ng', 'b@gov.ng']);
      expect(sentArgs.attachments).toHaveLength(2);
      expect(sentArgs.attachments).toEqual([
        { content: 'base64pdf', filename: 'ministry-digest.pdf', contentType: 'application/pdf' },
        { content: 'base64csv', filename: 'ministry-digest.csv', contentType: 'text/csv' },
      ]);
    });

    it('Test 2: omitting attachments (or passing an empty array) results in resend.emails.send() being called WITHOUT an attachments key at all', async () => {
      mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });

      await service.sendMinistryDigest({
        to: ['a@gov.ng'],
        subject: 'Ministry Export Digest',
        html: '<p>...</p>',
      });

      let sentArgs = mockSend.mock.calls[0][0];
      expect(sentArgs).not.toHaveProperty('attachments');

      jest.clearAllMocks();
      mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });

      await service.sendMinistryDigest({
        to: ['a@gov.ng'],
        subject: 'Ministry Export Digest',
        html: '<p>...</p>',
        attachments: [],
      });

      sentArgs = mockSend.mock.calls[0][0];
      expect(sentArgs).not.toHaveProperty('attachments');
    });

    it('Test 3: REJECTS (propagates a real Error) when resend.emails.send() resolves with { error } — proves the same NO-swallow contract as sendOtpEmail', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Resend API error', name: 'application_error', statusCode: 500 },
      });

      await expect(
        service.sendMinistryDigest({
          to: ['a@gov.ng'],
          subject: 'Ministry Export Digest',
          html: '<p>...</p>',
        }),
      ).rejects.toThrow('Resend send failed: application_error - Resend API error');
    });
  });
});
