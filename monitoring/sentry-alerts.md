# ISEYAA Sentry Alert Configuration

## Backend Project: iseyaa-backend

### Setup

1. Go to sentry.io → New Project → Node.js → name: `iseyaa-backend`
2. Copy the DSN → set in Railway Variables: `SENTRY_DSN=https://...@sentry.io/...`
3. Install in backend workspace:
   ```bash
   npm install @sentry/nestjs @sentry/node --workspace=backend
   ```
4. Add to `backend/src/main.ts` (before `app.listen`):
   ```typescript
   import * as Sentry from '@sentry/nestjs';
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV ?? 'development',
     tracesSampleRate: 0.1, // 10% of transactions — adjust for budget
   });
   ```

### Required Alert Rules (Sentry → Alerts → Create Alert Rule)

| Alert Name | Type | Condition | Threshold | Notification |
|-----------|------|-----------|-----------|-------------|
| High error rate | Error rate | errors/min > 10 | 5 min window | Email toyeenfolayan@gmail.com |
| P95 latency spike | Performance | p95 transaction duration > 1000ms | 3 min window | Email |
| Wallet failures | Issue alert | `WalletService` in stack trace, > 3 events | 1 min window | Email |
| Auth failures | Issue alert | `AuthService` in stack trace, > 10 events | 1 min window | Email |

### Creating Alert Rules (Step by Step)

**High error rate alert:**
1. Sentry → Alerts → Create Alert Rule
2. Set "When" → "An event is seen" → filter by "error.rate"
3. Condition: "Number of errors" is greater than 10 in 5 minutes
4. Action: "Send a notification to" → your email address
5. Save rule

**Wallet failure alert:**
1. Sentry → Alerts → Create Alert Rule
2. Type: Issue Alert
3. Filter: "The issue's stack trace contains" → `WalletService`
4. Condition: "The issue is seen more than" 3 times in 1 minute
5. Action: Email toyeenfolayan@gmail.com
6. Save rule

**Auth failure alert:**
1. Sentry → Alerts → Create Alert Rule
2. Type: Issue Alert
3. Filter: "The issue's stack trace contains" → `AuthService`
4. Condition: "The issue is seen more than" 10 times in 1 minute
5. Action: Email toyeenfolayan@gmail.com
6. Save rule

### Testing Alerts

For each alert rule:
- Sentry → Alerts → [your alert rule] → "Send Test Notification"
- Confirm email arrives within 2 minutes

To trigger a real error (optional verification):
```bash
curl https://iseyaa-api.up.railway.app/api/v1/nonexistent-route
```
Check Sentry → iseyaa-backend → Issues for the 404 capture within 30 seconds.

---

## Mobile Project: iseyaa-mobile

### Already Configured in Phase 6

- Sentry React Native SDK initialized in `mobile/app/_layout.tsx`
- `EXPO_PUBLIC_SENTRY_DSN` documented in `.env.example`
- Hermes JS engine enabled in `mobile/app.json` (improves symbolication)

To get your mobile DSN:
1. sentry.io → Projects → iseyaa-mobile → Settings → Client Keys (DSN)
2. Copy DSN value into your `.env` as `EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...`

### Required Alert Rules

| Alert Name | Type | Condition | Action |
|-----------|------|-----------|--------|
| Crash-free sessions drop | Session health | crash-free rate < 99.5% over 1 hour | Email toyeenfolayan@gmail.com |
| New crash group | Issue alert | New issue with environment = production | Email |

**Crash-free session alert (step by step):**
1. Sentry → Alerts → Create Alert Rule
2. Type: Metric Alert → "Session Health"
3. Metric: "Crash free session rate"
4. Condition: falls below 99.5% over 1 hour
5. Environment: production
6. Action: Email
7. Save

**New crash group alert:**
1. Sentry → Alerts → Create Alert Rule
2. Type: Issue Alert
3. Condition: "A new issue is created"
4. Filter: "The issue's environment is" → production
5. Action: Email
6. Save

### Release Tracking (Enables Source Maps for Readable Stack Traces)

In `mobile/eas.json` under the `production` profile env, add:
```json
{
  "build": {
    "production": {
      "env": {
        "SENTRY_AUTH_TOKEN": "your-sentry-auth-token",
        "SENTRY_ORG": "iseyaa",
        "SENTRY_PROJECT": "iseyaa-mobile"
      }
    }
  }
}
```

Generate auth token at: sentry.io → Settings → Account → API → Auth Tokens
Select scopes: `project:read`, `project:releases`, `org:read`

---

## Summary of All Required Alert Rules

| Alert Name | Project | Condition | Action |
|-----------|---------|-----------|--------|
| High error rate | iseyaa-backend | errors/min > 10 for 5 min | Email |
| P95 latency spike | iseyaa-backend | p95 > 1000ms for 3 min | Email |
| Wallet failures | iseyaa-backend | WalletService errors > 3 in 1 min | Email |
| Auth failures | iseyaa-backend | AuthService errors > 10 in 1 min | Email |
| Mobile crash rate | iseyaa-mobile | crash-free < 99.5% over 1 hour | Email |

All 5 rules configured = monitoring requirements for LAUNCH-06 satisfied.
