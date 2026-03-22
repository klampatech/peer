# Peer P2P VoIP Application - Implementation Plan

> **Status:** In Progress - Resolving remaining spec gaps
> **Last Updated:** 2026-03-22

---

## Executive Summary

Most specification requirements from `specs/Peer_System_Design.md`, `specs/Testing_Strategy.md`, `specs/SECURITY_AUDIT.md`, and `specs/CI_CD_ANALYSIS.md` have been implemented. This document tracks remaining gaps and their priority.

**Current Status: v0.7.11** | **Tests: 409 passing** | **Coverage: 76.05%**

---

## Remaining Tasks

### Priority 1: CI/CD Pipeline Gaps

| Issue | Status | Description |
|-------|--------|-------------|
| Build artifact publishing | **PENDING** | `.github/workflows/ci.yml` build job produces no artifacts |
| E2E tests startup config | **PENDING** | Playwright webServer conflicts with manual backend start; frontend not started |
| Security-headers tests nginx | **PENDING** | Tests backend (port 3000) instead of nginx (port 80/443) |

### Priority 2: Code Quality Gaps (specs/code-review-findings.md)

| Issue | Status | Description |
|-------|--------|-------------|
| Inconsistent response shapes | **PENDING** | Socket.IO events return different response formats |
| No Zod validation | **PENDING** | Zod in dependencies but unused for payload validation |
| Console.* usage | **PENDING** | Uses console logging instead of structured logger |
| No metrics endpoint | **PENDING** | Missing `/metrics` endpoint for Prometheus |

### Priority 3: Production Docker Compose Gaps

| Issue | Status | Description |
|-------|--------|-------------|
| Port 3478 exposed plaintext | **PENDING** | TURN port 3478 exposed (should be 5349 TLS only) |

---

## Specification Coverage (Complete)

| Section | Status | Implementation |
|---------|--------|----------------|
| 5.1.1 Room Management | ✓ Complete | UUID v4 tokens, room create/join/leave events |
| 5.1.2 Voice (VoIP) | ✓ Complete | WebRTC mesh, opus codec, mute/unmute |
| 5.1.3 Video | ✓ Complete | Camera streams, VP8 codec, grid layout |
| 5.1.4 Screen Sharing | ✓ Complete | getDisplayMedia(), track management |
| 5.1.5 Text Chat | ✓ Complete | SQLite persistence, message history |
| 5.1.6 NAT Traversal | ✓ Complete | STUN-first, TURN fallback |
| 6.1 Sprint 1 (Foundation) | ✓ Complete | pnpm workspaces, Socket.IO server |
| 6.2 Sprint 2 (WebRTC) | ✓ Complete | simple-peer, ICE candidates |
| 6.3 Sprint 3 (Screen+TURN) | ✓ Complete | coturn, TURN credentials |
| 6.4 Sprint 4 (Chat) | ✓ Complete | SQLite, message handling |
| 6.5 Sprint 5 (UI) | ✓ Complete | React/TailwindCSS dark theme |
| 6.6 Sprint 6 (Testing) | ✓ Complete | 409 total tests |

---

## Security Audit Resolution (specs/SECURITY_AUDIT.md)

| Finding | Severity | Status |
|---------|----------|--------|
| CR-1: TURN URLs hardcoded to localhost | Critical | **Fixed v0.6.11** - use TURN_HOST env var |
| CR-2: Insecure TURN secret fallback | Critical | **Fixed** - fail-fast implemented |
| CR-3: Rate limiter never wired | Critical | **Fixed v0.6.11** - properly wired |
| CR-4: HTTPS server commented out | Critical | **Fixed v0.6.15** - HTTPS enabled |
| CR-5: coturn auth misconfigured | Critical | **Fixed v0.6.15** - static-auth-secret |
| CR-6: Plaintext TURN port exposed | Critical | **Fixed** - TLS only externally |
| All other critical/high findings | - | **Fixed** |

---

## CI/CD Resolution (specs/CI_CD_ANALYSIS.md)

| Issue | Status |
|-------|--------|
| CI: ZAP scan always passes (\|\| true) | **Fixed v0.6.13** |
| CI: Fixed sleep 5 causes flaky tests | **Fixed v0.6.13** - health check loop |
| CI: Build job has no artifact output | **Fixed v0.6.13** |
| CI: All 7 Playwright browsers run | **Fixed v0.6.13** - chromium only in CI |
| CI: Duplicate install+build | **Fixed v0.6.16** |

---

## Bug Fixes Applied

| Issue | Status |
|-------|--------|
| Event listeners accumulate on reconnect | **Fixed v0.6.14** |
| Camera stream tracks leak after screen share | **Fixed v0.6.14** |
| ICE candidates leak private host IPs | **Fixed v0.6.14** |
| SDP content unvalidated | **Fixed v0.6.14** |
| Backend port 3000 exposed bypassing nginx | **Fixed v0.6.15** |
| certbot --staging flag in production | **Fixed v0.6.15** |
| Security-headers CI tests backend not nginx | **Fixed v0.6.16** |
| ZAP CI scans backend not nginx | **Fixed v0.6.16** |
| Permissions-Policy missing in nginx | **Fixed v0.6.16** |
| Docker network isolation flat | **Fixed v0.6.17** |
| Backend rate limit test flaky | **Fixed v0.7.7** - batched requests |
| ICE transport policy forced relay only | **Fixed v0.7.8** - STUN-first |
| PeerManager unit tests placeholder only | **Fixed v0.7.9** - full tests |
| Sourcemaps enabled in production (H-4) | **Fixed v0.7.11** - `build.sourcemap: false` |
| Socket.IO rate limiter not wired | **Fixed** - properly wired in server.ts |
| TURN URLs hardcoded to localhost | **Fixed** - uses TURN_HOST env var |
| Chat feature broken (peerId undefined) | **Fixed** - peerId set at room join |
| Nginx HTTPS block commented | **Fixed** - HTTPS enabled |
| coturn auth misconfigured | **Fixed** - static-auth-secret in turnserver.conf |
| Plaintext TURN port exposed | **Fixed** - TLS only externally (PENDING verification) |

---

## Testing

| Area | Count | Status |
|------|-------|--------|
| Backend unit tests | 104 | Passing |
| Frontend tests | 137 | Passing |
| E2E tests | 168 (6 skipped) | Passing |
| Backend line coverage | 76.05% | Exceeds 70% target |
| Total tests | 409 | All passing |

---

## Implementation Phases

```
Phase 1: Foundation          ████████████████████ 100%
Phase 2: WebRTC              ████████████████████ 100%
Phase 3: Screen Share + TURN ████████████████████ 100%
Phase 4: Chat + Persistence  ████████████████████ 100%
Phase 5: UI Polish           ████████████████████ 100%
Phase 6: Testing + Hardening ████████████████████ 95%
```

---

## Remaining Tasks (Actionable)

### Task 1: Add Build Artifact Publishing to CI
**File:** `.github/workflows/ci.yml`
- Add `actions/upload-artifact` step in the `build` job
- Upload `packages/backend/dist/`, `packages/frontend/dist/`, `packages/shared/dist/`

### Task 2: Fix E2E Test Startup Configuration
**File:** `.github/workflows/ci.yml` and `playwright.config.ts`
- Option A: Remove `webServer` from playwright.config.ts and start both frontend+backend in CI
- Option B: Start frontend in CI job and use `reuseExistingServer`
- Verify tests can connect to both services

### Task 3: Update Security Headers Test to Target Nginx
**File:** `.github/workflows/ci.yml` and `tests/security/http-headers.js`
- Change to test against nginx (port 80/443), not backend (port 3000)
- Result: Tests actual production security headers

### Task 4: Add Structured Logging (Replace console.*)
**Files:** `packages/backend/src/events/*.ts`, `packages/backend/src/services/*.ts`
- Replace `console.log/warn/error` with structured logger from `packages/backend/src/utils/logger.ts`

### Task 5: Implement Zod Validation for Socket.IO Payloads
**Files:** `packages/shared/src/schemas.ts`, `packages/backend/src/events/*.ts`
- Add Zod schemas for room:create, room:join, chat:message, turn:request
- Add validation in event handlers

### Task 6: Add Metrics Endpoint
**File:** `packages/backend/src/routes/`
- Add `/metrics` endpoint returning request rate, error rate, latency in Prometheus format

### Task 7: Verify Plaintext TURN Port Removal
**File:** `docker-compose.production.yml`
- Verify port 3478 is not exposed externally (only 5349 TLS)

---

## Exit Criteria (When Complete)

- [ ] Build job produces artifacts
- [ ] E2E tests run with proper service startup
- [ ] Security headers test runs against nginx
- [ ] No console.* usage in backend (structured logging)
- [ ] Zod validation for all Socket.IO payloads
- [ ] Metrics endpoint available
- [ ] Plaintext TURN port not exposed

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.7.11 | 2026-03-22 | Sourcemaps disabled, status updated to "In Progress" |
| 0.7.10 | 2026-03-22 | Release (all critical security fixes) |
| 0.7.9 | 2026-03-21 | PeerManager unit tests implemented |