# Quilit Cloud Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every document under `/users/{userId}` and its subcollections (`sessions`, `calendarSlots`, `vocabulary`) belongs exclusively to `userId` (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. **Master Gate Sync**: Every subcollection write (`sessions`, `calendarSlots`, `vocabulary`) validates `ownerId == userId` and `userId == request.auth.uid` as well as path variable hardening via `isValidId()`.
3. **Zero Shadow Fields**: Document creation checks `keys().hasAll(...)` and `keys().hasOnly(...)` against the exact entity schema in `firebase-blueprint.json`. Updates use action-specific `affectedKeys().hasOnly(...)` gates.
4. **Immutable Ownership & Temporal Integrity**: `uid`/`ownerId`, `id`, and `createdAt` cannot be modified after creation. `createdAt` (on create) and `updatedAt` (on create and update) must equal `request.time`.
5. **Bounded Sizes & Arrays**: Every string field has explicit `.size()` bounds; arrays (`grammarFixes`, `vocabUpgrades`, `suggestions`) are strictly size-bounded (`<= 25`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Fail with `PERMISSION_DENIED`)
1. Unauthenticated read or write to `/users/uid1/sessions/S1`.
2. Verified user A reading or listing `/users/userB/sessions` (cross-tenant PII / data access).
3. Unverified email (`email_verified: false`) writing to `/users/uid1/sessions/S1`.
4. Shadow field injection (`{ ..., isAdmin: true }`) on `/users/uid1` profile create.
5. Identity spoofing (`ownerId: "victimUid"`) inside `/users/attackerUid/sessions/S1`.
6. Modifying immutable `createdAt` or `ownerId` during `update`.
7. Client-forged timestamp (`updatedAt: "2020-01-01T00:00:00Z"`) instead of `request.time`.
8. Oversized path variable (>128 chars or invalid characters `../`) on `get`/`create`/`update`/`delete`.
9. Oversized `content` string (> 30,000 chars) Denial-of-Wallet write.
10. Unbounded array (`suggestions.size() > 6` or `grammarFixes.size() > 25`) write.
11. Invalid enum value for `mode` (`"hacked"`) or `status` (`"Forged"`).
12. Ghost update modifying unauthorized keys outside action allowlists.
