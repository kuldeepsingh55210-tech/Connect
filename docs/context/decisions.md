# Settled Decisions — Do Not Silently Reverse These

Each of these was deliberately chosen. If a future change seems to require
reversing one, flag it explicitly rather than changing it quietly.

## Product Decisions

- **No AI matching, no numeric score.** Matching is deterministic: hard
  city filter (Tier 1) + shared-skill filter (Tier 2), never a weighted
  score shown to users. Chosen because the product's differentiator is
  specificity + locality, not algorithmic cleverness.
- **City-level location only, everywhere, permanently.** Never distance-in-km,
  never neighborhood/sub-city names. This is a safety decision (anti-stalking),
  not a placeholder — do not "improve" this without an explicit request.
- **Mutual-connect-before-chat is non-negotiable.** No direct messaging
  between strangers under any circumstance.
- **Skills/interests are a fixed controlled vocabulary**, not free text —
  keeps matching exact-match and prevents junk tags. Vocabulary lives in
  `apps/api/src/config/vocabulary.js`.
- **Second-degree network suggestions (Tier 3) show anonymously.** Never
  reveal which mutual connection produced a suggestion (privacy — the
  intermediary didn't consent to their connection list being exposed).
- **Auto-hide threshold = 3 open reports.** Not configurable per-user;
  it's a flat platform rule.
- **Rate limits**: 20 connect requests/day, 10 reports/day per user.
  Enforced via a counter field on the User document (not an external
  store) — this is intentional for single-instance MVP scale, not an
  oversight.
- Auto-hide requires 3 DISTINCT reporters. The same reporter cannot file a second open report against the same user (409). Admin restore resolves all open reports for that user.
- Unmatch does not permanently separate two users: either side may send a new Connect request later, which reopens the SAME connection as pending and the old message history reappears if re-accepted. Accepted for MVP. Block is the permanent separation tool.

## Technical Decisions

- **Testing happens in the browser (Expo web) until features are complete. Physical-device testing is the final pre-release step.**
- **Mobile-only for now, no web app.** Explicitly decided in September 2026
  to focus on one platform first. Backend is shared and web-ready when
  that decision changes.
- **Expo (not bare React Native).** Chosen specifically to avoid requiring
  Android Studio for physical-device testing — dev testing happens via
  Expo Go, not an emulator.
- **Dev-auth is temporary by design**, not an oversight. It exists so
  every other module (Profile, Discover, Connections, Chat, Trust-Safety)
  could be built and tested before Firebase integration. See
  `known-issues.md` for what must happen before this ships.
- **Cloudinary upload is wired; the paid moderation add-on is not enabled
  yet.** Deliberate cost/sequencing decision, not forgotten — see
  `known-issues.md`.
- **Admin endpoints use a simple `x-admin-key` header**, not real admin
  auth — same temporary pattern as dev-auth, same reason.
- **Build order was deliberately sequenced**: Auth → Profile → Discover
  (Tier 1+2 only) → Connections → Chat → Trust & Safety, each tested
  end-to-end before the next began. This order should be respected for
  any remaining/future modules (Notifications, Tier 3) too — don't jump
  ahead of dependencies.

## Design Decisions

- Visual design sourced from Stitch AI exports (see `architecture.md`
  → Design Reference). Match these pixel/layout-wise unless explicitly
  asked to deviate.
