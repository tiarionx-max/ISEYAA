// ─── Enums ────────────────────────────────────────────────────────────────────

export enum UserRole {
  CITIZEN = 'CITIZEN',
  VENDOR = 'VENDOR',
  LGA_ADMIN = 'LGA_ADMIN',
  STATE_ADMIN = 'STATE_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  MINISTRY_VIEWER = 'MINISTRY_VIEWER',
}

export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export enum KYCStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  REFUND = 'REFUND',
  TRANSFER = 'TRANSFER',
}

export enum PaymentGateway {
  PAYSTACK = 'PAYSTACK',
  FLUTTERWAVE = 'FLUTTERWAVE',
  WALLET = 'WALLET',
  INTERNAL = 'INTERNAL',
}

// ─── Core Interfaces ──────────────────────────────────────────────────────────

export interface IUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  kycStatus: KYCStatus;
  avatarUrl?: string | null;
  lgaId?: string | null;
  createdAt: string;
}

export interface ILGA {
  id: string;
  name: string;
  slug: string;
  stateCode: string;
  description?: string | null;
  imageUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive: boolean;
}

export interface IEvent {
  id: string;
  lgaId: string;
  organizerId: string;
  title: string;
  slug: string;
  description?: string | null;
  imageUrls: string[];
  venue: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  isFeatured: boolean;
}

// Mirrors WalletService.getBalance()'s actual return shape
// (backend/src/modules/wallet/wallet.service.ts) — NOT the raw Prisma Wallet
// row. The REST response is a computed KYC/escrow summary, not a passthrough
// of the wallet table (no id/userId/currency/isActive on the wire).
export interface IWallet {
  balance_ngn: number;
  escrow_balance_ngn: number;
  kyc_tier: number;
  daily_limit_ngn: number;
}

export interface ITransaction {
  id: string;
  walletId: string;
  type: TransactionType;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  gateway: PaymentGateway;
  description?: string | null;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}
