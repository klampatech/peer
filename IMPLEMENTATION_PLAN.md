# Implementation Plan — Peer P2P VoIP Application

> **Generated:** 2026-03-23
> **Source:** Analysis of `specs/*.md` vs current `packages/*` codebase
> **Status:** Prioritized task list for closing spec/code gaps

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

**Current State:**
- `nginx.conf:43-87` only defines HTTP server block
- No HTTPS server block configured

**Required:**
```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /etc/ssl/peer/fullchain.pem;
    ssl_certificate_key /etc/ssl/peer/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256;
    # ... existing security headers
}
```

**Effort:** ~30 minutes

---

### P0-2: Fix Media Stream Cleanup on Screen Share Stop
**Reference:** CR-10, SECURITY_STANDARDS §3

**Current State:**
- `media.ts:112-115` handles `onended` event but only logs - doesn't trigger UI callback
- When screen share stops, camera isn't restored automatically

**Required:**
- In `use-webrtc.ts` or via the `onended` callback, on screen share stop:
  1. Stop all screen share tracks
  2. Call callback to restore camera stream
  3. Ensure UI state matches actual media state

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

**Current State:**
- `nginx.conf:55` CSP includes `'unsafe-inline'` in script-src

**Required:**
- Remove `'unsafe-inline'` from script-src
- Use Vite's built-in hash/nonce support for any required inline scripts

**Effort:** ~1 hour

---

### P1-2: Fix CORS Fallback to Localhost
**Reference:** H-5, SECURITY_STANDARDS §4

**Current State:**
- `server.ts:39` falls back to `localhost:5173` if `CORS_ORIGIN` not set

**Required:**
- Fail at startup if `CORS_ORIGIN` is not set in production mode
- Validate origin against allowlist

**Effort:** ~1 hour

---

### P1-3: Fix Dev Docker Compose Network Isolation
**Reference:** H-6, H-7

**Current State:**
- `docker-compose.yml:22-23` exposes port 3000 to host
- All services on single `peer-network`

**Required:**
- Remove `ports: ["3000:3000"]` from backend service
- Use internal-only access via nginx

**Effort:** ~30 minutes

---

### P1-4: Add Room Membership Verification on TURN Endpoint
**Reference:** CR-8, SECURITY_STANDARDS §3

**Current State:**
- `turn-events.ts` generates credentials without verifying room membership

**Required:**
- Verify socket has joined a room before issuing TURN credentials

**Effort:** ~1 hour

---

### P1-5: Add Display Name Character Allowlist
**Reference:** H-12, SECURITY_STANDARDS §7

**Current State:**
- Display names accept any Unicode
- ANSI escape codes, RTL/LTR overrides possible

**Required:**
- Enforce character allowlist: alphanumeric + common punctuation, max 50 chars
- Use Zod schema in `packages/shared/src/schemas.ts`

**Effort:** ~1 hour

---

### P1-6: Change ICE Transport Policy to Relay
**Reference:** H-2, SECURITY_STANDARDS §3

**Current State:**
- `peer-manager.ts:99` uses `iceTransportPolicy: 'all'`
- Private host IPs exchanged with peers

**Required:**
- Set `iceTransportPolicy: 'relay'` to only use TURN candidates
- This prevents private IP leakage

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

**Current State:**
- `routes/metrics.ts` exists - verify it's functional

**Required:**
- Ensure `/metrics` endpoint returns Prometheus format
- Track: request rate, error rate, latency, active rooms, active peers

**Effort:** ~1 hour

---

### P2-4: Add DTLS Cipher Hardening
**Reference:** M-3, SECURITY_STANDARDS §3

**Current State:**
- Default RTCPeerConnection configuration used

**Required:**
- Configure DTLS with modern cipher suites
- Set `DtlsRole` and `DtlsCipherSuites`

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
| AC-08 | Screen Share Stop | 🔧 | Need P0-2 fix |
| AC-09 | Text Chat | ✅ | Working |
| AC-10 | Chat Persistence | ✅ | Working |
| AC-11 | Ephemeral Room | ✅ | Working |
| AC-12 | NAT Traversal | ✅ | Working with TURN |
| AC-13 | Performance | ✅ | E2E tests exist |
| AC-14 | OWASP ZAP | ❌ | Need test in CI |
| AC-15 | Security Headers | 🔧 | Need P0-1, P1-1 |
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

### Remaining Issues
1. **HTTPS not enabled** - nginx.conf missing HTTPS server block
2. **Media stream cleanup** - screen share stop doesn't restore camera
3. **CSP unsafe-inline** - still present in nginx.conf
4. **CORS fallback** - still defaults to localhost
5. **Dev network isolation** - port 3000 exposed, single network
6. **TURN endpoint auth** - no room membership check
7. **Display name allowlist** - not enforced
8. **ICE relay policy** - should be 'relay' not 'all'

---

*Generated by Claude Code — 2026-03-23*
