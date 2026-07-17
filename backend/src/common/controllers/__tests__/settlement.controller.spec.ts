import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementService } from '../../services/settlement.service';
import { SettlementController } from '../settlement.controller';

const VENDOR_WALLET_ID = 'WAL-VENDOR-SELF';
const ATTACKER_TARGET_WALLET_ID = 'WAL-SOMEONE-ELSE';
const ADMIN_TARGET_WALLET_ID = 'WAL-ANY-TARGET';
const ADMIN_OWN_WALLET_ID = 'WAL-ADMIN-SELF';
const LGA_TARGET_WALLET_ID = 'WAL-LGA-TARGET';
const LGA_ID_A = 'LGA-A';
const LGA_ID_B = 'LGA-B';

const vendorUser = { userId: 'USR-VENDOR', role: 'VENDOR' };
const superAdminUser = { userId: 'USR-SUPER-ADMIN', role: 'SUPER_ADMIN' };
const lgaAdminUser = { userId: 'USR-LGA-ADMIN', role: 'LGA_ADMIN' };
const citizenNoWalletUser = { userId: 'USR-CITIZEN', role: 'CITIZEN' };

const mockStatementRows = [{ id: 'TXN-1', amount: 100 }];

const mockPrisma = {
  wallet: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockSettlementService = {
  getStatement: jest.fn().mockResolvedValue(mockStatementRows),
};

describe('SettlementController', () => {
  let controller: SettlementController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSettlementService.getStatement.mockResolvedValue(mockStatementRows);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettlementController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettlementService, useValue: mockSettlementService },
      ],
    }).compile();

    controller = module.get<SettlementController>(SettlementController);
  });

  it('self-resolves the wallet for a non-admin user with no walletId supplied', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({ id: VENDOR_WALLET_ID });

    const result = await controller.getStatement(vendorUser);

    expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith({
      where: { userId: vendorUser.userId },
      select: { id: true },
    });
    expect(mockSettlementService.getStatement).toHaveBeenCalledWith(VENDOR_WALLET_ID, {
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(result).toBe(mockStatementRows);
  });

  it('IDOR proof: a non-admin user supplying an attacker-controlled walletId still resolves their own wallet', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({ id: VENDOR_WALLET_ID });

    await controller.getStatement(vendorUser, ATTACKER_TARGET_WALLET_ID);

    expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith({
      where: { userId: vendorUser.userId },
      select: { id: true },
    });
    expect(mockSettlementService.getStatement).toHaveBeenCalledWith(VENDOR_WALLET_ID, {
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(mockSettlementService.getStatement).not.toHaveBeenCalledWith(
      ATTACKER_TARGET_WALLET_ID,
      expect.anything(),
    );
  });

  it('SUPER_ADMIN supplying an explicit walletId bypasses self-resolution entirely', async () => {
    await controller.getStatement(superAdminUser, ADMIN_TARGET_WALLET_ID);

    expect(mockPrisma.wallet.findUnique).not.toHaveBeenCalled();
    expect(mockSettlementService.getStatement).toHaveBeenCalledWith(ADMIN_TARGET_WALLET_ID, {
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('WR-06: LGA_ADMIN supplying an explicit walletId for a wallet within their own LGA is allowed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ lgaId: LGA_ID_A });
    mockPrisma.wallet.findUnique.mockResolvedValue({ user: { lgaId: LGA_ID_A } });

    const result = await controller.getStatement(lgaAdminUser, LGA_TARGET_WALLET_ID);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: lgaAdminUser.userId },
      select: { lgaId: true },
    });
    expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith({
      where: { id: LGA_TARGET_WALLET_ID },
      select: { user: { select: { lgaId: true } } },
    });
    expect(mockSettlementService.getStatement).toHaveBeenCalledWith(LGA_TARGET_WALLET_ID, {
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(result).toBe(mockStatementRows);
  });

  it('WR-06: LGA_ADMIN supplying a walletId outside their own LGA is forbidden', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ lgaId: LGA_ID_A });
    mockPrisma.wallet.findUnique.mockResolvedValue({ user: { lgaId: LGA_ID_B } });

    await expect(
      controller.getStatement(lgaAdminUser, ADMIN_TARGET_WALLET_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(mockSettlementService.getStatement).not.toHaveBeenCalled();
  });

  it('WR-06: LGA_ADMIN with no lgaId of their own is forbidden from any override', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ lgaId: null });
    mockPrisma.wallet.findUnique.mockResolvedValue({ user: { lgaId: LGA_ID_A } });

    await expect(
      controller.getStatement(lgaAdminUser, ADMIN_TARGET_WALLET_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(mockSettlementService.getStatement).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN with no walletId falls back to self-resolution', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({ id: ADMIN_OWN_WALLET_ID });

    await controller.getStatement(superAdminUser);

    expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith({
      where: { userId: superAdminUser.userId },
      select: { id: true },
    });
    expect(mockSettlementService.getStatement).toHaveBeenCalledWith(ADMIN_OWN_WALLET_ID, {
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('throws NotFoundException when the current user has no wallet', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue(null);

    await expect(controller.getStatement(citizenNoWalletUser)).rejects.toThrow(
      NotFoundException,
    );
    expect(mockSettlementService.getStatement).not.toHaveBeenCalled();
  });
});
