# Plan 02-08 Summary: auth-service + wallet-service gRPC Microservices

**Status:** COMPLETE  
**Date:** 2026-05-12  
**Tests:** 173/173 passing  
**TypeScript:** 0 errors

## Files Created

| File | Description |
|------|-------------|
| `backend/apps/auth-service/src/main.ts` | gRPC microservice on port 5001, auth.proto |
| `backend/apps/auth-service/src/app.module.ts` | Imports ConfigModule, PrismaModule, RedisModule, AuthModule |
| `backend/apps/auth-service/src/auth-grpc.controller.ts` | ValidateToken, GetUser, RefreshToken gRPC methods |
| `backend/apps/auth-service/Dockerfile` | Monorepo-root build context |
| `backend/apps/auth-service/railway.toml` | watchPaths scoped to auth-service changes |
| `backend/apps/wallet-service/src/main.ts` | gRPC microservice on port 5002, wallet.proto |
| `backend/apps/wallet-service/src/app.module.ts` | Imports ConfigModule, PrismaModule, RedisModule, CommonModule, WalletModule |
| `backend/apps/wallet-service/src/wallet-grpc.controller.ts` | Credit, Debit, GetBalance, GetTransactions gRPC methods |
| `backend/apps/wallet-service/Dockerfile` | Monorepo-root build context |
| `backend/apps/wallet-service/railway.toml` | watchPaths scoped to wallet-service changes |

## Files Modified

| File | Change |
|------|--------|
| `backend/src/app.module.ts` | ClientsModule.register added for AUTH_PACKAGE (port 5001) and WALLET_PACKAGE (port 5002) |
| `.env.example` | AUTH_SERVICE_URL, WALLET_SERVICE_URL, and all 8 gRPC service URL vars added |

## Key Design Notes

- **Strangler-fig pattern**: gRPC controllers import existing `AuthService` and `WalletService` — zero code duplication
- **Monolith still runs all modules**: API gateway continues to serve HTTP with all feature modules in-process; ClientsModule enables ADDITIONAL gRPC forwarding
- **Debit implementation**: `WalletService` doesn't expose a `debitWallet()` method; implemented directly in `WalletGrpcController` using `PrismaService.$transaction` — same SELECT FOR UPDATE semantics
- **Port assignments**: auth:5001, wallet:5002 (events:5003 through notifications:5008 assigned in subsequent plans)

## User Setup Required

Before Wave 3 deploy:
1. Create Railway services: `auth-service` and `wallet-service` in same project as monolith
2. Point each service to its directory with the correct Dockerfile path in railway.toml
3. Add `INFISICAL_TOKEN` + `INFISICAL_PROJECT_ID` to each new Railway service
4. After deploy, update `AUTH_SERVICE_URL` and `WALLET_SERVICE_URL` in Infisical with Railway private domain values
