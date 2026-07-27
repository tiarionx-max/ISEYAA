---
phase: quick
plan: 260727-exm
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/ministry-dashboard.tsx
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/_layout.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A user whose active role is MINISTRY_VIEWER, STATE_ADMIN, or SUPER_ADMIN can reach a 'Ministry Dashboard' entry from Profile and view visitor-entries, purpose-breakdown, and revenue-to-government reports for a selectable date range (default: last 30 days) and optional single-LGA filter"
    - "A user whose active role is none of those three never sees the 'Ministry Dashboard' Profile entry, and is silently redirected to the home tab if the route is reached directly — mirroring the web page's redirect('/') for disallowed roles, no 'become a ministry viewer' CTA exists anywhere"
    - "Visitor entries are shown per-LGA with totals broken into tourist/citizen/other role buckets"
    - "Purpose-of-visit is shown as one aggregated bar-list row per purpose, summed across all months in the selected period"
    - "Revenue-to-government is shown broken down three ways — by module, by month, and by LGA (stays/marketplace/tour_booking only) — and a wallet-resolution failure (all three arrays empty) renders as a graceful zero/empty state, never an error"
    - "A 'Top LGAs by visitor count' ranked list stands in for the web's 20-row x N-month heatmap grid (explicit mobile simplification — screen width cannot fit that grid), reusing the already-fetched visitor-entries data with zero additional network requests"
    - "No CSV/PDF export button or share/file-system code exists anywhere on this screen (deliberate scope reduction — view-only per task description)"
  artifacts:
    - path: "mobile/app/ministry-dashboard.tsx"
      provides: "Role-gated (MINISTRY_VIEWER/STATE_ADMIN/SUPER_ADMIN), read-only ministry analytics screen: date-range + LGA chip filters, visitor-entries panel, purpose-breakdown panel, 3-part revenue panel, top-LGAs ranked list"
      min_lines: 300
  key_links:
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "mobile/app/ministry-dashboard.tsx"
      via: "conditional menuRows spread entry, gated on canViewMinistry = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN'].includes(user?.role ?? '')"
      pattern: "ministry-dashboard"
    - from: "mobile/app/ministry-dashboard.tsx"
      to: "backend GET /api/v1/ministry/visitor-entries"
      via: "fetcher(`/ministry/visitor-entries?from=${from}&to=${to}${lgaParam}`) via useQuery, enabled only when canViewMinistry"
      pattern: "ministry/visitor-entries"
    - from: "mobile/app/ministry-dashboard.tsx"
      to: "backend GET /api/v1/ministry/purpose-breakdown"
      via: "fetcher(`/ministry/purpose-breakdown?from=${from}&to=${to}${lgaParam}`) via useQuery"
      pattern: "ministry/purpose-breakdown"
    - from: "mobile/app/ministry-dashboard.tsx"
      to: "backend GET /api/v1/ministry/revenue"
      via: "fetcher(`/ministry/revenue?from=${from}&to=${to}`) via useQuery — no lgaId param, backend does not accept one"
      pattern: "ministry/revenue"
    - from: "mobile/app/ministry-dashboard.tsx"
      to: "backend GET /api/v1/lgas"
      via: "fetcher('/lgas') via useQuery, rendered as a horizontal row of Chip components for the LGA filter"
      pattern: "fetcher\\('\\/lgas'\\)"
---

<objective>
User previously confirmed (STATE.md, 2026-07-27) the government/ministry analytics dashboard was intentionally web-only. User has now reversed that decision and asked for a read-only mobile port. Backend (`backend/src/modules/ministry/*`) and the web reference (`web/src/app/admin/ministry/page.tsx` + its 4 chart components) are both 100% complete and confirmed unchanged by this plan — this is mobile-only UI work, zero backend files touched.

**Deliberate simplifications, called out explicitly (not silently missing):**
1. **No CSV/PDF export** — the web page has 6 export buttons (CSV/PDF x 3 reports) calling `GET /ministry/{slug}/export?format=...&...`, returning a blob. Mobile file-system/share-intent handling for blob downloads is a disproportionate addition for a "read-only viewing" ask — omitted entirely, no export UI of any kind.
2. **No recharts-equivalent charting** — mobile has zero charting library beyond `react-native-svg` 15.2.0 (confirmed via `mobile/package.json`, no victory-native/gifted-charts/chart-kit/d3/Skia). Every panel below is rendered as a plain `View`-based proportional bar-list (the exact pattern already shipped in `mobile/app/event-analytics/[id].tsx`'s `hourly_sales_chart`), not a "real" chart.
3. **LGA x Month heatmap replaced with a ranked list** — the web's 4th panel (`LgaMonthHeatmap`, a 20-row x N-month color grid) does not fit a phone screen. Replaced with a "Top LGAs by visitor count" ranked bar-list, computed client-side from the same already-fetched visitor-entries data (zero extra network request, matching the web page's own zero-extra-fetch design for that panel).

**No self-service path to this screen's roles** — unlike every other dashboard built this session (host/vendor/organiser/driver), there is no "become a ministry viewer" flow anywhere in the codebase (confirmed via exhaustive grep this session — the only place a user ever gets `STATE_ADMIN`/`MINISTRY_VIEWER` is a seed script). The screen gates purely on the current session's `me.role` (matching how `RolesGuard` itself checks) and redirects home if the role doesn't match — no `ensureXRole` role-drift helper applies here, since no client mutation ever adds these roles to `registeredRoles`.

Purpose: Give ministry staff/state admins a read-only mobile view of the same 3 core reports (plus a simplified 4th panel) already live on web, reachable only by users who already hold the gated role.
Output: `mobile/app/ministry-dashboard.tsx` (new); `mobile/app/(tabs)/profile.tsx` (new conditional reachability entry); `mobile/app/_layout.tsx` (route registration).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection this session — use directly, do not re-investigate.

**Backend route guard** (`backend/src/modules/ministry/ministry.controller.ts`, class-level, no per-route overrides): `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)` on `@Controller('ministry')`. All routes GET-only (a code comment enforces this must never change) — this plan makes zero mutating calls.

**Query DTO** (`ministry-query.dto.ts`): `from?: string` (ISO date `YYYY-MM-DD`), `to?: string` (ISO date), `lgaId?: string` (UUID), `format?` (export-only, not used here). No pagination on any route.

**Three data routes, exact response shapes** (confirmed via full service-file read):

`GET /ministry/visitor-entries?from=&to=&lgaId=` → flat array (NOT wrapped):
```
{ lgaId: string | null; lgaName: string | null; month: string /* "YYYY-MM" */; userRole: string; count: number }[]
```

`GET /ministry/purpose-breakdown?from=&to=&lgaId=` → flat array:
```
{ purpose: string; month: string /* "YYYY-MM" */; count: number }[]
```

`GET /ministry/revenue?from=&to=` — **no `lgaId` param accepted** (service method only takes from/to, do not send it) → single nested object, NOT an array:
```
{
  byModule: { module: string; total: number }[];
  byMonth: { month: string; total: number }[];
  byModuleLga: { module: string; lgaId: string | null; lgaName: string | null; total: number }[]; // module is only ever 'stays' | 'marketplace' | 'tour_booking'
}
```
If the ministry wallet can't be resolved server-side, this degrades to `{byModule:[],byMonth:[],byModuleLga:[]}` rather than throwing — render this as an empty/zero state, never an error banner.

**Role enum** (`backend/src/common/enums/user-role.enum.ts`): `CITIZEN, TOURIST, VENDOR, ORGANISER, HOST, DRIVER, CREATIVE, TOUR_GUIDE, LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN, MINISTRY_VIEWER`. `REGISTERABLE_ROLES` does NOT include `MINISTRY_VIEWER`/`STATE_ADMIN` — there is no self-service grant path, confirmed by exhaustive grep. `PATCH /users/me/role` (`SwitchRoleDto`) hard-blocks switching to a role not already in `registeredRoles`, and nothing ever appends these roles to that array from any client-reachable code path.

**Gating pattern** (mirrors `mobile/app/organiser-dashboard.tsx` line 207-210's `useQuery(['me'], () => fetcher('/users/me'))`, and `profile.tsx`'s `alreadyHost`/`alreadyVendor` derivations at lines 548/550): `const canViewMinistry = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN'].includes(me?.role ?? '')`. Checks the single active `role` field (matching `RolesGuard`'s own check), NOT `registeredRoles` — there is no role-drift scenario to guard against here since these roles are never added to `registeredRoles` by any client mutation, so no `ensureXRole` helper is needed or applicable for this screen (unlike every other dashboard built this session).

**Web reference behavior** (`web/src/app/admin/ministry/page.tsx`, full file read): `ALLOWED_ROLES = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN']`; disallowed roles get `redirect('/')` — NOT `redirect('/admin')` like other admin pages (a deliberate deviation per that file's own comment, since ministry viewers have no legitimate reason to land on `/admin`). Mobile mirrors this: on the `me` query settling with a role that fails `canViewMinistry`, `router.replace('/(tabs)' as any)` (confirmed home-route pattern, used identically in `mobile/app/auth/email.tsx:66`, `auth/register.tsx:134`, `auth/otp.tsx:68`) — render a spinner while this redirect fires, never a flash of the real content.

Filters default to `[today-30d, today]`; web's `defaultDateRange()`:
```ts
function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
```
Mirror this exactly for the initial `Date` state (`fromDate`, `toDate`), deriving the query-string values via `.toISOString().slice(0, 10)` on each. LGA filter: empty string means "All LGAs" and must NOT be appended as a query param (matching web's `lgaParam = lgaId ? \`&lgaId=${lgaId}\` : ''`).

**`GET /lgas` response shape** (`backend/src/modules/lgas/lgas.service.ts` lines 4-26, confirmed via direct read): flat array, NOT wrapped, `{ id: string; name: string; slug: string; description; latitude; longitude; isActive; metadata; _count: { attractions: number } }[]`, already filtered to `isActive: true` and sorted `name: 'asc'` server-side — only `id`/`name` are needed here.

**No LGA picker component exists in mobile** (confirmed this session, multiple times) — use `mobile/components/ui/Chip.tsx` (`ChipProps: { label, active?, onPress?, icon?, style? }`) in a horizontal `ScrollView` (`horizontal showsHorizontalScrollIndicator={false}`): one "All" chip (`active={lgaId === ''}`) plus one chip per LGA (`active={lgaId === lga.id}`), each `onPress` setting `lgaId` state. This is the same pattern already used for enum-like pickers elsewhere (e.g. `product-create.tsx`'s category chips).

**Date picker pattern** (verbatim from `mobile/app/event-create.tsx` lines 308-356, confirmed installed: `@react-native-community/datetimepicker`): a `Pressable` field showing the current formatted date, toggling a boolean `show*` state; the picker renders conditionally (`{showFromDate && <DateTimePicker .../>}`), calling `setShowFromDate(false)` on non-iOS platforms inside `onChange`. This screen only needs `mode="date"` (no time component, matching the web's `<input type="date">` — do NOT add time pickers). Two independent `Date` states (`fromDate`, `toDate`), two independent Pressable+picker pairs.

**No charting library beyond `react-native-svg` 15.2.0** (confirmed via `mobile/package.json` full read). Every panel below renders as a plain horizontal bar-list — verbatim structural pattern from `mobile/app/event-analytics/[id].tsx` lines 118-136 (`chartList`/`chartRow`/`barTrack`/`barFill` — a `View` row per entry: label, a bordered `barTrack` container with an inner `barFill` `View` sized `width: \`${(value / maxValue) * 100}%\`` in `GOLD`, and the raw value printed at the row's end).

**Currency formatting** (`mobile/app/event-analytics/[id].tsx` lines 41-43, confirmed): `function formatCurrency(amount: number) { return \`₦${amount.toLocaleString('en-NG')}\`; }` — duplicate this exact convention (per this codebase's established per-screen small-helper duplication convention) for all revenue figures. Do NOT use the web's K/M-suffixed `fmtNgn` formatter.

**`mobile/lib/api.ts` exports** (confirmed): `api` (configured axios instance), `fetcher` (GET helper for `useQuery`), `getErrorMessage(err, fallback)`.

**`mobile/lib/tokens.ts` exports needed**: `SURFACE_MID`, `SURFACE_RAISED`, `GOLD`, `GOLD_DIM`, `GOLD_LINE`, `INK`, `INK_MID`, `INK_DIM`, `INK_FAINT`, `BORDER`, `TYPE`, `FONT_UI`, `FONT_MONO`, `RADIUS_LG`, `RADIUS_MD`, `RADIUS_PILL`, `SPACE_2/3/4/5`.

**`mobile/app/(tabs)/profile.tsx` reachability precedent** (confirmed via direct read, lines 384-620): `menuRows` is a plain `MenuRowItem[]` array literal (`interface MenuRowItem { icon: React.ComponentType<LucideProps>; label: string; sub: string; onPress: () => void; isLast?: boolean; }`), built as a literal, not `.filter()`-derived — array spread syntax works fine for a conditional entry: `...(canViewMinistry ? [{ icon: BarChart3, label: 'Ministry Dashboard', sub: 'Government analytics', onPress: () => router.push('/ministry-dashboard' as never) }] : [])`. Unlike the always-visible "Organiser Tools" row (deliberately unconditional, per 260727-d80's rationale), this entry MUST be conditional — 99.9% of users will never hold this role and it should not clutter the menu. Insert the spread immediately before the existing `Change Password` object (the current last entry, `isLast: true`) so `Change Password` stays last regardless of whether the ministry entry renders. `BarChart3` is not currently imported from `lucide-react-native` in this file (current import list, lines 33-53, has `Ticket, ShoppingBag, Heart, Clock, Home, Store, MessageSquare, Pencil, Trash2, KeyRound, Navigation, LayoutDashboard, Megaphone` — add `BarChart3` to this list). `user` (from the existing `useQuery<UserProfile>({queryKey:['me'], ...})` at line 392) already exposes `.role` — derive `const canViewMinistry = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN'].includes(user?.role ?? '');` alongside the existing `alreadyHost`/`alreadyVendor` derivations (lines 547-550).

**`mobile/app/_layout.tsx` registration convention** (confirmed via direct read, 96 lines): flat screens use `<Stack.Screen name="x" options={{ title: 'Y', presentation: 'card' }} />`. Add `<Stack.Screen name="ministry-dashboard" options={{ title: 'Ministry Dashboard', presentation: 'card' }} />` as the last entry, immediately before the closing `</Stack>` (after the existing `saved-places` line), for minimal conflict risk against any other in-flight change to this frequently-contested file.
</verified_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Role-gated screen shell + filters + visitor-entries + purpose-breakdown panels</name>
  <files>mobile/app/ministry-dashboard.tsx</files>
  <action>
    Create `mobile/app/ministry-dashboard.tsx`.

    **Role gate**: `useQuery<{ role?: string }>({queryKey:['me'], queryFn:() => fetcher('/users/me')})`. Derive `const canViewMinistry = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN'].includes(me?.role ?? '');`. While `meLoading`, render a centered `ActivityIndicator` only. Once loaded, if `!canViewMinistry`, fire `router.replace('/(tabs)' as any)` inside a `useEffect` (dependency on `meLoading`/`canViewMinistry`) and render nothing but the same centered spinner while the redirect resolves — never flash real content. Do NOT render any "become a ministry viewer" CTA of any kind.

    **Filters** (rendered only once `canViewMinistry` is confirmed): two `Date` states `fromDate`/`toDate`, defaulting exactly per the web's `defaultDateRange()` logic in verified facts (today-30 / today). Two Pressable+`DateTimePicker` (`mode="date"`, no time) pairs per the verified-facts pattern, each labeled "From"/"To", displaying `toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })`. Derive query strings `const from = fromDate.toISOString().slice(0,10)` and `const to = toDate.toISOString().slice(0,10)` inline at render time (not stored as separate state — recompute from the Date states so the picker and the query key always agree).

    LGA filter: `useQuery<{id:string;name:string}[]>({queryKey:['lgas'], queryFn:() => fetcher('/lgas'), enabled: canViewMinistry})`. `const [lgaId, setLgaId] = useState('')`. Render a horizontal `ScrollView` (`horizontal showsHorizontalScrollIndicator={false}`) of `Chip` components: one "All LGAs" chip (`active={lgaId===''}`, `onPress={() => setLgaId('')}`) followed by one chip per LGA (`active={lgaId===lga.id}`, `onPress={() => setLgaId(lga.id)}`). Derive `const lgaParam = lgaId ? \`&lgaId=${lgaId}\` : ''` for use in the two LGA-accepting queries below (visitor-entries, purpose-breakdown — NOT revenue, which never accepts lgaId).

    **Data fetching**:
    - `useQuery<VisitorEntryRow[]>({queryKey:['ministry-visitor-entries', from, to, lgaId], queryFn: () => fetcher(\`/ministry/visitor-entries?from=${from}&to=${to}${lgaParam}\`), enabled: canViewMinistry})`
    - `useQuery<PurposeRow[]>({queryKey:['ministry-purpose-breakdown', from, to, lgaId], queryFn: () => fetcher(\`/ministry/purpose-breakdown?from=${from}&to=${to}${lgaParam}\`), enabled: canViewMinistry})`

    Define the exact `VisitorEntryRow`/`PurposeRow` interfaces from the verified facts (do not rename fields).

    **Visitor Entries panel**: aggregate the flat `visitorEntries` array client-side into one row per distinct `lgaName` (fall back to `'Unknown'` when `lgaName` is null), summing `count` into three buckets by `userRole`: `TOURIST`, `CITIZEN`, and everything else folded into `OTHER`. Render as a bar-list (verbatim `event-analytics/[id].tsx` chartRow/barTrack/barFill structure): one row per LGA, bar width proportional to that LGA's total (`total / maxTotalAcrossLgas`), LGA name as the label, total count printed at the row's end, and a small caption line beneath each bar reading e.g. `Tourist 12 · Citizen 5 · Other 2`. Handle loading (`ActivityIndicator`) and empty-array ("No visitor entries for this period.") states.

    **Purpose Breakdown panel**: aggregate the flat `purposeBreakdown` array by summing `count` per distinct `purpose` across all months. Render as the same bar-list pattern, one row per purpose, sorted descending by total count. Handle loading and empty states identically.

    Wrap the whole screen in a `SafeAreaView` + `ScrollView` (`showsVerticalScrollIndicator={false}`), following the `event-analytics/[id].tsx` layout convention (`scroll` container with `gap` between sections). Add a screen header ("Ministry Dashboard" title + one-line subtitle "Visitor entries, purpose-of-visit, and revenue-to-government"). Leave clear space/structure for Task 2 to append the Revenue panel and Top-LGAs panel below Purpose Breakdown in the same `ScrollView`.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>ministry-dashboard.tsx exists, gates on canViewMinistry (redirecting home via router.replace('/(tabs)') for disallowed roles with no flash of content and no become-CTA), renders working From/To date pickers and an LGA chip filter (All + per-LGA), and renders the Visitor Entries (per-LGA tourist/citizen/other breakdown) and Purpose Breakdown (per-purpose aggregate) panels as bar-lists against the real GET /ministry/visitor-entries and GET /ministry/purpose-breakdown endpoints. `cd mobile && npx tsc --noEmit` passes with no new type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Revenue panel + Top-LGAs list + Profile/route wiring</name>
  <files>mobile/app/ministry-dashboard.tsx, mobile/app/(tabs)/profile.tsx, mobile/app/_layout.tsx</files>
  <action>
    In `mobile/app/ministry-dashboard.tsx`, append below the Purpose Breakdown panel (within the same `ScrollView`):

    **Revenue query**: `useQuery<RevenueData>({queryKey:['ministry-revenue', from, to], queryFn: () => fetcher(\`/ministry/revenue?from=${from}&to=${to}\`), enabled: canViewMinistry})` — do NOT append `lgaParam`, the backend route does not accept an `lgaId` param. Define `RevenueData`/`ModuleRevenueRow`/`MonthRevenueRow`/`ModuleLgaRevenueRow` exactly per the verified facts. Compute `const revenueIsEmpty = !!revenue && revenue.byModule.length === 0 && revenue.byMonth.length === 0 && revenue.byModuleLga.length === 0;` (mirrors the web page's own empty-state check for the ministry-wallet-unresolved degradation case) and render a plain "No revenue data for this period." message when true — never an error state for this specific condition.

    **Revenue panel**, three bar-list sub-sections (each using `formatCurrency` for its value, sorted descending by total, using the same bar-list structural pattern):
    1. "By module" — one row per `revenue.byModule` entry (`module` as label, `formatCurrency(total)` as value).
    2. "By month" — one row per `revenue.byMonth` entry, sorted ascending by `month` string (chronological, unlike the other two panels), `month` as label, `formatCurrency(total)` as value.
    3. "By LGA (stays, marketplace, tours)" — aggregate `revenue.byModuleLga` client-side by summing `total` per distinct `lgaName` (fallback `'Unknown'` for null), one row per LGA, `formatCurrency(summedTotal)` as value.

    Handle loading state for the whole revenue block with one shared `ActivityIndicator` (all three sub-sections share the same query).

    **Top LGAs panel** ("Top LGAs by visitor count", replacing the web's LGA×Month heatmap per the objective's documented simplification): reuse the ALREADY-FETCHED `visitorEntries` array from Task 1 — zero new network request. Aggregate total `count` per distinct `lgaName` (fallback `'Unknown'`) across all months/roles, sort descending, take the top 10, and render as a ranked bar-list: each row shows a rank badge (`#1`, `#2`, ...), the LGA name, a proportional bar (relative to the top entry's total), and the raw count. Handle the empty case ("No visitor data to rank.").

    In `mobile/app/(tabs)/profile.tsx`: add `BarChart3` to the existing `lucide-react-native` import list (lines 33-53). Add `const canViewMinistry = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN'].includes(user?.role ?? '');` alongside the existing `alreadyHost`/`alreadyVendor` derivations (lines 547-550). In the `menuRows` array literal, insert `...(canViewMinistry ? [{ icon: BarChart3, label: 'Ministry Dashboard', sub: 'Government analytics', onPress: () => router.push('/ministry-dashboard' as never) }] : []),` immediately before the existing `Change Password` object so `Change Password` remains the last (`isLast: true`) entry regardless of whether this conditional entry renders.

    In `mobile/app/_layout.tsx`, add `<Stack.Screen name="ministry-dashboard" options={{ title: 'Ministry Dashboard', presentation: 'card' }} />` as the last `Stack.Screen` entry, immediately after the existing `saved-places` line and before the closing `</Stack>`.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>ministry-dashboard.tsx additionally renders the 3-part Revenue panel (by module / by month / by LGA, all in Naira via formatCurrency, gracefully empty when the ministry wallet can't resolve) and a "Top LGAs by visitor count" ranked list computed client-side from the already-fetched visitor-entries data (no extra network call). profile.tsx exposes a conditional "Ministry Dashboard" menu row visible ONLY to MINISTRY_VIEWER/STATE_ADMIN/SUPER_ADMIN. The route is registered in _layout.tsx. `cd mobile && npx tsc --noEmit` passes with no new type errors. No backend file was modified.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Mobile app → `GET /ministry/*` | Reads government revenue/visitor analytics; must never be servable to a role outside MINISTRY_VIEWER/STATE_ADMIN/SUPER_ADMIN |
| Mobile app → `GET /lgas` | Public-shape reference data (no PII), used only to populate the LGA filter chips |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure (cross-role analytics access) | `GET /ministry/*` | mitigate | No backend change in this plan — `RolesGuard` + `@Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN)` already enforce this server-side (pre-existing, unmodified). The mobile screen's `canViewMinistry` gate + redirect-home is defense-in-depth/UX only; a non-permitted user reaching the route directly would still get a 403 from the backend even if the mobile gate were somehow bypassed. |
| T-quick-02 | Elevation of Privilege (self-service role grant) | N/A — no such path exists | accept | Confirmed via exhaustive grep this session: `MINISTRY_VIEWER`/`STATE_ADMIN` are absent from `REGISTERABLE_ROLES` and never appended to `registeredRoles` by any client-reachable mutation. This plan deliberately adds no CTA or mutation of any kind toward acquiring these roles. |
| T-quick-03 | Tampering | N/A — screen is 100% read-only | accept | Zero `POST`/`PATCH`/`DELETE` calls exist anywhere in this plan's new file; only `GET` requests are issued. |
| T-quick-04 | Information Disclosure (unbounded response size) | `GET /ministry/visitor-entries` / `purpose-breakdown` (no pagination, pre-existing backend behavior) | accept | Pre-existing backend limitation, out of scope for a mobile-only plan — the date-range filter (default 30 days) already bounds typical response size in practice; not re-litigated here. |

</threat_model>

<verification>
1. `cd mobile && npx tsc --noEmit` passes with no new type errors.
2. Manual read-through: `ministry-dashboard.tsx` never renders a "become a ministry viewer"/"request access" CTA of any kind.
3. Manual read-through: disallowed roles trigger `router.replace('/(tabs)' as any)` before any real panel content renders (no content flash).
4. Manual read-through: the `GET /ministry/revenue` query never appends an `lgaId` query param, while `visitor-entries`/`purpose-breakdown` do when one is selected.
5. Manual read-through: the "Top LGAs by visitor count" panel reuses the existing `visitorEntries` query result — no separate `useQuery` call is added for it.
6. Manual read-through: no `POST`/`PATCH`/`DELETE`/export/share/file-system code exists anywhere in `ministry-dashboard.tsx`.
7. Manual read-through: `profile.tsx`'s new menu entry is conditionally spread (not unconditionally rendered), gated on `canViewMinistry` derived from `user?.role`.
</verification>

<success_criteria>
- A user with MINISTRY_VIEWER/STATE_ADMIN/SUPER_ADMIN can reach a working Ministry Dashboard from Profile showing visitor entries (per-LGA, tourist/citizen/other), purpose breakdown, and revenue-to-government (by module/month/LGA) for a filterable date range + optional LGA, plus a Top-LGAs ranked list replacing the web's heatmap.
- A user without one of those three roles never sees the Profile entry and is redirected home if the route is reached directly — no self-service CTA of any kind exists.
- No CSV/PDF export exists anywhere on the mobile screen (explicit, documented scope reduction).
- `cd mobile && npx tsc --noEmit` passes cleanly.
- No backend file was modified.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-exm-build-a-read-only-ministry-analytics-das/260727-exm-SUMMARY.md`
</output>
