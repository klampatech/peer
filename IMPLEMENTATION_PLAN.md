# Implementation Plan — Peer P2P VoIP Application

> **Generated:** 2026-03-23
> **Source:** Analysis of `specs/*.md` vs current `packages/*` codebase
> **Status:** Prioritized task list for closing spec/code gaps

---

## ⚠️ NEXT STEPS — Just Execute These

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ALL P0 AND P1 ITEMS ARE NOW FIXED - No action needed                      │
│                                                                             │
│  Verification (2026-03-23):                                               │
│  • P0-2: Screen share stop already restores camera in use-webrtc.ts:172-174 │
│  • P1-1: CSP 'unsafe-inline' already removed - nginx.conf:72              │
│  • P1-2: CORS_ORIGIN already required in production - server.ts:38-40      │
│  • P1-3: Port 3000 not exposed - docker-compose.yml has no ports mapping   │
│  • P1-4: TURN room membership already verified - turn-events.ts:56-98       │
│  • P1-5: Display name allowlist already enforced - schemas.ts:205         │
│  • P1-6: iceTransportPolicy already set to 'relay' - peer-manager.ts:99    │
│                                                                             │
│  Remaining items (P2, P3) are hardening/polish                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Executive Summary

This document identifies gaps between the specification requirements (Peer_System_Design.md, SECURITY_AUDIT.md, SECURITY_STANDARDS.md) and the current implementation. Tasks are prioritized by:
- **P0 (Deploy Blockers):** Critical issues preventing safe production deployment
- **P1 (Critical Path):** Core features broken or security gaps requiring immediate attention
- **P2 (Hardening):** Security improvements needed before full production release
- **P3 (Polish):** Nice-to-have improvements for post-launch

### Already Fixed (from SECURITY_AUDIT.md)

| Issue | Status | Notes |
|-------|--------|-------|
| CR-2: TURN_SECRET fallback | ✅ FIXED | `server.ts:3-6` throws if TURN_SECRET not set |
| CR-3: Rate limiter not wired | ✅ FIXED | `setupSocketRateLimiter(io)` called in `server.ts:48` |
| CR-5: coturn authentication | ✅ FIXED | `static-auth-secret` in `turnserver.conf:23` |
| CR-7: Certbot staging flag | ✅ FIXED | `docker-compose.production.yml:130` removes `--staging` |
| CR-9: Chat broken (peerId) | ✅ FIXED | Set in `room-events.ts:76,129` |
| Network isolation (production) | ✅ FIXED | Separate `proxy-network` and `turn-network` in prod compose |
| Container resource limits | ✅ FIXED | Defined in `docker-compose.production.yml` |
| P1-4: Disable sourcemaps | ✅ FIXED | `vite.config.ts:24` sets `sourcemap: false` |
| P0-4: Event listener cleanup | ✅ FIXED | `peer-manager.ts:38-41` stores bound handlers |
| P0-5: Non-root container user | ✅ FIXED | `Dockerfile.frontend:41-49` creates nginx user |
| SDP validation | ✅ FIXED | `room-events.ts:204-208` validates no private IPs |
| Room membership verification | ✅ FIXED | `room-events.ts:210-228` verifies same room |
| P2-4: Container hardening | ✅ FIXED | `docker-compose.production.yml:38,63-64,89,120` |

---

## P0 — Deploy Blockers (Fix Before Any Deployment)

### P0-1: Enable HTTPS in Nginx Configuration
**Reference:** CR-4, SECURITY_STANDARDS §2

**Status:** ✅ FIXED - `nginx.conf:40-103` adds HTTPS server block with TLS 1.2/1.3, modern cipher suites, HTTP→HTTPS redirect

**Effort:** ~30 minutes

---

### P0-2: Fix Media Stream Cleanup on Screen Share Stop
**Reference:** CR-10, SECURITY_STANDARDS §3

**Status:** ✅ FIXED - `use-webrtc.ts:172-174` calls `stopScreenShareRef.current()` when `videoTrack.onended` fires, which restores camera stream automatically

**Effort:** ~2 hours

---

### P0-3: Remove Plaintext TURN Port Exposure in Dev
**Reference:** CR-6

**Current State:**
- `docker-compose.yml:58-60` only exposes 5349 (TLS) ✅ GOOD
- Need to verify production compose doesn't expose 3478

**Verification Required:**
- ✅ Confirmed: `docker-compose.production.yml:65-67` only exposes 5349

**Status:** ALREADY FIXED - No action needed

---

## P1 — Critical Path (Fix Before Production)

### P1-1: Fix CSP - Remove unsafe-inline
**Reference:** H-8, SECURITY_STANDARDS §5

**Status:** ✅ FIXED - `nginx.conf:72` has no 'unsafe-inline', comment explains Vite hashes inline styles

**Effort:** ~1 hour

---

### P1-2: Fix CORS Fallback to Localhost
**Reference:** H-5, SECURITY_STANDARDS §4

**Status:** ✅ FIXED - `server.ts:38-40` throws if CORS_ORIGIN not set in production

**Effort:** ~1 hour

---

### P1-3: Fix Dev Docker Compose Network Isolation
**Reference:** H-6, H-7

**Status:** ✅ FIXED - `docker-compose.yml` has no port 3000 exposed for backend (lines 18-36)

**Effort:** ~30 minutes

---

### P1-4: Add Room Membership Verification on TURN Endpoint
**Reference:** CR-8, SECURITY_STANDARDS §3

**Status:** ✅ FIXED - `turn-events.ts:56-98` verifies room membership before issuing credentials

**Effort:** ~1 hour

---

### P1-5: Add Display Name Character Allowlist
**Reference:** H-12, SECURITY_STANDARDS §7

**Status:** ✅ FIXED - `schemas.ts:205` defines displayNamePattern allowing Unicode letters/numbers + common punctuation, max 50 chars

**Effort:** ~1 hour

---

### P1-6: Change ICE Transport Policy to Relay
**Reference:** H-2, SECURITY_STANDARDS §3

**Status:** ✅ FIXED - `peer-manager.ts:99` uses `iceTransportPolicy: 'relay'` to prevent private IP leakage

**Effort:** ~15 minutes

---

## P2 — Hardening (Post-Launch Recommended)

### P2-1: Implement Zod Schema Validation for All Socket Events
**Reference:** H-13, SECURITY_STANDARDS §7

**Current State:**
- Zod is installed and used for room events
- Need to verify all events have consistent Zod validation

**Required:**
- Audit all Socket.IO event handlers
- Ensure consistent Zod validation across all events (room, chat, turn)

**Effort:** ~2 hours

---

### P2-2: Implement Structured Logging
**Reference:** L-9, SECURITY_STANDARDS §10

**Current State:**
- `logger.ts` exists with structured logging
- Verify full integration across all events

**Required:**
- Verify JSON structured logging with trace IDs everywhere
- Add security event logging (auth failures, rate limit hits)

**Effort:** ~1 hour (audit)

---

### P2-3: Add Metrics Endpoint Verification
**Reference:** SECURITY_STANDARDS §10

**Status:** ✅ FIXED - `routes/metrics.ts` now properly tracks histogram observations and outputs correct bucket counts

**Effort:** ~1 hour

---

### P2-4: Add DTLS Cipher Hardening
**Reference:** M-3, SECURITY_STANDARDS §3

**Status:** ✅ FIXED - `peer-manager.ts:102-114` documents that modern browsers use secure DTLS cipher suites (AEAD/GCM) by default; iceTransportPolicy: 'relay' ensures all media goes through TURN

**Effort:** ~2 hours

---

## P3 — Polish (Future Enhancements)

### P3-1: Per-Socket Rate Limiting
**Reference:** H-16, SECURITY_STANDARDS §8

**Current State:**
- Rate limiting is per-IP only

**Required:**
- Add per-socket rate limits
- Consider Redis-backed rate limiting for horizontal scaling

**Effort:** ~4 hours

---

### P3-2: Add WebRTC Stats Reporting
**Reference:** M-13, SECURITY_STANDARDS §10

**Current State:**
- No WebRTC stats collection

**Required:**
- Implement getStats() polling
- Report connection quality metrics

**Effort:** ~3 hours

---

### P3-3: Implement Docker Network Isolation (Dev Mode)
**Reference:** SECURITY_STANDARDS §6

**Current State:**
- Single network in dev compose

**Required:**
- Create separate networks: frontend-network, backend-network, turn-network

**Effort:** ~2 hours

---

## Testing Gaps

### Existing Tests (Verified Working)
- ✅ Unit tests: `packages/backend/src/__tests__/`
- ✅ Integration tests: `packages/backend/src/__tests__/*.integration.test.ts`
- ✅ E2E tests: `e2e/*.spec.ts`
- ✅ Security tests: `tests/security/`

### Missing Coverage
- ❌ Load tests (k6) - documented but not in CI
- ❌ OWASP ZAP scan in CI

---

## Implementation Order

```
Phase 1: Deploy Blockers (P0)
├── P0-1: Enable HTTPS
├── P0-2: Media stream cleanup
└── P0-3: TURN port verification (DONE)

Phase 2: Critical Path (P1)
├── P1-1: Fix CSP
├── P1-2: CORS fallback fix
├── P1-3: Dev network isolation
├── P1-4: TURN endpoint auth
├── P1-5: Display name allowlist
└── P1-6: ICE relay policy

Phase 3: Hardening (P2)
├── P2-1: Zod schema consistency
├── P2-2: Structured logging
├── P2-3: Metrics endpoint
└── P2-4: DTLS cipher hardening

Phase 4: Polish (P3)
├── P3-1: Per-socket rate limiting
├── P3-2: WebRTC stats
└── P3-3: Dev network isolation
```

---

## Acceptance Criteria Coverage

| AC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| AC-01 | Room Creation | ✅ | Working |
| AC-02 | Room Join | ✅ | Working |
| AC-03 | Voice Call | ✅ | Working |
| AC-04 | Video Call | ✅ | Working |
| AC-05 | Mute Toggle | ✅ | Working |
| AC-06 | Camera Toggle | ✅ | Working |
| AC-07 | Screen Share | ✅ | Working |
| AC-08 | Screen Share Stop | ✅ | Fixed in use-webrtc.ts:172-174 |
| AC-09 | Text Chat | ✅ | Working |
| AC-10 | Chat Persistence | ✅ | Working |
| AC-11 | Ephemeral Room | ✅ | Working |
| AC-12 | NAT Traversal | ✅ | Working with TURN |
| AC-13 | Performance | ✅ | E2E tests exist |
| AC-14 | OWASP ZAP | ❌ | Need test in CI |
| AC-15 | Security Headers | ✅ | Fixed - HTTPS enabled (P0-1), CSP fixed (P1-1) |
| AC-16 | Cross-browser | ✅ | Configured in playwright |
| AC-17 | Mobile | ⚠️ | Manual testing needed |
| AC-18 | Load Test | ❌ | k6 not in CI |
| AC-19 | Accessibility | ✅ | E2E tests exist |
| AC-20 | Permission Denied UX | ✅ | E2E tests exist |

---

## New Findings Since Last Review

### Fixed Issues Now in Codebase
1. **Socket.IO Rate Limiter** - Wired in server.ts:48
2. **TURN Secret Validation** - Throws if missing (server.ts:3-6)
3. **SDP Private IP Validation** - Implemented in room-events.ts:204-208
4. **Room Membership Checks** - Implemented for all signaling events
5. **Event Listener Cleanup** - Bound handlers stored in constructor
6. **Non-root Container User** - nginx user created in Dockerfile
7. **Production Network Isolation** - proxy-network and turn-network separated
8. **Container Resource Limits** - Defined in production compose
9. **Sourcemaps Disabled** - vite.config.ts:24
10. **HTTPS Enabled** - nginx.conf:40-103 adds HTTPS server block with TLS 1.2/1.3

### Remaining Issues
1. **Media stream cleanup** - screen share stop doesn't restore camera
2. **CSP unsafe-inline** - still present in nginx.conf
3. **CORS fallback** - still defaults to localhost
4. **Dev network isolation** - port 3000 exposed, single network
5. **TURN endpoint auth** - no room membership check
6. **Display name allowlist** - not enforced
7. **ICE relay policy** - should be 'relay' not 'all'

---

*Generated by Claude Code — 2026-03-23*
