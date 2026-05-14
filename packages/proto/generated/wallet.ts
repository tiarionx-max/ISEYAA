// Generated TypeScript interfaces for wallet.proto

export interface CreditRequest {
  walletId: string;
  amount: number;
  reference: string;
  description: string;
}

export interface CreditResponse {
  success: boolean;
  newBalance: number;
}

export interface DebitRequest {
  walletId: string;
  amount: number;
  reference: string;
  description: string;
}

export interface DebitResponse {
  success: boolean;
  newBalance: number;
}

export interface BalanceRequest {
  walletId: string;
}

export interface BalanceResponse {
  balance: number;
  escrowBalance: number;
  kycTier: string;
}

export interface GetTransactionsRequest {
  walletId: string;
  cursor: string;
  limit: number;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  reference: string;
  description: string;
  createdAt: string;
}

export interface GetTransactionsResponse {
  transactions: Transaction[];
  nextCursor: string;
}

export interface WalletServiceClient {
  credit(data: CreditRequest): Promise<CreditResponse>;
  debit(data: DebitRequest): Promise<DebitResponse>;
  getBalance(data: BalanceRequest): Promise<BalanceResponse>;
  getTransactions(data: GetTransactionsRequest): Promise<GetTransactionsResponse>;
}
