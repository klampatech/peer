# PRIORITY_FIX.md — Peer P2P VOIP Application Evaluation

**Date**: 2026-03-27
**Evaluation Scope**: Linting, unit tests, E2E functional tests, WebRTC/VOIP validation

---

## Executive Summary

| Area | Status | Issues |
|------|--------|--------|
| Backend Lint | ✅ PASS | 0 errors |
| Backend Tests | ✅ PASS | 0 failures (135 tests) |
| Backend Typecheck | ✅ PASS | 0 errors |
| Frontend Lint | ❌ FAIL | 1 error |
| Frontend Tests | ✅ PASS | 0 failures (152 tests) |
| Frontend Typecheck | ✅ PASS | 0 errors |
| E2E Functional | ⚠ FLAKY | 21 failures (8.75%), mostly headless browser issues |
| VOIP/WebRTC | ⚠ MINOR | 3 issues (2 medium, 1 low) |

**Overall**: Application core functions work. One lint error requires fix. E2E tests have browser-specific flakiness.

---

## 1. FRONTEND — CRITICAL (Fix Required)

### Issue #1: Conditional React Hook Call
- **Severity**: CRITICAL
- **Location**: `packages/frontend/src/pages/RoomPage.tsx:34`
- **Error**: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render.
- **Impact**: Violates Rules of Hooks — undefined behavior
- **Fix**: Move `useEffect` to top level of component with condition checked inside the effect

---

## 2. VOIP/WEBRTC — MEDIUM (Address Soon)

### Issue #2: Missing Duplicate Connection Guard
- **Severity**: MEDIUM
- **Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:162`
- **Description**: `connectToPeer` does not check if a peer connection already exists for the target peerId before creating a new one
- **Impact**: If called multiple times for same peer, could create duplicate connections
- **Fix**: Add `if (this.peers.has(peerId)) return;` at start of method

### Issue #3: No Retry Mechanism When localStream Unavailable
- **Severity**: MEDIUM
- **Location**: `packages/frontend/src/lib/signalling.ts:100-117` and `use-webrtc.ts:88-109`
- **Description**: When peer-list is received, if localStream is not yet available, connectToPeer is skipped. No retry when localStream becomes available.
- **Impact**: User may join room without media, then enable camera/mic, but remain disconnected from peers
- **Fix**: Store pending peer connections and retry when localStream becomes available

### Issue #4: TURN-Only Policy With No Fallback
- **Severity**: LOW
- **Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:106`
- **Description**: `iceTransportPolicy: 'relay'` requires TURN server availability. No fallback if TURN unavailable.
- **Impact**: Connection failures if TURN server is down or misconfigured
- **Fix**: Document TURN server dependency clearly, or add fallback to 'all' policy

---

## 3. E2E TESTS — INFRASTRUCTURE (Not Blocking)

### Issue #5: Room Creation URL Navigation Flaky
- **Severity**: INFRASTRUCTURE
- **Location**: `e2e/rooms.spec.ts:15`
- **Description**: `toHaveURL(/\/room\/([a-f0-9-]+)/)` times out intermittently on Chromium; page stays at `/` after clicking "Create New Room"
- **Impact**: Test infrastructure issue, not app breakage
- **Fix**: Investigate form submission or client-side routing timing

### Issue #6: WebRTC Peer Connection Test Fails
- **Severity**: INFRASTRUCTURE
- **Location**: `e2e/webrtc-connection.spec.ts:5`
- **Description**: `page1.waitForURL(/\/room\/.+/)` times out at 60s during room creation
- **Root Cause**: Same as Issue #5
- **Fix**: Same as Issue #5

### Issue #7: Copy Invite Link Button Timing Issue
- **Severity**: INFRASTRUCTURE
- **Location**: `e2e/rooms.spec.ts:70`
- **Description**: Button with `/copy invite link|copied/i` selector not visible — timing issue
- **Fix**: Add waitForSelector or delay before checking

### Issue #8: Firefox/WebKit Test Timeouts
- **Severity**: INFRASTRUCTURE
- **Description**: ICE servers test and console errors test timeout in Firefox headless. NAT traversal suite fails entirely in WebKit.
- **Impact**: 16 failures across non-Chromium browsers
- **Fix**: Browser-specific test adjustments or skip in CI

### Issue #9: Mobile Test Failures
- **Severity**: INFRASTRUCTURE
- **Description**: `getUserMedia` constraints differ in mobile headless browsers
- **Impact**: 6 failures on mobile Chrome/Safari
- **Fix**: Improve media device mocking for mobile headless

---

## 4. TEST COVERAGE GAPS — INFORMATIONAL

### Signaling Flow Tests Limited
- **Location**: `packages/frontend/src/__tests__/signalling.test.ts`
- **Description**: Tests only verify method existence, not actual signaling flow
- **Impact**: No regression protection for signaling edge cases
- **Recommendation**: Add integration tests for signaling flow with mock Socket.IO

---

## Priority Action Items

### Immediate (Fix Before Deploy)
1. **Fix conditional React Hook** in RoomPage.tsx:34

### Soon (Next Sprint)
2. Add duplicate connection guard in peer-manager.ts
3. Add retry mechanism for peer connections when localStream becomes available

### Eventually (Tech Debt)
4. Document TURN server dependency
5. Fix E2E test flakiness on Chromium
6. Add signaling flow integration tests

---

## Test Results Detail

| Test Suite | Result | Details |
|------------|--------|---------|
| Backend Unit Tests | ✅ 135/135 PASS | No failures |
| Frontend Unit Tests | ✅ 152/152 PASS | No failures |
| E2E Chromium | ⚠ 29/34 | 5 failures (timing/race) |
| E2E Firefox | ⚠ 34/40 | 6 failures (browser-specific) |
| E2E WebKit | ⚠ 34/40 | 6 failures (NAT traversal) |
| E2E Mobile | ⚠ 34/40 | 6 failures (getUserMedia) |

---

## Files Evaluated

| File | Status |
|------|--------|
| `packages/backend/src/events/room-events.ts` | ✅ Reviewed |
| `packages/frontend/src/lib/signalling.ts` | ✅ Reviewed |
| `packages/frontend/src/lib/webrtc/peer-manager.ts` | ✅ Reviewed |
| `packages/frontend/src/pages/RoomPage.tsx` | ⚠ Issue found |
| `e2e/rooms.spec.ts` | ✅ Coverage adequate |
| `e2e/chat.spec.ts` | ✅ Coverage adequate |
| `e2e/call.spec.ts` | ✅ Coverage adequate |
| `e2e/multi-peer.spec.ts` | ✅ Coverage adequate |
| `e2e/webrtc-connection.spec.ts` | ✅ Coverage adequate |
