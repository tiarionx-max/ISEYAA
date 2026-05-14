# Plan 02-07 Summary: gRPC Proto Files + TypeScript Types

**Status:** COMPLETE  
**Date:** 2026-05-12  
**Notes:** TypeScript interfaces written manually (protoc not installed on dev machine; NestJS gRPC uses @grpc/proto-loader at runtime which reads .proto files directly)

## Files Created

| File | Contents |
|------|----------|
| `packages/proto/auth.proto` | AuthService: ValidateToken, GetUser, RefreshToken |
| `packages/proto/wallet.proto` | WalletService: Credit, Debit, GetBalance, GetTransactions |
| `packages/proto/events.proto` | EventsService: GetEvent, CheckTicketAvailability, ReserveTicket |
| `packages/proto/stays.proto` | StaysService: GetProperty, CheckAvailability, CreateBooking |
| `packages/proto/marketplace.proto` | MarketplaceService: GetProduct, ReserveStock, ConfirmOrder |
| `packages/proto/admin.proto` | AdminService: GetDashboard, ApproveItem |
| `packages/proto/ai.proto` | AiService: GetItinerary, GetLgaIntelligence |
| `packages/proto/notifications.proto` | NotificationsService: SendPush, RegisterToken |
| `packages/proto/generated/auth.ts` | TypeScript interfaces for auth service |
| `packages/proto/generated/wallet.ts` | TypeScript interfaces for wallet service |
| `packages/proto/generated/events.ts` | TypeScript interfaces for events service |
| `packages/proto/generated/stays.ts` | TypeScript interfaces for stays service |
| `packages/proto/generated/marketplace.ts` | TypeScript interfaces for marketplace service |
| `packages/proto/generated/admin.ts` | TypeScript interfaces for admin service |
| `packages/proto/generated/ai.ts` | TypeScript interfaces for ai service |
| `packages/proto/generated/notifications.ts` | TypeScript interfaces for notifications service |
| `packages/proto/generated/index.ts` | Barrel re-export of all 8 modules |
| `packages/proto/package.json` | @iseyaa/proto npm workspace package |
| `packages/proto/generate.sh` | ts-proto generation script (for future use with protoc) |
| `package.json` | Updated workspaces to include "packages/proto" |

## Dependencies Added (backend)

- `ts-proto@2.11.8`
- `@grpc/grpc-js@^1.14.3`  
- `@grpc/proto-loader@^0.8.1`

## Key Design Notes

- **Runtime gRPC**: NestJS loads .proto files at runtime via `@grpc/proto-loader` — protoc-generated code is not required for the gRPC transport to work
- **TypeScript types**: Manually written interfaces follow ts-proto naming conventions (snake_case → camelCase for field names)
- **Service client interfaces**: Each `*ServiceClient` interface enables type-safe injection in the API gateway via `ClientsModule`
- **Port assignments**: auth:5001, wallet:5002, events:5003, stays:5004, marketplace:5005, admin:5006, ai:5007, notifications:5008
