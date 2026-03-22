# Peer P2P VoIP Application - Implementation Plan

> **Status:** In Progress - Addressing spec gaps
> **Last Updated:** 2026-03-22

---

## Post-Completion Fixes

| Issue | Status |
|-------|--------|
| HomePage health check uses wrong default URL | Fixed in v0.6.1 |
| E2E test runner Vitest conflict workaround | Documented in AGENTS.md |
| E2E "peer connection state updates correctly" test flaky | Fixed (use expect.toHaveURL with 30s timeout instead of page.waitForURL) - applied to ALL room navigation tests |
| TurnCredentialsPayload type inconsistency (credential vs password) | Fixed in v0.6.5 |
| TURN server URLs hardcoded to localhost (would fail in production) | Fixed v0.6.11 - use TURN_HOST env var, add TLS URLs |
| Permissions-Policy security header missing (required by spec) | Fixed v0.6.11 |
| Socket.IO rate limiter too permissive (180/min vs spec's 10/min) | Fixed v0.6.11 |
| Speaking indicator not connected to UI (useAudioLevel hook unused) | Fixed v0.6.11 |
| E2E tests fail when run in batch due to Socket.IO rate limit (10/min) | Fixed - made socket rate limiter configurable via SOCKET_RATE_LIMIT_POINTS and SOCKET_RATE_LIMIT_DURATION env vars |
| CI: ZAP scan always passes (|| true) | Fixed v0.6.13 |
| CI: Fixed sleep 5 causes flaky tests | Fixed v0.6.13 - replaced with health-check loop |
| CI: Build job has no artifact output | Fixed v0.6.13 - added artifact publishing |
| CI: All 7 Playwright browsers run in CI | Fixed v0.6.13 - chromium only in CI, full matrix locally |
| Event listeners accumulate on reconnect (.bind(this) issue) | Fixed in v0.6.14 - store bound handlers in constructor |

---

## Remaining Spec Gaps (Post-Implementation Review)

The following gaps were identified between the spec and implementation:

| Priority | Issue | Location | Status |
|----------|-------|----------|--------|
| CRITICAL | coturn auth misconfigured (env var not read by coturn) | turnserver.conf, docker-compose | Not Fixed |
| CRITICAL | certbot --staging flag in production | docker-compose.production.yml:119 | Not Fixed |
| CRITICAL | Backend port 3000 exposed bypassing nginx | docker-compose.production.yml:6-7 | Not Fixed |
| CRITICAL | Camera stream tracks leak after screen share | use-webrtc.ts | **FIXED v0.6.14** |
| CRITICAL | Event listeners accumulate on reconnect | peer-manager.ts | **FIXED v0.6.14** |
| HIGH | ICE candidates leak private host IPs | peer-manager.ts | **FIXED v0.6.14** |
| HIGH | SDP content unvalidated (only wrapper) | room-events.ts | Not Fixed |
| HIGH | security-headers CI tests backend not nginx | ci.yml:178 | Not Fixed |
| HIGH | ZAP CI scans backend only | ci.yml:233 | Not Fixed |
| HIGH | Duplicate install+build in CI jobs | ci.yml | Not Fixed |
| MEDIUM | CSP has unsafe-inline/unsafe-eval | nginx.conf:76 | Not Fixed |
| MEDIUM | Permissions-Policy not in nginx | nginx.conf | Not Fixed |
| MEDIUM | Single flat Docker network | docker-compose.production.yml | Not Fixed |
| LOW | nginx runs as root | packages/frontend/Dockerfile | Not Fixed |

---

## Gap Analysis Summary

**Specification Sources:**
- `specs/Peer_System_Design.md` - Full system design (444 lines)
- `specs/Testing_Strategy.md` - Testing requirements (448 lines)
- `specs/code-review-findings.md` - Code review findings (200 lines)

### Implementation Status

| Phase | Status |
|-------|--------|
| Phase 1: Foundation | Complete |
| Phase 2: WebRTC | Complete |
| Phase 3: Screen Share + TURN | Complete |
| Phase 4: Chat + Persistence | Complete |
| Phase 5: UI Polish | Complete |

### Final Test Coverage

| Area | Count | Status |
|------|-------|--------|
| Backend unit tests | 104 | Passing |
| Frontend tests | 115 | Passing |
| E2E tests | 168 (6 skipped) | Passing |
| Backend coverage | 76.05% | Exceeds target |

### Code Review Findings Resolution

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| Resolved | 0 | 6 | 11 | 7 | 1 |

---

## Dependency Order

```
P0 (Critical - Production Blockers)
├── P0.1: Fix TURN root ✅
├── P0.2: Enable HTTPS ✅
└── P0.3: Pin coturn version ✅

P1 (Production Readiness)
├── P1.1: Resource limits ✅
├── P1.2: Read-only filesystems ✅
├── P1.3: TURN TLS config ✅
└── P1.4: Health check depth ✅

P2 (Code Quality)
├── P2.1: Structured logging ✅
├── P2.2: Response shapes ✅
├── P2.3: Zod validation ✅
├── P2.4: TURN_SECRET fail-fast ✅
└── P2.5: Trace IDs ✅

P3 (Testing)
├── P3.1: Unit test gaps ✅
├── P3.2: E2E gaps ✅
├── P3.3: Load test to CI ✅
└── P3.4: TypeScript fixes ✅

P4 (Documentation)
└── P4.1: Update docs ✅

P5 (Security Post-Audit)
├── P5.1: Socket.IO rate limiter ✅
├── P5.2: TURN room verification ✅
└── P5.3: WebRTC signaling auth ✅
```

---

## Exit Criteria

- [x] All P0 tasks (Critical security fixes)
- [x] All P1 tasks (Production-ready infrastructure)
- [x] All P2 tasks (Code quality improvements)
- [x] All P3 tasks (Testing complete - 387 total tests)
- [x] All P4 tasks (Documentation updated)
- [x] All P5 tasks (Security audit fixes)
- [x] TypeScript compiles without errors
- [x] Module resolution fixed for dev server
- [x] Production deployment verified (v0.5.9)

---

## Notes

- E2E tests run reliably with `--workers=1` (CI configured)
- Production verified with HTTPS/TLS, HSTS, container security