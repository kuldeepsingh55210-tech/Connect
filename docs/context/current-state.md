# Current State — ConnectLocal

*Last updated: 2026-10-30. This file should be updated whenever a module
changes status — it's the fastest way for a new agent/session to know
where things actually stand.*

## Recent Changes (October 2026)

- **Discover cleanup (frontend)**: removed hardcoded "34 peers online", avatar presence dot, Curated Discovery banner, city pill chevron, dead Explore/See all links, unused styles.
- **Discover chips (backend+frontend)**: `GET /api/discover` now also returns `sharedSkills` and `sharedInterests`; shared chips sorted first, highlighting only for real shared tags, "+N" overflow chip, Tier 1 subtitle changed to "People in your city who share your skills or interests".
- **My Profile screen (frontend)**: new MyProfileScreen.tsx shows own profile (photo, name, city only, intent, about, skills, interests) and an in-app Log Out with confirm modal. All Profile entry points wired (Discover header avatar, Discover and Connections bottom Profile tabs, MainTabsScreen, RootNavigator route). Privacy: dob, age, gender, authId, phone, area, status are never rendered. No edit yet.
- **Signup phone (frontend)**: Step 1 now collects an Indian mobile number (+91 + 10 digits, validated) and passes it to CreateProfile; hardcoded +919876543299 removed everywhere in apps/mobile/src and api.ts default removed. On 409 (phone already has a profile) the form stays, shows 'This phone number already has an account. Please log in instead.' with a Go to Log in button; it no longer logs into the existing account. Phone is never rendered to other users.
- Chat tab and conversations list (frontend): the bottom Chat tab no longer navigates to Chat with empty params. New ChatListScreen.tsx lists accepted connections (photo, name, city only) with loading, error-retry and empty states; tapping a row reuses ConnectionsScreen.openChatForConnection. ChatScreen disables the composer and shows 'Open a conversation from your connections.' when connectionId is missing.
- Trust & Safety verification (backend): npm run test:safety (apps/api/scripts/test-safety-e2e.js) covers 14 checks with throwaway users +919876543401..17 and self-cleanup: block (REST and socket), unmatch, report, auto-hide, report rate limit, admin 401, restore, privacy. All pass.
- Trust & Safety fix (backend): POST /api/reports rejects a duplicate open report from the same reporter with 409 DUPLICATE_REPORT (no quota consumed). Auto-hide counts DISTINCT reporterIds among open reports. Admin restore_user now resolves all open reports against that user to reviewed_no_action. New index {reporterId, reportedUserId, status} on reports.
- Chat sender duplicate fix (frontend): in ChatScreen.tsx the sender saw their own message twice because the server echoes message:new to the sender's socket before the REST response resolves. Added reconcileSocketMessage (replaces a pending temp-* optimistic message from the same sender with the same text), reconcileRestMessage (removes the temp-* message if the real id already arrived via socket) and dedupeMessages (render-time safety net). Failed sends remove the optimistic message. Messages were always stored once in the DB; only client state was duplicated.
- Read receipts and unread counts (backend): POST /api/connections/:id/read (participant of an accepted connection only; marks incoming messages readAt; emits message:read {connectionId, readerId, readAt} to the room; returns {status, readAt, count}). The socket message:read handler now also broadcasts message:read to the other participant. GET /api/connections/unread-count returns {total} across accepted threads only. GET /api/connections?status=accepted now returns unreadCount, lastMessageAt, lastMessagePreview (80 chars) and lastMessageIsMine per row (single aggregation) and is sorted by lastMessageAt desc. New index {connectionId, senderId, readAt} on messages. Verified by npm run test:read-receipts (throwaway users +919876543421..25). Frontend wired (see next entry).
- **Read receipts and unread badges (frontend)**: In `ChatScreen.tsx`, replaced the unconditional double tick with dynamic checkmark indicators (single tick `#5d5e66` for unread/temp messages; double tick `#18181B` when `readAt` is set) and a `"Seen"` label under the last read outgoing message. `markThreadRead(connectionId)` is triggered on initial load when the screen is focused and debounced (~500ms) on incoming `message:new` from the other user while the app is active (`AppState` + `document.visibilityState`). Listens to socket `message:read` (ignoring self-reads and mismatched connection IDs) via pure helper `applyReadReceipt`. Reconcile helpers (`reconcileSocketMessage`, `reconcileRestMessage`) preserve `readAt`. In `ChatListScreen.tsx`, rows display `lastMessagePreview` (prefixed with `"You: "` if outgoing, semibold `#18181B` if unread) and a black pill badge (`#18181B`, white text, 99+ cap) when `unreadCount > 0`, refreshing on focus and pull-to-refresh. Created shared `UnreadBadge` and `useUnreadTotal` hook to display total unread badge on the Chat tab across all bottom-nav screens (`DiscoverScreen`, `ConnectionsScreen`, `ChatListScreen`, `MyProfileScreen`) without touching the Discover header bell. Verified by `npm run test:read-receipts-unit` and `npm run test:read-receipts-flow` (throwaways +919876543431..33).
- **In-app Notifications (backend)**: Built `Notification` model (`userId`, `type` [`connect_request`, `connection_accepted`, `new_message`], `actorId`, `connectionId`, `readAt`, timestamps) with compound indexes and a unique partial index on `{ userId, connectionId }` for unread `new_message`. Integrated creation hooks into existing connection and chat handlers: connect request notifies recipient, connection accept notifies initiator and marks recipient request read, ignore deletes request (sender gets nothing), block/unmatch clears all notifications for the pair, and new message upserts exactly one unread notification per thread. Endpoints registered under `/api/notifications`: `GET /unread-count`, `POST /read-all`, `GET /` (with limit and before cursor, filtering out invalid items or inactive actors), and `PATCH /:id/read` (owner-only 404). Real-time events emitted as `notification:new` to room `user:<id>`. Verified by `npm run test:notifications` (throwaways +919876543441..46). Frontend wired (see next entry).
- **In-app Notifications (frontend)**: Built `NotificationsScreen.tsx` registered in `RootNavigator` under route `'Notifications'`. Monochrome Editorial cards (`borderRadius: 12`, border `#e4e4e7`, white surface) display avatar/fallback, copy per notification type (`connect_request`, `connection_accepted`, `new_message`), actor city only, relative time (`Just now`, `2m`, `3h`, `Yesterday`, or formatted date), and a small black unread dot (`#18181B`). Tap marks the notification read and navigates: `connect_request` opens Connections Requests tab; `connection_accepted` and `new_message` look up accepted connections to invoke `openChatForConnection` (showing toast `"This conversation is no longer available"` if no longer accepted). Header features a back arrow, screen title, and a ghost pill `"Mark all read"` (disabled when unread count is 0). Integrated cursor pagination via `before`, pull-to-refresh, loading, error, and empty states. Added `useNotificationUnread` hook polling unread count every 20s while active (pausing in background), refreshing immediately via exported `refreshNotificationUnread()` and listening on active sockets to `notification:new` (ignoring incoming messages for the active chat thread). Wired Discover header bell with `UnreadBadge` (99+ cap, hidden at 0). Verified by `npx tsc --noEmit`, `npm run test:notifications-unit` (22 tests), and `npm run test:notifications-flow` with throwaways `+919876543451..53`.
- **Chat composer focus retention (frontend)**: Fixed input losing focus after sending messages in `ChatScreen.tsx`. Attached `inputRef` and set `blurOnSubmit={false}` so React Native does not blur the input upon submit. In `handleSend`, invoked `inputRef.current?.focus()` during optimistic dispatch and in `finally` without causing keyboard flicker on mobile. Prevented browser mousedown focus stealing on web via `onMouseDown` on the send button, enabled Enter submit on web while preserving Shift+Enter, and ensured the input remains editable while sending (only the send button is disabled). Verified by `npx tsc --noEmit`, `npm run test:composer-focus`, `npm run test:read-receipts-unit`, and `npm run test:notifications-unit`.
- **Test hygiene (tests only)**: every test script now uses throwaway users (+919876543401..499, registry in apps/api/scripts/lib/throwaway.js, mobile re-export). seed-discover-test-data.js is manual only (npm run seed:discover). npm run test:all-safe exists in apps/api (9 suites) and apps/mobile (17 suites). apps/api/scripts/check-seed-untouched.js snapshots all non-throwaway users, connections and thread message counts before and after a run; the diff was empty.

## Backend (`apps/api`) — Module Status

| Module | Status | Notes |
|---|---|---|
| MongoDB connection | ✅ Done | Atlas, `0.0.0.0/0` whitelisted (dev only — restrict before prod) |
| Dev-auth | ✅ Done (temporary) | Must be replaced with Firebase before launch |
| Profile | ✅ Done | Age-gate, vocab validation, photo upload (Cloudinary) all working |
| Discover Tier 1 + 2 | ✅ Done | Connection-aware (excludes blocked/accepted) |
| Discover Tier 3 | ❌ Not built | Network suggestions — deferred |
| Connections | ✅ Done | Full state machine + rate limiting, tested |
| Chat | ✅ Done | REST + Socket.io, real-time verified cross-session |
| Trust & Safety | Done | Report, auto-hide (distinct reporters), admin, rate limits, block and unmatch verified via test:safety |
| Notifications | Done | In-app creation, unread count, read-all, realtime emit. Frontend wired to the Discover bell and Notifications screen. |
| Photo moderation | ❌ Not built | Cloudinary add-on not enabled (paid) |

## Mobile (`apps/mobile`) — Screen Status

| Screen / Module | Status | Notes |
|---|---|---|
| AuthContext & Session | ✅ Done | `expo-secure-store` persistence + memory sync, gates RootNavigator |
| Landing | ✅ Done | Entry point for unauthenticated users |
| Signup | ✅ Done | Inline age validation before submit |
| Create Profile | ✅ Done | Real Cloudinary photo upload wired, persists session via `login()` |
| Discover | ✅ Done | Tier 1 + Tier 2 rendered, Connect button wired |
| Profile View | ✅ Done | Report/Block modals wired |
| My Profile | ✅ Done (view + logout) | Edit profile not built |
| Connections | ✅ Done | 3 tabs, Accept/Ignore wired |
| Chat | ✅ Done | Real-time Socket.io, read ticks (single/double), "Seen" label, markThreadRead, composer focus retention on send |
| Chat List | ✅ Done | Lists accepted connections, last-message preview ("You: " prefix), unread count badges, empty/loading/error states |
| Notifications | ✅ Done | Hairline cards, unread dot, mark-all ghost pill, relative time, tap routing to Requests/Chat, 30-item cursor pagination, pull-to-refresh, empty/error/loading states |

**All screens exist and are wired to the real backend with AuthContext route gating.**
Tested via automated test suites (`test:auth-session`, `test:signup`). Ready for browser
verification via Expo web.

Own profile can be viewed and logged out from the Profile tab; editing is not built yet.

## Known Test Users (seeded via `scripts/seed-discover-test-data.js`)

Aarav Sharma (Bangalore, AI+Backend Dev), Rohan Verma (Bangalore, AI+Product),
Ananya Iyer (Bangalore, Finance+Sales — no overlap with AI users), Kabir Mehta
(Delhi, AI+Data), Neha Gupta (Delhi, AI+Frontend Dev), Priya Sharma (Delhi,
Design+AI+Product — created via real signup flow, not the seed script).

## How to Run Tests Safely

- Use `npm run test:all-safe` in `apps/api` (9 suites) and `apps/mobile` (17 suites).
- Do not run `npm run seed:discover` unless you explicitly want to reset seed users.
- Never import the seed script (`seed-discover-test-data.js`) in test files.

## Immediate Next Steps (in priority order)

1. Test full flow in browser (Expo web). Physical phone testing deferred to final testing phase before release (decision 22 Oct 2026).
2. Chat tab verified: routes to ChatListScreen.
3. Replace dev-auth with real Firebase phone OTP + Google auth
4. Build Discover Tier 3 (network suggestions)
5. Enable Cloudinary moderation add-on
6. Restrict MongoDB Atlas network access from `0.0.0.0/0` to actual server IP
7. Write Terms of Service / Privacy Policy pages
8. Plan safe cleanup task for leftover test data in the dev DB

See `known-issues.md` for what's unsafe to launch with as-is.
