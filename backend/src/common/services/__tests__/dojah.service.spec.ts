import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { DojahService } from '../dojah.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DojahService', () => {
  let service: DojahService;
  let mockConfig: { get: jest.Mock };

  async function build(env: Record<string, unknown>): Promise<DojahService> {
    mockConfig = {
      get: jest.fn((key: string, def?: unknown) => (env as Record<string, unknown>)[key] ?? def),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DojahService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    return module.get<DojahService>(DojahService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyNin() — unconfigured keys', () => {
    it('production + no keys -> throws ServiceUnavailableException, axios never called', async () => {
      service = await build({ NODE_ENV: 'production' });

      await expect(service.verifyNin('12345678901')).rejects.toThrow(ServiceUnavailableException);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('non-production (undefined NODE_ENV) + no keys -> returns stub verified:true', async () => {
      service = await build({});

      const result = await service.verifyNin('12345678901');

      expect(result).toEqual({ verified: true, name: 'Stub User' });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('development NODE_ENV + no keys -> returns stub verified:true', async () => {
      service = await build({ NODE_ENV: 'development' });

      const result = await service.verifyNin('12345678901');

      expect(result).toEqual({ verified: true, name: 'Stub User' });
    });

    it('test NODE_ENV + no keys -> returns stub verified:true', async () => {
      service = await build({ NODE_ENV: 'test' });

      const result = await service.verifyNin('12345678901');

      expect(result).toEqual({ verified: true, name: 'Stub User' });
    });
  });

  describe('verifyNin() — keys present', () => {
    beforeEach(async () => {
      service = await build({ DOJAH_API_KEY: 'key123', DOJAH_APP_ID: 'app123' });
    });

    it('returns the mapped result on axios.get success', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { entity: { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01' } },
      });

      const result = await service.verifyNin('12345678901');

      expect(result).toEqual({
        verified: true,
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
      });
    });

    it('throws BadRequestException when axios.get rejects', async () => {
      mockedAxios.get.mockRejectedValue(new Error('network error'));

      await expect(service.verifyNin('12345678901')).rejects.toThrow(BadRequestException);
    });
  });
});
