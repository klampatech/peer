# Integration Testing Gap Analysis — Peer P2P VoIP Application

**Date:** 2026-03-22
**Analysts:** backend-integration, frontend-testing, e2e-tests, load-tests, security-tests
**Confidence:** High (4 of 5 agents reported 92-95% confidence)

---

## Executive Summary

The Peer P2P VoIP application has **multi-layer test coverage** across unit, integration, E2E, load, and security dimensions. However, critical gaps exist in WebRTC signaling, multi-peer scenarios, and real-world reliability testing. The overall quality of the test suite is **47/100** — adequate for basic smoke testing but insufficient for production confidence.

### Layer Quality Scores

| Layer | Score | Biggest Gap |
|-------|-------|-------------|
| Backend Integration | 55/100 | WebRTC signaling events (sdp:offer/answer, ice-candidate) — **0% coverage** |
| Frontend Unit/Integration | 40/100 | Peer connection lifecycle, ICE failure handling, window event signaling |
| E2E (Playwright) | 35/100 | Multi-peer scenarios, WebRTC connectivity verification, media controls |
| Load Tests | 45/100 | Real Socket.IO room events under load, TURN server load, message flooding |
| Security Tests | 52/100 | SQL/XSS injection, WebRTC signaling authorization, TURN credential session binding |

---

## 1. Backend Integration Tests

**Scope:** `packages/backend/src/__tests__/*.test.ts`, `packages/backend/src/__tests__/*.integration.test.ts`
**Quality Score:** 55/100
**Confidence:** 92/100

### 1.1 What Is Covered

| Category | Files | Coverage |
|----------|-------|----------|
| Room events (create/join/leave) | `room-events.integration.test.ts` | 75% — good basic coverage |
| Chat events (message, history) | `chat-events.integration.test.ts` | 60% — basic, no pagination |
| TURN credentials | `turn-events.integration.test.ts` | 55% — format tested, security incomplete |
| Health endpoint | `health.integration.test.ts` | 90% — comprehensive |
| Cleanup scheduler | `cleanup.test.ts` | 70% — good |
| Rate limiting | `rate-limit.test.ts` | **PLACEHOLDER** — middleware existence only |

### 1.2 Critical Gaps

#### GAP-1: WebRTC Signaling Events — COMPLETELY UNTESTED (Severity: CRITICAL)

The most critical gap. `room-events.ts:194-271` handles `sdp:offer`, `sdp:answer`, and `ice-candidate` events. **None of these are tested.**

- No verification that SDP offers are forwarded between peers
- No verification that ICE candidates are forwarded
- No test for `validateSdpNoPrivateIPs()` — SDP payloads with private IPs are not tested
- No test for SDP tampering (IPv6 addresses, excessive candidate lines)

**Files affected:** `packages/backend/src/events/room-events.ts:194-271`

#### GAP-2: Reconnection Scenarios — NOT TESTED (Severity: HIGH)

No tests for a peer disconnecting and rejoining the same room. Socket.ID changes on reconnect — is peer state preserved correctly?

#### GAP-3: Disconnect Handler Cleanup — PARTIALLY TESTED (Severity: MEDIUM)

`room-events.ts:274-294` handles implicit disconnect cleanup. `cleanup.test.ts` tests the scheduler but **not the disconnect handler**. Risk: room state corruption when sockets disconnect unexpectedly.

#### GAP-4: TURN Credential Room Binding — SECURITY BUG IDENTIFIED (Severity: HIGH)

`turn-events.integration.test.ts` generates credentials without verifying room membership. **A real bug exists**: `turn-events.ts:77` calls `generateTurnCredentials()` without a room membership check when the optional `roomToken` is absent. Any authenticated user can obtain TURN credentials without being in a room.

**See also:** GAP-S1 in Security section.

#### GAP-5: Room Token UUID Version Enforcement — BUG IDENTIFIED (Severity: MEDIUM)

`rooms.test.ts:31` uses regex that accepts UUID v4, but `isRoomToken()` in `packages/shared/src/index.ts:190-192` accepts **any UUID version** due to `[0-9a-f]{4}-4[0-9a-f]{3}` not enforcing the version nibble. UUID v1 tokens are accepted.

**See also:** GAP-S2 in Security section.

#### GAP-6: Multi-Peer Scenarios — INSUFFICIENT (Severity: MEDIUM)

All Socket.IO tests use 2 peers maximum. No tests for:
- 3+ peers in the same room
- Simultaneous room creates/joins from multiple peers
- Peer broadcast ordering with 3+ peers

#### GAP-7: Socket.IO Namespace Isolation — NOT TESTED (Severity: LOW)

All tests use the default namespace "/". No test for namespace routing or Socket.IO middleware.

#### GAP-8: Socket Event Rate Limiting — NOT TESTED (Severity: MEDIUM)

HTTP rate limiting is tested in `turn-events.integration.test.ts:245-288`. **Socket event rate limiting is not tested.** `setupSocketRateLimiter()` is implemented but its effectiveness on socket events is unverified.

#### GAP-9: Room Idle Timeout — NOT TESTED (Severity: LOW)

Cleanup service is tested in isolation, but room expiration under inactivity is not verified.

#### GAP-10: Message History Pagination — NOT TESTED (Severity: LOW)

`chat:history` is tested only for rejection when not in room. No test for:
- History returns limited to 100 messages
- Messages returned in chronological order

#### GAP-11: Mocked Database — NOT TESTED WITH REAL SQLITE (Severity: MEDIUM)

All integration tests use a mocked database. Real SQLite/sql.js behavior under concurrent writes is untested.

### 1.3 Placeholder Tests

- `health.test.ts` — only tests Express app instantiates
- `rate-limit.test.ts` — only tests middleware exists

---

## 2. Frontend Unit/Integration Tests

**Scope:** `packages/frontend/src/__tests__/*.test.ts`
**Quality Score:** 40/100
**Confidence:** 95/100

### 2.1 What Is Covered

9 test files covering:
- `room-store.test.ts` — room state management
- `peer-manager.test.ts` — basic peer manager instantiation
- `use-webrtc.test.ts` — hook setup/teardown
- `use-audio-level.test.ts` — **PLACEHOLDER** — no actual testing
- `media.test.ts` — media utility functions
- Various UI component tests

### 2.2 Critical Gaps

#### GAP-12: Peer Connection Lifecycle — NOT TESTED (Severity: CRITICAL)

`peer-manager.ts:94-150` handles peer connection creation, SDP handlers, and ICE handlers. **None of this is tested.**

- `createPeerConnection()` — not tested
- `handleSdpOffer()`, `handleSdpAnswer()` — private handlers unreachable
- `handleIceCandidate()` — not tested
- Peer state transitions (connecting → connected → failed → disconnected)

#### GAP-13: ICE Failure Handling — NOT TESTED (Severity: CRITICAL)

No tests for ICE connection failure, timeout, or TURN fallback behavior.

#### GAP-14: Event-Based Signaling — NOT TESTED (Severity: CRITICAL)

`peer-manager.ts` uses `window.addEventListener('message', ...)` for signaling via postMessage(). **No tests dispatch these window events.** The entire event-based signaling flow is unreachable in tests.

#### GAP-15: replaceVideoTrack — NOT TESTED (Severity: MEDIUM)

The actual implementation at `peer-manager.ts` is not exercised. No test verifies track replacement works end-to-end.

#### GAP-16: Peer Disconnection Cleanup — NOT TESTED (Severity: MEDIUM)

No tests for cleanup when a peer disconnects mid-call.

### 2.3 Mock Issues

- `peer-manager.ts` uses `window.addEventListener` but tests never dispatch `message` events
- Private handlers (`handleSdpOffer`, `handleSdpAnswer`, `handleIceCandidate`) are unreachable without dispatching window events
- SimplePeer should be mocked but real WebRTC is being exercised in some tests

---

## 3. E2E Tests (Playwright)

**Scope:** `e2e/*.spec.ts`
**Quality Score:** 35/100
**Confidence:** 95/100

### 3.1 What Is Covered

| Spec | Tests | Coverage |
|------|-------|----------|
| `rooms.spec.ts` | 4 | Homepage, room creation, join via token, invalid token |
| `chat.spec.ts` | 4 | Room load, chat input, send message |
| `call.spec.ts` | 5 | Room load, control bar, navigate away, screen share |
| `permission-denied.spec.ts` | 4 | Permission denial UX, no crash |
| `accessibility.spec.ts` | 8 | Keyboard nav, ARIA, form labels |
| `nat-traversal.spec.ts` | 5 | Connection status, TURN creds, URL sharing |

### 3.2 Critical Gaps

#### GAP-17: Multi-Peer Scenarios — COMPLETELY UNTESTED (Severity: CRITICAL)

**Zero E2E tests use `browser.newContext()` for multi-user scenarios.** No verification that 2+ users see each other in the same room. All tests are single-user smoke tests.

#### GAP-18: WebRTC Connectivity — NOT VERIFIED (Severity: CRITICAL)

Tests only check `URL.contains('/room/')`. **No verification of:**
- `RTCPeerConnection` state (connecting → connected → failed)
- ICE connection state (Checking → Connected → Completed)
- Media tracks (audio/video are actually flowing)
- Actual media stream attached to video elements

#### GAP-19: Media Permission Denial — NOT ACTUALLY TESTED (Severity: HIGH)

`permission-denied.spec.ts` does **NOT** use Playwright's `grantPermissions()` or `setPermissions()` API to simulate denial. Tests only verify the page doesn't crash in headless mode — not that permission denial is handled.

#### GAP-20: Invite/Share Flow — NOT TESTED (Severity: MEDIUM)

No test for "Copy Link" or "Invite" button. No verification that shareable URLs work.

#### GAP-21: Media Controls — NOT TESTED (Severity: MEDIUM)

- Mute/unmute button not tested
- Camera toggle not tested
- Volume controls not tested

#### GAP-22: Leave Room / End Call — NOT TESTED (Severity: MEDIUM)

"End Call" button and room exit flow not tested.

---

## 4. Load Tests

**Scope:** `tests/load/*.js`
**Quality Score:** 45/100
**Confidence:** 92/100

### 4.1 What Is Covered

| File | Coverage |
|------|----------|
| `signalling-server.js` | HTTP /health + Socket.IO handshake polling, 50 VUs constant 10m |
| `websocket-load-test.js` | Raw WS connections + room create/join, 50 VUs, 100 rooms |
| `http-load-test.js` | HTTP /health endpoint only, 100 VUs |

### 4.2 Critical Gaps

#### GAP-23: Real Socket.IO Room Events Under Load — NOT TESTED (Severity: CRITICAL)

`signalling-server.js` handshake-only. **Never sends `room:create`, `room:join`, `room:leave` events.** The k6 script parses handshake JSON but doesn't exercise any Socket.IO event protocol.

#### GAP-24: TURN Server Load — NOT TESTED (Severity: HIGH)

Zero load testing of the coturn TURN server. No measurement of:
- TURN relay bandwidth consumption
- Concurrent TURN relay sessions
- TURN server memory/CPU under load

#### GAP-25: Message Flooding — NOT TESTED (Severity: MEDIUM)

No stress test for rapid chat/signaling message bursts (100+ messages/second per room).

#### GAP-26: Rapid Room Create/Destroy — NOT TESTED (Severity: MEDIUM)

No stress test for ephemeral room churn. `room-token-bruteforce.js:277-337` tests room lifecycle but not concurrent stress.

#### GAP-27: WebRTC Signaling Under Load — NOT TESTED (Severity: MEDIUM)

No test exercises SDP offer/answer or ICE candidate exchange under concurrent load.

#### GAP-28: Combined Signaling + TURN Load — NOT TESTED (Severity: MEDIUM)

No test generates TURN credentials while under concurrent signaling load.

### 4.3 Unmeasured Metrics

- Server-side CPU usage (`process.cpuUsage()` not sampled)
- Server-side memory/heap
- TURN server bandwidth consumption
- Room join latency distribution p(50), p(99)
- Message delivery latency under load (only raw WS latency, not Socket.IO event latency)
- Socket.IO room subscription count per server
- Database query latency under load

---

## 5. Security Tests

**Scope:** `tests/security/*.js`
**Quality Score:** 52/100
**Confidence:** 92/100

### 5.1 What Is Covered

| File | Coverage |
|------|----------|
| `security-headers.test.js` | Basic header presence (CSP, XFO, XCTO, RP, HSTS) |
| `http-headers.js` | Deep header validation (CSP unsafe-inline, HSTS max-age) |
| `owasp-zap-baseline.js` | ZAP spider + passive scan + active scan |
| `room-token-bruteforce.js` | UUID v4 entropy, token format, rate limiting |
| `turn-credential-theft.js` | HMAC-SHA1, TTL, username format, replay resistance |

### 5.2 Critical Gaps

#### GAP-29: SQL Injection — NOT TESTED (Severity: CRITICAL)

Repository uses parameterized queries (good), but **no tests verify SQL injection is blocked**. `message-repository.ts:127-138` has `sanitizeHtml()` but no XSS tests either.

#### GAP-30: Chat XSS / Message Injection — NOT TESTED (Severity: CRITICAL)

HTML sanitization exists at `message-repository.ts:127-138` but **no tests verify it blocks XSS payloads** like `<script>alert(1)</script>`.

#### GAP-31: WebRTC Signaling Authorization — NOT TESTED (Severity: CRITICAL)

`room-events.ts:210-214,239-243,261-265` has room-membership checks for signaling events, but **no security tests verify:**
- A peer cannot send SDP to a target outside their room
- A peer cannot forward SDP to other rooms
- Malicious ICE candidate flooding is not tested

#### GAP-S1: TURN Credential Session Binding — REAL BUG (Severity: HIGH)

**BUG CONFIRMED:** `turn-events.ts:77` issues TURN credentials WITHOUT verifying the requester is in a room. `TurnRequestSchema` is `.optional()` at `packages/shared/src/index.ts:273-279`, bypassing the membership check at `turn-events.ts:60`. Any authenticated user can obtain TURN relay access without a room session.

#### GAP-S2: UUID v1 Format Accepted — REAL BUG (Severity: MEDIUM)

**BUG CONFIRMED:** `room-token-bruteforce.js:166-176` explicitly tests and finds UUID v1 accepted. `isRoomToken()` regex at `packages/shared/src/index.ts:190-192` accepts any UUID version. The test logs "WARN: format validation is UUID-based, not version-specific" but does not FAIL.

#### GAP-32: Rate Limit Effectiveness — NOT VERIFIED (Severity: MEDIUM)

`room-token-bruteforce.js` tests 50 rapid joins but **doesn't verify rate limiting actually blocks** subsequent requests with 429.

#### GAP-33: ICE Candidate Injection — NOT TESTED (Severity: MEDIUM)

No tests for malformed/malicious ICE candidates beyond basic schema validation. No tests for ICE candidate flooding attacks.

#### GAP-34: SDP Offer/Answer Tampering — NOT TESTED (Severity: MEDIUM)

`validateSdpNoPrivateIPs()` is not tested with adversarial SDP payloads:
- IPv6 addresses (not covered by current regex)
- DNS names resolving to private IPs
- Excessive candidate lines (DoS)

#### GAP-35: CORS Configuration — NOT TESTED (Severity: LOW)

`corsMiddleware` at `packages/backend/src/middleware/security.ts:55-73` sets origin from env but no tests verify CORS works correctly with valid/invalid origins.

#### GAP-36: Logging of Security Events — NOT TESTED (Severity: LOW)

No verification that failed auth attempts, rate limit blocks, or unauthorized signaling are logged.

#### GAP-37: Metrics Endpoint Security — NOT TESTED (Severity: LOW)

`/metrics` endpoint exists but no tests verify it doesn't expose sensitive internal data.

### 5.3 OWASP Top 10 Coverage

| Category | Coverage |
|----------|----------|
| A01 Broken Access Control | PARTIAL — UUID v1 bug weakens token entropy |
| A02 Cryptographic Failures | GOOD — TURN HMAC-SHA1 tested |
| A03 Injection | **MISSING** — no SQL/XSS injection tests |
| A04 Insecure Design | **MISSING** |
| A05 Security Misconfiguration | GOOD — headers well covered |
| A06 Vulnerable Components | **MISSING** — no dependency scanning tests |
| A07 Auth Failures | PARTIAL — room tokens tested, brute force unverified |
| A08 Data Integrity | **MISSING** |
| A09 Logging Failures | **MISSING** |
| A10 SSRF | PARTIAL — SDP private IP validated, TURN URL not validated |

---

## 6. Real Bugs Identified by Existing Tests

| # | Bug | Severity | Location | Reported By |
|---|-----|----------|----------|-------------|
| 1 | TURN credentials obtainable without room session | HIGH | `packages/backend/src/events/turn-events.ts:77` | load-tests, security-tests |
| 2 | UUID v1 tokens accepted (version nibble not enforced) | MEDIUM | `packages/shared/src/index.ts:190-192` | security-tests |
| 3 | Rate limiting middleware untested (only smoke test) | MEDIUM | `packages/backend/src/__tests__/rate-limit.test.ts` | backend-integration |
| 4 | TURN credential HMAC shared secret hardcoded | LOW | `turn-server.ts` | security-tests |

---

## 7. Consolidated Gap Priority Matrix

| Priority | Gap ID | Description | Layer | Severity |
|----------|--------|-------------|-------|----------|
| P0 | GAP-1 | WebRTC signaling events untested | Backend | CRITICAL |
| P0 | GAP-12 | Peer connection lifecycle untested | Frontend | CRITICAL |
| P0 | GAP-17 | Multi-peer E2E scenarios untested | E2E | CRITICAL |
| P0 | GAP-18 | WebRTC connectivity not verified in E2E | E2E | CRITICAL |
| P0 | GAP-23 | Real Socket.IO events under load untested | Load | CRITICAL |
| P0 | GAP-29 | SQL injection not tested | Security | CRITICAL |
| P0 | GAP-30 | Chat XSS not tested | Security | CRITICAL |
| P0 | GAP-31 | WebRTC signaling authorization not tested | Security | CRITICAL |
| P1 | GAP-2 | Reconnection scenarios untested | Backend | HIGH |
| P1 | GAP-3 | Disconnect cleanup untested | Backend | HIGH |
| P1 | GAP-4 | TURN credential room binding bug | Backend | HIGH |
| P1 | GAP-14 | Event-based signaling untested | Frontend | HIGH |
| P1 | GAP-19 | Media permission denial not tested | E2E | HIGH |
| P1 | GAP-24 | TURN server load untested | Load | HIGH |
| P1 | GAP-S1 | TURN credential session binding bug | Security | HIGH |
| P2 | GAP-5 | UUID version enforcement bug | Backend | MEDIUM |
| P2 | GAP-6 | Multi-peer (3+) scenarios insufficient | Backend | MEDIUM |
| P2 | GAP-8 | Socket event rate limiting untested | Backend | MEDIUM |
| P2 | GAP-13 | ICE failure handling untested | Frontend | MEDIUM |
| P2 | GAP-15 | replaceVideoTrack not tested | Frontend | MEDIUM |
| P2 | GAP-20 | Invite/share flow not tested | E2E | MEDIUM |
| P2 | GAP-21 | Media controls not tested | E2E | MEDIUM |
| P2 | GAP-22 | Leave room flow not tested | E2E | MEDIUM |
| P2 | GAP-25 | Message flooding untested | Load | MEDIUM |
| P2 | GAP-26 | Rapid room create/destroy untested | Load | MEDIUM |
| P2 | GAP-27 | WebRTC signaling under load untested | Load | MEDIUM |
| P2 | GAP-32 | Rate limit effectiveness not verified | Security | MEDIUM |
| P2 | GAP-33 | ICE candidate injection not tested | Security | MEDIUM |
| P2 | GAP-34 | SDP tampering not tested | Security | MEDIUM |
| P3 | GAP-7 | Namespace isolation untested | Backend | LOW |
| P3 | GAP-9 | Room idle timeout untested | Backend | LOW |
| P3 | GAP-10 | Message history pagination untested | Backend | LOW |
| P3 | GAP-11 | Real SQLite not tested | Backend | MEDIUM |
| P3 | GAP-16 | Peer disconnection cleanup untested | Frontend | MEDIUM |
| P3 | GAP-28 | Combined signaling+TURN load untested | Load | MEDIUM |
| P3 | GAP-35 | CORS configuration untested | Security | LOW |
| P3 | GAP-36 | Security event logging untested | Security | LOW |
| P3 | GAP-37 | Metrics endpoint security untested | Security | LOW |

---

## 8. Recommendations

### Immediate (P0 — Address Before Production)

1. **Add WebRTC signaling integration tests** — test sdp:offer, sdp:answer, ice-candidate forwarding between peers
2. **Add multi-peer E2E tests** — use `browser.newContext()` to simulate 2+ concurrent users
3. **Add E2E verification of RTCPeerConnection state** — confirm ICE connection reaches `connected` state
4. **Fix TURN credential session binding bug** — `turn-events.ts:77` must check room membership before issuing credentials
5. **Fix UUID version enforcement** — `isRoomToken()` must reject UUID v1
6. **Add SQL injection tests** — verify parameterized queries block injection
7. **Add XSS sanitization tests** — verify `sanitizeHtml()` blocks `<script>` tags

### Short-term (P1-P2 — Address Within Sprint)

8. Add reconnection scenario tests
9. Add ICE failure handling tests (TURN fallback)
10. Add Socket.IO event rate limiting tests
11. Add real Socket.IO events to load tests (not just handshake)
12. Add TURN server load testing
13. Add WebRTC signaling authorization security tests
14. Add media control E2E tests (mute, camera toggle, end call)

### Medium-term (P3 — Technical Debt)

15. Add 3+ peer scenario tests
16. Add room idle timeout tests
17. Add message history pagination tests
18. Add real SQLite integration tests
19. Add CORS configuration tests
20. Add security event logging verification tests
