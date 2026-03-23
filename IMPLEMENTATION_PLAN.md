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
| CR-2: TURN_SECRET fallback | ✅ FIXED | `server.ts` throws if TURN_SECRET not set |
| CR-3: Rate limiter not wired | ✅ FIXED | `setupSocketRateLimiter(io)` called in `server.ts:48` |
| CR-5: coturn authentication | ✅ FIXED | `static-auth-secret` in `turnserver.conf:23` |
| CR-7: Certbot staging flag | ✅ FIXED | `docker-compose.production.yml:130` removes `--staging` |
| CR-9: Chat broken (peerId) | ✅ FIXED | Zod schemas and proper socket data handling |
| Network isolation (production) | ✅ FIXED | Separate `proxy-network` and `turn-network` in prod compose |
| Container resource limits | ✅ FIXED | Defined in `docker-compose.production.yml` |

---

## P0 — Deploy Blockers (Fix Before Any Deployment)

### P0-1: Enable HTTPS in Nginx Configuration
**Reference:** CR-4, SECURITY_STANDARDS §2

**Current State:**
- `nginx.conf:43-87` only defines HTTP server block
- HTTPS server block is commented out or missing

**Required:**
```nginx
# Uncomment and configure HTTPS server block
server {
    listen 443 ssl http2;
    ssl_certificate /etc/ssl/peer/fullchain.pem;
    ssl_certificate_key /etc/ssl/peer/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256;
    # ... all existing security headers
}
```

**Effort:** ~30 minutes

---

### P0-2: Fix TURN_HOST Environment Variable Integration
**Reference:** CR-1, SECURITY_STANDARDS §3

**Current State:**
- `turn-credentials.ts:39` defaults to `localhost` if `TURN_HOST` not set
- Production deployment requires actual TURN server hostname

**Required:**
- Ensure `TURN_HOST` is set in production environment variables
- Add validation at startup to fail fast if `TURN_HOST` is missing in production mode

**Effort:** ~1 hour (validation logic)

---

### P0-3: Fix Media Stream Cleanup on Screen Share Stop
**Reference:** CR-10, SECURITY_STANDARDS §3

**Current State:**
- `media.ts:112-115` handles `onended` event but doesn't stop camera tracks
- When screen share stops, camera continues broadcasting

**Required:**
- In `use-webrtc.ts` or `media.ts`, on screen share stop:
  1. Stop all camera tracks before switching to camera stream
  2. Ensure UI state matches actual media state

**Effort:** ~2 hours

---

### P0-4: Fix Event Listener Cleanup in peer-manager
**Reference:** CR-11, SECURITY_STANDARDS §3

**Current State:**
- `.bind(this)` creates new function reference each time
- `removeEventListener` fails to remove listeners on reconnection

**Required:**
- Store bound function references in a variable
- Or use AbortController for cleanup

**Effort:** ~1 hour

---

### P0-5: Run Frontend Container as Non-Root User
**Reference:** CR-12, SECURITY_STANDARDS §6

**Current State:**
- `Dockerfile.frontend` runs nginx as root

**Required:**
```dockerfile
# Add before CMD
RUN addgroup -S nginx && adduser -S nginx -G nginx
USER nginx
```

**Effort:** ~30 minutes

---

## P1 — Critical Path (Fix Before Production)

### P1-1: Add SDP Validation in Signaling
**Reference:** H-1, SECURITY_STANDARDS §3, §7

**Current State:**
- `room-events.ts` relays SDP offers/answers as raw objects
- No validation of SDP structure or size

**Required:**
- Add Zod schema for SDP validation (max 10KB, reject private IP ranges)
- Validate before relaying to peers

**Effort:** ~2 hours

---

### P1-2: Filter ICE Private IP Candidates
**Reference:** H-2, SECURITY_STANDARDS §3

**Current State:**
- No `iceTransportPolicy` set in RTCPeerConnection
- Private host IPs exchanged with all peers

**Required:**
- Set `iceTransportPolicy: 'relay'` in peer connections
- Or implement candidate filtering before exchange

**Effort:** ~1 hour

---

### P1-3: Add Room Membership Verification on Signaling Events
**Reference:** H-3, SECURITY_STANDARDS §4

**Current State:**
- `sdp:offer`, `sdp:answer`, `ice-candidate` handlers don't verify sender is in same room

**Required:**
- Add room membership check: verify `senderSocket.data.rooms` includes target peer
- Reject unauthorized signaling attempts

**Effort:** ~2 hours

---

### P1-4: Disable Sourcemaps in Production Build
**Reference:** H-4, SECURITY_STANDARDS §5

**Current State:**
- `vite.config.ts` may have sourcemaps enabled

**Required:**
```typescript
// vite.config.ts
build: {
  sourcemap: false, // Disable in production
}
```

**Effort:** ~15 minutes

---

### P1-5: Fix CSP - Remove unsafe-inline and unsafe-eval
**Reference:** H-8, SECURITY_STANDARDS §5

**Current State:**
- `nginx.conf:55` CSP includes `'unsafe-inline' 'unsafe-eval'`

**Required:**
- Remove unsafe directives
- Use nonce or hash for any required inline scripts (Vite handles this)

**Effort:** ~1 hour

---

### P1-6: Fix CORS Fallback to Localhost
**Reference:** H-5, SECURITY_STANDARDS §4

**Current State:**
- `server.ts:39` falls back to `localhost:5173` if `CORS_ORIGIN` not set

**Required:**
- Fail at startup if `CORS_ORIGIN` is not set in production mode
- Validate origin against allowlist

**Effort:** ~1 hour

---

### P1-7: Fix Dev Docker Compose Network Isolation
**Reference:** H-6, H-7

**Current State:**
- `docker-compose.yml:22-23` exposes port 3000 to host
- All services on single `peer-network`

**Required:**
- Remove `ports: ["3000:3000"]` from backend service
- Use internal-only access via nginx

**Effort:** ~30 minutes

---

### P1-8: Fix Plaintext TURN Port Exposure
**Reference:** CR-6

**Current State:**
- `docker-compose.yml:58-60` only exposes 5349 (TLS) - GOOD
- Need to verify production compose doesn't expose 3478

**Required:**
- Verify `docker-compose.production.yml` only exposes 5349

**Effort:** ~15 minutes (verification)

---

### P1-9: TURN Credential Endpoint Room Membership Check
**Reference:** CR-8, SECURITY_STANDARDS §3

**Current State:**
- `turn-events.ts:13-52` generates credentials without verifying room membership

**Required:**
- Verify socket has joined a room before issuing TURN credentials

**Effort:** ~1 hour

---

### P1-10: Add Display Name Character Allowlist
**Reference:** H-12, SECURITY_STANDARDS §7

**Current State:**
- Display names accept any Unicode
- ANSI escape codes, RTL/LTR overrides possible

**Required:**
- Enforce character allowlist: alphanumeric + common punctuation, max 50 chars
- Use Zod schema in `packages/shared/src/schemas.ts`

**Effort:** ~1 hour

---

## P2 — Hardening (Post-Launch Recommended)

### P2-1: Implement Zod Schema Validation for All Socket Events
**Reference:** H-13, SECURITY_STANDARDS §7

**Current State:**
- Zod is installed but usage is inconsistent
- Some events use Zod, others don't

**Required:**
- Audit all Socket.IO event handlers
- Ensure consistent Zod validation across all events

**Effort:** ~4 hours

---

### P2-2: Implement Structured Logging
**Reference:** L-9, SECURITY_STANDARDS §10

**Current State:**
- No structured logging specification implemented
- `logger.ts` exists but may not be fully integrated

**Required:**
- Implement JSON structured logging with trace IDs
- Add security event logging (auth failures, rate limit hits)

**Effort:** ~3 hours

---

### P2-3: Add Metrics Endpoint
**Reference:** SECURITY_STANDARDS §10

**Current State:**
- `routes/metrics.ts` exists - verify it's functional

**Required:**
- Ensure `/metrics` endpoint returns Prometheus format
- Track: request rate, error rate, latency, active rooms, active peers

**Effort:** ~2 hours

---

### P2-4: Add Container Hardening (DockerBench)
**Reference:** H-11, SECURITY_STANDARDS §6

**Current State:**
- No `cap_drop`, `read_only`, `security_opt` in dev compose

**Required:**
- Add to production compose if not present:
  ```yaml
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  read_only: true
  ```

**Effort:** ~1 hour

---

### P2-5: Add DTLS Cipher Hardening
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
├── P0-2: TURN_HOST integration
├── P0-3: Media stream cleanup
├── P0-4: Event listener cleanup
└── P0-5: Non-root container user

Phase 2: Critical Path (P1)
├── P1-1: SDP validation
├── P1-2: ICE candidate filtering
├── P1-3: Room membership verification
├── P1-4: Disable sourcemaps
├── P1-5: Fix CSP
├── P1-6: CORS fallback fix
├── P1-7: Dev network isolation
├── P1-8: TURN port verification
├── P1-9: TURN endpoint auth
└── P1-10: Display name allowlist

Phase 3: Hardening (P2)
├── P2-1: Zod schema consistency
├── P2-2: Structured logging
├── P2-3: Metrics endpoint
├── P2-4: Container hardening
└── P2-5: DTLS cipher hardening

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
| AC-08 | Screen Share Stop | 🔧 | Need P0-3 fix |
| AC-09 | Text Chat | ✅ | Working |
| AC-10 | Chat Persistence | ✅ | Working |
| AC-11 | Ephemeral Room | ✅ | Working |
| AC-12 | NAT Traversal | 🔧 | Need P0-2 fix |
| AC-13 | Performance | ✅ | E2E tests exist |
| AC-14 | OWASP ZAP | 🔧 | Need test in CI |
| AC-15 | Security Headers | 🔧 | Need P0-1, P1-5 |
| AC-16 | Cross-browser | ✅ | Configured in playwright |
| AC-17 | Mobile | ⚠️ | Manual testing needed |
| AC-18 | Load Test | ❌ | k6 not in CI |
| AC-19 | Accessibility | ✅ | E2E tests exist |
| AC-20 | Permission Denied UX | ✅ | E2E tests exist |

---

*Generated by Claude Code — 2026-03-23*
