# Known Issues & Temporary Implementations

Everything here is a **known, deliberate** temporary state — not a mystery
bug. Each must be resolved before public launch. Do not "clean these up"
incidentally while working on something else — each needs its own
dedicated task, since each has real security/correctness implications.

## 🔴 Must Fix Before Any Public Launch

### 1. Dev-auth has no real verification
`POST /api/auth/dev-login` accepts any phone number and creates/logs into
that account with zero verification. Anyone who knows or guesses a phone
number can access that account. Marked `// TEMPORARY DEV AUTH` in code.
**Fix**: wire real Firebase phone OTP + Google Sign-In (TRD Section 6.1
`/auth/otp/send`, `/auth/otp/verify`). Firebase project already exists
(created during setup) — just not integrated into the auth flow yet.
*Note: The mobile app's `AuthContext` now persists sessions via `expo-secure-store`,
but it currently stores this dev-auth token (not a real Firebase token).
The previous silent auto-login fallback in `api.ts` (+919876543215) has been
completely removed, but the underlying dev-auth replacement remains tracked here.*
Update 22 Oct 2026: signup now collects the user's phone, but dev-login still issues tokens without OTP. Any known phone can still be logged into, and signup photo upload with an existing phone can overwrite that account's photo. Fixed only by real Firebase phone OTP.

### 2. Admin endpoints use a static header key
`GET/PATCH /api/admin/reports/*` are protected by `x-admin-key` matching
an env var — not real admin authentication/authorization. Fine for one
developer during MVP build, not fine once anyone else has API access.

### 3. MongoDB Atlas Network Access allows `0.0.0.0/0`
Added during dev to avoid repeated IP-whitelist failures from dynamic
ISP IPs. Must be restricted to the actual production server's static IP
before launch.

### 4. No Terms of Service / Privacy Policy pages
The app collects location, photos, and social-connection data. DPDP Act
2023 (India) compliance requires real, published policy pages before
launch — not placeholder links.

## 🟡 Should Fix Before Launch, Not Security-Critical

### 5. Cloudinary moderation add-on not enabled
Photo upload works and stores images, but there's no automated check for
explicit/inappropriate content. The add-on is paid — deferred by choice,
not forgotten. Marked `// TEMPORARY` in `src/config/cloudinary.js` /
`src/middleware/upload.js`.

### 6. Not tested on a physical device yet (Deferred by decision, do before release)
All 7 mobile screens have only been verified via `npx expo start --web`
in a desktop browser. React Native can render subtly differently on
actual iOS/Android — native gestures, fonts, shadows. Must be verified
on a real phone via Expo Go before considering any screen "done-done".
Deferred by decision (22 Oct 2026) to the final pre-release testing phase.

### 7. Test data in DB: duplicate and test users
Test users exist in MongoDB Atlas (`Dev User` x4, `Priya Sharma` x2 (***3215, ***3287), `Cloudinary Test User`, `priya` (Bhopal, ***3299), `Aanya Sen` (***3301), `Vikram Das` (***3302) and any Divya test accounts). Clean before public launch.

### 8. LoginScreen with unknown phone auto-creates stub user
LoginScreen with an unknown phone auto-creates a stub 'Dev User' (Bangalore, profileCompleted false) and goes straight to MainTabs.

### 9. Signup stepper labels mismatch
Signup stepper labels say STEP 1 OF 4 and STEP 3 OF 4 but only 2 screens exist.

### 10. Landing screen Stitch placeholder content
Landing screen still shows Stitch placeholders: '1,420 neighbors active this week', Woodcraft/Ceramics/Permaculture illustration.

### 11. My Profile copy Stitch wording
My Profile copy still uses Stitch wording: 'Craft & Skills', 'OFFERINGS', 'LEISURE', 'Passions & Interests'.

### 12. Phone to laptop API reachability fails on Windows Public network
Phone to laptop API reachability fails on port 4000 over Windows network profile 'Public'.
Not a code bug. Resolved long-term by deploying API to HTTPS host (Phase 0.2).

### 13. api.ts stale hardcoded fallback API URL
api.ts still has a stale hardcoded fallback API URL (http://10.146.195.195:4000). Remove; it is only used when EXPO_PUBLIC_API_URL is missing.

### 14. scripts/test-chat-e2e.js writes real messages into DB
scripts/test-chat-e2e.js writes real messages into the DB on every run. Use a test database or clean up before launch.

### 15. Duplicate-report check is not atomic
Duplicate-report check is not atomic (find then insert). Two simultaneous requests from the same reporter could create two open reports. Auto-hide still needs 3 distinct reporters so it cannot be abused to hide a user. Fix with a partial unique index or findOneAndUpdate upsert.

### 16. Block and unmatch do not remove already-connected sockets from chat room
Block and unmatch do not remove already-connected sockets from the chat room; message:send is rejected, so this is low risk.

### 17. Leftover test data in the dev DB
Leftover test data in the dev DB (Aanya Sen and Vikram Das from an older signup test at +919876543301/02, Dev User stubs, duplicate Priya Sharma, test messages in the Priya-Aarav thread, Kabir/Priya test connection). Needs a safe cleanup task.

### 18. Chat header still shows Stitch placeholders
'Active in <city>' with a presence dot, a verified tick next to the name (no verification exists), and a 'Suggest: Coffee meetup' button.

### 19. Old diagnostic/test messages exist in Priya-Aarav thread
Old diagnostic/test messages ('Real-time diagnostic message from Priya via REST', 'Real-time socket message:send from Priya test ...', etc.) exist in the Priya-Aarav thread; clean before launch.

### 20. Missing status query in GET /api/connections treated as accepted
GET /api/connections treats a missing status query as accepted (isAccepted = !status || status === 'accepted'), which would run the message aggregation for any call without a status. Check whether any caller omits status.

### 21. REST POST /:id/read emits message:read to whole room including reader
REST POST /:id/read emits message:read to the whole room including the reader; the socket handler excludes the reader. Clients must ignore events where readerId is themselves.

### 22. Accepted-list aggregation scans all messages on every call
Accepted-list aggregation scans all messages of all accepted threads on every call. Fine at MVP scale; revisit with a denormalized lastMessage on Connection if it slows down.

### 23. Unread total in the bottom nav is polled every 20s per screen
Unread total in the bottom nav is polled every 20s per screen (useUnreadTotal); there is no global socket, so the badge can lag up to 20s when the user is not in a chat. Real push/notification delivery comes with the Notifications module.

### 24. Read-receipt unit tests exercise extracted pure helpers
Read-receipt unit tests exercise extracted pure helpers; on-screen behavior (ticks, Seen, badges, background-tab handling) is verified manually in the browser only.

### 25. Notification validity filtering happens at read time
Notification validity filtering (hidden/banned/soft-deleted actors, wrong connection state) happens at read time in GET /api/notifications and unread-count; stale rows stay in the DB. Fine for MVP; add a cleanup job later.

### 26. test-notifications-e2e.js has no explicit privacy-scan assertion
test-notifications-e2e.js has no explicit privacy-scan assertion; the payload shape (actor id, name, city, photoUrl) was checked by eye only.

### 27. Notification badge on the Discover bell lags up to 20s
Notification badge on the Discover bell is refreshed by 20s polling everywhere except inside ChatScreen (which listens to notification:new on its own socket). There is no global socket yet, so the badge can lag up to 20s.

### 28. Notifications bell only exists on Discover header
The bell exists only on the Discover header; other screens have no entry to Notifications.

### 29. connect_request tap navigates to Connections with { tab } param
connect_request tap navigates to 'Connections' with { tab } param; ConnectionsScreen.tsx was not changed in the notifications task. Verify in the browser that it opens the Requests tab.

### 30. ChatScreen web Enter handling has two listeners
ChatScreen web Enter handling: onKeyPress calls handleSend() and onSubmitEditing={handleSend} is also set. Verify in the browser that one Enter sends exactly one message; if it ever double-sends, keep only one handler.

### 31. test:composer-focus is a static source check
test:composer-focus is a static source check; actual focus behavior is verified manually in the browser only.

## 🟢 Deferred By Design, Not Urgent

### 32. Discover Tier 3 (network suggestions) not built
Intentionally sequenced after Connections existed. Low priority — Tier 1
and Tier 2 alone deliver the core value proposition.

### 33. Discover filter icon is decorative (no handler)
The filter button (`Ionicons options-outline`) in the Discover screen sub-bar is currently a non-functional/decorative placeholder. (The notification bell is now functional and wired to NotificationsScreen).

### 34. No settings/edit-profile screen
Users can only set their photo/skills/interests/about once, during the
initial Create Profile flow — no way to edit afterward yet.

### 35. Socket.io has no Redis adapter
Fine at single-instance MVP scale. Must be added before horizontally
scaling the API behind a load balancer (TRD Section 6.4) — do this at
that transition point, not preemptively.
