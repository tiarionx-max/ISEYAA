import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
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
});
