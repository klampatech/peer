# Peer P2P VoIP Application - Implementation Plan

> **Last Updated:** 2026-03-22 (gap analysis complete)

## Gap Analysis Summary

**Specification Sources:**
- `specs/Peer_System_Design.md` - Full system design (444 lines)
- `specs/Testing_Strategy.md` - Testing requirements (448 lines)
- `specs/code-review-findings.md` - Code review findings (200 lines)

### Current Implementation Status

| Phase | Status | Details |
|-------|--------|---------|
| Phase 1: Foundation | ✅ Complete | Project scaffold, backend signalling, Docker, unit tests (98 tests, 76% coverage) |
| Phase 2: WebRTC | ✅ Complete | Frontend scaffold, WebRTC integration, media controls, mesh topology |
| Phase 3: Screen Share + TURN | ✅ Complete | Screen sharing, TURN infrastructure |
| Phase 4: Chat + Persistence | ✅ Complete | Chat backend/frontend, SQLite persistence, cleanup jobs |
| Phase 5: UI Polish | ✅ Complete | Layout, components, responsive, typography, accessibility |

### Current Test Coverage

| Area | Target | Actual | Status |
|------|--------|--------|--------|
| Backend unit tests | ≥ 70% | 76.05% | ✅ Exceeds |
| Backend tests count | - | 98 | ✅ |
| Frontend tests | - | 115 | ✅ |
| E2E specs | 6 files | 6 files | ✅ |
| Load test scripts | 3 | 3 | ✅ |
| Security test scripts | 5+ | 5 | ✅ |

### Code Review Findings Summary

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| API Design | 0 | 0 | 2 | 0 | 0 |
| Error Handling | 0 | 1 | 1 | 1 | 0 |
| TypeScript | 0 | 2 | 2 | 0 | 0 |
| Code Organization | 0 | 0 | 2 | 1 | 0 |
| Logging | 0 | 2 | 2 | 0 | 0 |
| Performance | 0 | 0 | 1 | 3 | 1 |
| Security | 0 | 1 | 1 | 2 | 0 |
| **Total** | **0** | **6** | **11** | **7** | **1** |

---

## Remaining Tasks - Prioritized

### P0: Critical Infrastructure Security Issues

These must be fixed before production deployment.

#### Task P0.1: Fix TURN Server Running as Root ✅ COMPLETE
**Severity:** Critical
**File:** `docker-compose.production.yml` (line 56-82)

**Completed:** Added security context to coturn service:
- user: "1001:1001"
- security_opt: no-new-privileges:true

#### Task P0.2: Enable Production HTTPS ✅ COMPLETE
**Severity:** Critical
**File:** `nginx.conf` (lines 40-108)

**Completed:**
- Enabled HTTP to HTTPS redirect (line 51)
- Configured HTTPS server block with TLS 1.2/1.3 (lines 54-108)
- Added HSTS header with 1-year max-age (line 69)
- Configured SSL certificate paths to `/etc/letsencrypt/live/peer/`
- Updated `.env.example` with DOMAIN and CERTBOT_EMAIL variables
- Updated docker-compose.production.yml with proper certificate path

#### Task P0.3: Pin Coturn Image Version ✅ COMPLETE
**Severity:** Critical
**File:** `docker-compose.production.yml` (line 57)

**Completed:** Changed `coturn/coturn:latest` to `coturn/coturn:4.6.2`

---

### P1: High Priority Infrastructure Issues

#### Task P1.1: Add Container Resource Limits ✅ COMPLETE
**Severity:** High
**File:** `docker-compose.production.yml`

**Completed:** Added deploy.resources.limits to all services:
- backend: 0.5 CPU, 512M memory (limit), 0.25 CPU, 256M (reservation)
- frontend: 0.25 CPU, 256M memory (limit), 0.1 CPU, 128M (reservation)
- coturn: 0.5 CPU, 512M memory (limit), 0.25 CPU, 256M (reservation)
- nginx: 0.25 CPU, 256M memory (limit), 0.1 CPU, 128M (reservation)

#### Task P1.2: Enable Read-Only Filesystems ✅ COMPLETE
**Severity:** High
**File:** `docker-compose.production.yml`

**Completed:** Added read_only: true to all services

#### Task P1.3: Configure TURN Server TLS
**Severity:** High
**File:** `turnserver.conf`, `docker-compose.production.yml`

**Current State:** TLS port 5349 is exposed but not configured

**Steps:**
1. Configure TLS certificates for coturn
2. Enable TLS listening port 5349
3. Commit with message: `fix: configure TURN server TLS`

#### Task P1.4: Add Health Check Depth
**Severity:** Medium
**File:** `packages/backend/src/routes/health.ts`

**Current State:** Returns only status "ok" and uptime

**Steps:**
1. Extend health check to verify database connectivity
2. Add cleanup scheduler status
3. Include in status response
4. Commit with message: `feat: add health check depth`

---

### P2: Backend Code Quality Issues

#### Task P2.1: Replace console.* with Structured Logging
**Severity:** High
**Files:** Multiple backend files (24 console usages found)

**Current State:** Code uses `console.log`, `console.error` directly

**Affected Files:**
| File | Usages |
|------|--------|
| packages/backend/src/index.ts | 6 |
| packages/backend/src/events/room-events.ts | 9 |
| packages/backend/src/services/cleanup.ts | 5 |
| packages/backend/src/events/chat-events.ts | 2 |
| packages/backend/src/events/turn-events.ts | 2 |

**Steps:**
1. Install pino for structured logging
2. Create logger utility in `packages/backend/src/utils/logger.ts`
3. Replace all console.log/warn/error with logger
4. Run tests to verify
5. Commit with message: `refactor: replace console with structured logging`

#### Task P2.2: Standardize Socket.IO Response Shapes
**Severity:** Medium
**File:** `packages/backend/src/events/*.ts`

**Steps:**
1. Review all Socket.IO event responses
2. Standardize to consistent `ApiResponse<T>` format
3. Update chat events to wrap responses like room events
4. Commit with message: `refactor: standardize Socket.IO response shapes`

#### Task P2.3: Add Zod Validation for Socket.IO Payloads
**Severity:** Medium
**Files:** `packages/backend/src/events/*.ts`

**Steps:**
1. Add Zod to package.json dependencies
2. Create validation schemas for each event type
3. Add runtime validation before processing
4. Commit with message: `feat: add Zod validation for Socket.IO payloads`

#### Task P2.4: Fail Fast on Missing TURN_SECRET
**Severity:** High
**File:** `packages/backend/src/services/turn-credentials.ts` (line 3)

**Current State:** `const TURN_SECRET = process.env.TURN_SECRET || 'change-me-in-production'`

**Steps:**
1. Remove the fallback default
2. Throw error at startup if TURN_SECRET is not set
3. Update docker-compose.production.yml to require TURN_SECRET
4. Commit with message: `fix: fail fast on missing TURN_SECRET`

#### Task P2.5: Add Trace IDs to All Requests
**Severity:** High
**Files:** All Socket.IO event handlers

**Steps:**
1. Generate traceId on connection or first event
2. Store in socket.data
3. Include in all log entries
4. Commit with message: `feat: add traceId to all requests`

---

### P3: Testing Improvements

#### Task P3.1: Add Missing Unit Tests
**Steps:**
1. Write tests for `message-repository.test.ts` (if not complete)
2. Write tests for cleanup service edge cases
3. Commit with message: `test: add missing unit tests`

#### Task P3.2: Add Missing E2E Tests
**Steps:**
1. Verify E2E tests cover all AC criteria
2. Add any missing test scenarios
3. Commit with message: `test: complete E2E coverage`

#### Task P3.3: Add Load Test to CI Pipeline
**Severity:** High
**File:** `.github/workflows/ci.yml`

**Current State:** Load tests exist but are not in CI

**Steps:**
1. Add k6 load test job to CI workflow
2. Configure as non-blocking (warn only) per Testing Strategy spec
3. Commit with message: `ci: add load test to CI pipeline`

---

### P4: Documentation Updates

#### Task P4.1: Update Documentation for Production
**Steps:**
1. Verify README is up-to-date
2. Document production deployment steps
3. Add security configuration documentation
4. Commit with message: `docs: update documentation for production`

---

## Test Execution Commands

```bash
# Run all tests
pnpm test

# Backend tests
pnpm --filter backend test

# Frontend tests
pnpm --filter frontend test

# E2E tests
pnpm exec playwright test

# Load tests
k6 run tests/load/signalling-server.js

# Security tests
node tests/security/http-headers.js
node tests/security/room-token-bruteforce.js
```

---

## Dependency Order

```
P0 (Critical - Block Production)
├── P0.1: Fix TURN root
├── P0.2: Enable HTTPS
└── P0.3: Pin coturn version

P1 (High - Production Readiness)
├── P1.1: Resource limits
├── P1.2: Read-only filesystems
├── P1.3: TURN TLS config
└── P1.4: Health check depth

P2 (Medium - Code Quality)
├── P2.1: Structured logging
├── P2.2: Response shapes
├── P2.3: Zod validation
├── P2.4: TURN_SECRET fail-fast
└── P2.5: Trace IDs

P3 (Testing)
├── P3.1: Unit test gaps
├── P3.2: E2E gaps
└── P3.3: Add load test to CI

P4 (Documentation)
└── P4.1: Update docs
```

---

## Exit Criteria

- [ ] All P0 tasks complete (Critical security issues fixed)
- [ ] All P1 tasks complete (Production-ready infrastructure)
- [ ] All P2 tasks complete (Code quality improved)
- [ ] All P3 tasks complete (Testing gaps closed)
- [ ] All P4 tasks complete (Documentation updated)
- [ ] All tests pass
- [ ] Production deployment verified
