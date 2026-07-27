# Deferred Items — 260727-eca

## Pre-existing missing dependencies (out of scope)

`cd mobile && npx tsc --noEmit` reports 7 `TS2307: Cannot find module` errors unrelated to this
plan's changes:

- `app/_layout.tsx` — `@sentry/react-native` not present in `node_modules`
- `app/driver-application.tsx`, `app/event-create.tsx`, `app/event-edit/[id].tsx`,
  `components/stays/HourlyBookingSheet.tsx`, `components/stays/NightlyBookingSheet.tsx`,
  `components/stays/TimedEventBookingSheet.tsx`, `components/tours/TourBookingSheet.tsx` —
  `@react-native-community/datetimepicker` not present in `node_modules`

Confirmed via `ls node_modules/@sentry` / `ls node_modules/@react-native-community` — both
directories are absent. This is a local environment/install gap (dependencies declared in
`package.json` but not installed in this worktree's `node_modules`), not a code defect
introduced by this plan's edits. None of the errors are on lines touched by this plan.

Not fixed — out of scope per executor scope-boundary rule (pre-existing issue unrelated to the
current task's changes). Running `npm install` in `mobile/` would be the fix, but that is an
environment action outside this plan's file-modification scope.
