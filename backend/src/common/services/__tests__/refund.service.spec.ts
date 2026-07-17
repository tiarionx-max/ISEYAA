import { NotFoundException } from '@nestjs/common';
import { RefundService } from '../refund.service';
import { PaystackService } from '../paystack.service';
import { ReferenceService } from '../reference.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('RefundService', () => {
  const WALLET_ID = 'wallet-1';
  const ORIGINAL_REF = 'ISY-TOUR-ABC123DEF456';
  const REFUND_REF = `${ORIGINAL_REF}-RFND`;

  let prisma: jest.Mocked<PrismaService>;
  let paystack: jest.Mocked<PaystackService>;
  let referenceService: ReferenceService;
  let service: RefundService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;

    paystack = {
      refundCharge: jest.fn(),
    } as unknown as jest.Mocked<PaystackService>;

    referenceService = new ReferenceService();
    service = new RefundService(prisma, paystack, referenceService);
  });

  it('happy path: first call writes one REFUND row and returns SUCCESS when Paystack reports processed', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);
    (paystack.refundCharge as jest.Mock).mockResolvedValue({
      id: 'paystack-refund-1',
      amount: 5000,
      status: 'processed',
    });

    const createMock = jest.fn().mockResolvedValue({
      id: 'txn-1',
      reference: REFUND_REF,
      gatewayRef: 'paystack-refund-1',
      amount: 50,
      status: 'SUCCESS',
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(1),
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: WALLET_ID, balance: 1000 }) },
        transaction: { create: createMock },
      }),
    );

    const result = await service.refund({
      paystackReference: ORIGINAL_REF,
      amountKobo: 5000,
      walletId: WALLET_ID,
      reason: 'split-leg failed',
    });

    expect(paystack.refundCharge).toHaveBeenCalledTimes(1);
    expect(paystack.refundCharge).toHaveBeenCalledWith(ORIGINAL_REF, 5000, 'split-leg failed');
    expect(createMock).toHaveBeenCalledTimes(1);

    const writeArgs = createMock.mock.calls[0][0].data;
    expect(writeArgs.type).toBe('REFUND');
    expect(writeArgs.status).toBe('SUCCESS');
    expect(writeArgs.reference).toBe(REFUND_REF);
    expect(writeArgs.gateway).toBe('PAYSTACK');
    expect(writeArgs.gatewayRef).toBe('paystack-refund-1');
    expect(writeArgs.balanceBefore).toBe(writeArgs.balanceAfter); // balance-neutral
    expect(writeArgs.balanceBefore).toBe(1000);
    expect(writeArgs.metadata).toMatchObject({
      module: 'refund',
      originalReference: ORIGINAL_REF,
    });

    expect(result).toEqual({
      refundReference: REFUND_REF,
      paystackRefundId: 'paystack-refund-1',
      amountRefunded: 50,
      status: 'SUCCESS',
      transactionId: 'txn-1',
    });
  });

  it('idempotency: second call with same reference returns existing record without hitting Paystack', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      id: 'txn-existing',
      reference: REFUND_REF,
      gatewayRef: 'paystack-refund-1',
      amount: 50,
      status: 'SUCCESS',
    });

    const result = await service.refund({
      paystackReference: ORIGINAL_REF,
      amountKobo: 5000,
      walletId: WALLET_ID,
      reason: 'replay',
    });

    expect(paystack.refundCharge).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      refundReference: REFUND_REF,
      paystackRefundId: 'paystack-refund-1',
      amountRefunded: 50,
      status: 'SUCCESS',
      transactionId: 'txn-existing',
    });
  });

  it('Paystack pending status maps to PENDING in both the row and the result', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);
    (paystack.refundCharge as jest.Mock).mockResolvedValue({
      id: 'paystack-refund-2',
      amount: 5000,
      status: 'pending',
    });

    const createMock = jest.fn().mockResolvedValue({
      id: 'txn-2',
      reference: REFUND_REF,
      gatewayRef: 'paystack-refund-2',
      amount: 50,
      status: 'PENDING',
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(1),
        wallet: { findUnique: jest.fn().mockResolvedValue({ id: WALLET_ID, balance: 500 }) },
        transaction: { create: createMock },
      }),
    );

    const result = await service.refund({
      paystackReference: ORIGINAL_REF,
      amountKobo: 5000,
      walletId: WALLET_ID,
      reason: 'pending case',
    });

    expect(createMock.mock.calls[0][0].data.status).toBe('PENDING');
    expect(result.status).toBe('PENDING');
  });

  it('Paystack throws → exception propagates and NO REFUND row is written', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);
    (paystack.refundCharge as jest.Mock).mockRejectedValue(new Error('gateway timeout'));

    await expect(
      service.refund({
        paystackReference: ORIGINAL_REF,
        amountKobo: 5000,
        walletId: WALLET_ID,
        reason: 'will fail',
      }),
    ).rejects.toThrow('gateway timeout');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('WR-03: gateway=WALLET credits the buyer wallet back directly, skipping Paystack entirely', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);

    const walletUpdateMock = jest.fn().mockResolvedValue({});
    const createMock = jest.fn().mockResolvedValue({
      id: 'txn-wallet-refund',
      reference: REFUND_REF,
      gatewayRef: null,
      amount: 50,
      status: 'SUCCESS',
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(1),
        wallet: {
          findUnique: jest.fn().mockResolvedValue({ id: WALLET_ID, balance: 1000 }),
          update: walletUpdateMock,
        },
        transaction: { create: createMock },
      }),
    );

    const result = await service.refund({
      paystackReference: ORIGINAL_REF,
      amountKobo: 5000,
      walletId: WALLET_ID,
      reason: 'wallet-funded settlement failed',
      gateway: 'WALLET',
    });

    expect(paystack.refundCharge).not.toHaveBeenCalled();
    expect(walletUpdateMock).toHaveBeenCalledWith({
      where: { id: WALLET_ID },
      data: { balance: 1050 },
    });

    const writeArgs = createMock.mock.calls[0][0].data;
    expect(writeArgs.gateway).toBe('WALLET');
    expect(writeArgs.gatewayRef).toBeNull();
    expect(writeArgs.balanceBefore).toBe(1000);
    expect(writeArgs.balanceAfter).toBe(1050); // wallet actually credited back

    expect(result).toEqual({
      refundReference: REFUND_REF,
      paystackRefundId: '',
      amountRefunded: 50,
      status: 'SUCCESS',
      transactionId: 'txn-wallet-refund',
    });
  });

  it('throws NotFoundException when buyer wallet does not exist', async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);
    (paystack.refundCharge as jest.Mock).mockResolvedValue({
      id: 'paystack-refund-3',
      amount: 1000,
      status: 'processed',
    });

    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb({
        $executeRaw: jest.fn().mockResolvedValue(0),
        wallet: { findUnique: jest.fn().mockResolvedValue(null) },
        transaction: { create: jest.fn() },
      }),
    );

    await expect(
      service.refund({
        paystackReference: ORIGINAL_REF,
        amountKobo: 1000,
        walletId: 'missing-wallet',
        reason: 'wallet gone',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
