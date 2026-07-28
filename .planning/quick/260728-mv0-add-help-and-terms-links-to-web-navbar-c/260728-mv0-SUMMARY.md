---
phase: quick
plan: 260728-mv0
status: complete
subsystem: web
tags: [navigation, help-page, legal, ui]
---

# Summary: Help and Terms links added to the web menu; new Help/Support page created

User asked (earlier this session, alongside a monetization proposal doc): Terms and Conditions needs to be reachable from the menu ("to avoid having stories"), and a Help option should be in the menu so users can reach customer care. Investigation found neither existed in `Navbar.tsx` — the only legal links lived in a footer hardcoded into the homepage only, and no Help/Support page existed anywhere.

## Change

- **New page**: `web/src/app/help/page.tsx` — Help & Support page with 4 topic-categorized `mailto:support@iseyaa.com` links (Payments & Wallet, Bookings & Tickets, Account & Verification, Report a problem) plus a plain contact card. `support@iseyaa.com` chosen to match the Resend sending domain already confirmed live this session (no existing support address found anywhere in the codebase).
- **Navbar.tsx**: added "Help" and "Terms" as always-visible utility links — desktop (next to the cart icon) and mobile (bottom of the hamburger menu, alongside Dashboard/Sign out).

Deliberately scoped to just the menu, per the user's literal ask — did not extract a shared Footer component or touch the ~20 other pages that render `<Navbar/>` without one; that's a pre-existing, separate gap.

## Verification

`cd web && npx tsc --noEmit` — clean on both changed files (3 pre-existing, unrelated jest-dom-matcher-typing errors remain in two untouched test files). Local `next dev` confirmed `/help` returns HTTP 200. No browser-automation tool was available in this environment to visually screenshot the result — noted rather than claimed.

## Deviations

Made directly (not the full plan → worktree-executor cycle), consistent with this session's pattern for small, well-scoped user-directed features.
