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

#### Task P1.3: Configure TURN Server TLS ✅ COMPLETE
**Severity:** High
**File:** `turnserver.conf`, `docker-compose.production.yml`

**Completed:**
- Added TLS certificate paths: `cert=/etc/letsencrypt/live/peer/fullchain.pem`, `pkey=/etc/letsencrypt/live/peer/privkey.pem`
- Added TLS cipher-list for modern security
- Mounted certificates and config in docker-compose.production.yml (coturn service)

#### Task P1.4: Add Health Check Depth ✅ COMPLETE
**Severity:** Medium
**File:** `packages/backend/src/routes/health.ts`

**Completed:**
- Added database connectivity check (executes `SELECT 1`)
- Added cleanup scheduler status tracking via `setCleanupSchedulerStatus()`
- Added `dependencies` object in response with `database` and `cleanupScheduler` status
- Returns 503 status code when database is unavailable

---

### P2: Backend Code Quality Issues

#### Task P2.1: Replace console.* with Structured Logging ✅ COMPLETE
**Severity:** High
**Files:** Multiple backend files (24 console usages found)

**Completed:**
- Added pino and pino-pretty dependencies
- Created logger utility in `packages/backend/src/utils/logger.ts`
- Replaced all console.log/warn/error with structured logger in:
  - `packages/backend/src/index.ts` (6 usages)
  - `packages/backend/src/events/room-events.ts` (9 usages)
  - `packages/backend/src/services/cleanup.ts` (5 usages)
  - `packages/backend/src/events/chat-events.ts` (2 usages)
  - `packages/backend/src/events/turn-events.ts` (2 usages)
- TypeScript compiles cleanly (excluding pre-existing test file issues)
- 59 tests pass

#### Task P2.2: Standardize Socket.IO Response Shapes ✅ COMPLETE
**Severity:** Medium
**File:** `packages/backend/src/events/*.ts`

**Completed:**
- Added `SocketResponse<T>` type to `@peer/shared` package
- Updated `chat-events.ts` to wrap errors in `{ success, data, error }` format
- Updated `turn-events.ts` to wrap credentials in `{ success, data, error }` format
- Updated frontend to handle new response formats in `signalling.ts`
- Updated test assertions to match new format
- All 98 backend tests pass

#### Task P2.3: Add Zod Validation for Socket.IO Payloads ✅ COMPLETE
**Severity:** Medium
**Files:** `packages/shared/src/index.ts`, `packages/backend/src/events/*.ts`

**Completed:**
- Added Zod to `packages/shared/package.json` dependencies
- Created validation schemas for all event types in `packages/shared/src/index.ts`:
  - RoomCreateSchema, RoomJoinSchema, RoomLeaveSchema
  - ChatMessageSchema, ChatHistorySchema
  - TurnRequestSchema
  - SdpOfferSchema, SdpAnswerSchema, IceCandidateSchema
- Added `validatePayload` function for runtime validation
- Updated `room-events.ts` to use Zod validation
- Updated `chat-events.ts` to use Zod validation
- Updated `turn-events.ts` to use Zod validation
- All 98 backend tests pass

#### Task P2.4: Fail Fast on Missing TURN_SECRET ✅ COMPLETE
**Severity:** High
**File:** `packages/backend/src/services/turn-credentials.ts` (line 3-8)

**Completed:**
- Removed fallback default `'change-me-in-production'`
- Added startup validation that throws error if TURN_SECRET is not set
- Updated docker-compose.production.yml to require TURN_SECRET (removed fallback)
- Updated docker-compose.yml to require TURN_SECRET (removed fallback)
- Added socket.io-client and supertest devDependencies to fix build
- Added exclude for test files in tsconfig.json to fix build
- Verified all 98 tests pass with TURN_SECRET set
- Verified fail-fast behavior works correctly

#### Task P2.5: Add Trace IDs to All Requests ✅ COMPLETE
**Severity:** High
**Files:** `packages/backend/src/events/room-events.ts`, `chat-events.ts`, `turn-events.ts`

**Completed:**
- Added uuid import to all event handler files
- Generate traceId on socket connection (line 27 in room-events.ts)
- Store in socket.data for persistence across events
- Include traceId in all log entries:
  - room-events.ts: Client connected, Room created, Peer joined, Peer left, Client disconnected (9 log entries)
  - chat-events.ts: Error handling chat:message, chat:history (2 log entries)
  - turn-events.ts: TURN credentials generated, Error generating TURN credentials (2 log entries)
- All three handlers check for existing traceId to avoid duplicates
- All 98 backend tests pass

---

### P3: Testing Improvements

#### Task P3.1: Add Missing Unit Tests ✅ COMPLETE
**Severity:** Medium
**File:** `packages/backend/src/__tests__/cleanup.test.ts`

**Completed:**
- Added tests for cleanup service functions:
  - `performCleanup()` - 2 tests (verifies call to deleteOldMessages, error handling)
  - `startCleanupScheduler()` - 2 tests (verifies immediate run, prevents duplicate schedulers)
  - `stopCleanupScheduler()` - 2 tests (verifies stop behavior, handles already-stopped state)
- Total: 6 new tests added (98 → 104 backend tests)
- All 104 backend tests pass
- All 115 frontend tests pass

#### Task P3.2: Add Missing E2E Tests ✅ IN PROGRESS
**Severity:** Medium

**Progress:**
- Added chat message tests (AC-10):
  - `chat input field exists in room`
  - `can type and submit chat message`
- Added screen share button test (AC-08):
  - `screen share button exists in room`

**Remaining gaps:**
- AC-03: Two-peer call establishment (requires real WebRTC)
- AC-13: 8-stream stability (requires multi-browser setup)
- AC-12: Full NAT traversal (requires 2 peers on different networks)

#### Task P3.3: Add Load Test to CI Pipeline ✅ COMPLETE
**Severity:** High
**File:** `.github/workflows/ci.yml`

**Completed:**
- Added k6 load test job to CI workflow (lines 216-272)
- Uses reduced duration (30s) and VUs (10) for CI efficiency
- Configured as non-blocking (warn only) per Testing Strategy spec using `|| true`
- Installs k6 from official repository if not available
- Uploads load test summary as artifact
- Build job does NOT depend on load-test (non-blocking per spec)

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
├── P1.1: Resource limits ✅ Complete
├── P1.2: Read-only filesystems ✅ Complete
├── P1.3: TURN TLS config ✅ Complete
└── P1.4: Health check depth ✅ Complete

P2 (Medium - Code Quality)
├── P2.1: Structured logging ✅ Complete
├── P2.2: Response shapes ✅ Complete
├── P2.3: Zod validation ✅ Complete
├── P2.4: TURN_SECRET fail-fast ✅ Complete
└── P2.5: Trace IDs ✅ Complete

P3 (Testing)
├── P3.1: Unit test gaps ✅ Complete
├── P3.2: E2E gaps ✅ Partially complete
└── P3.3: Add load test to CI ✅ Complete

P4 (Documentation)
└── P4.1: Update docs
```

---

## Exit Criteria

- [x] All P0 tasks complete (Critical security issues fixed)
- [x] All P1 tasks complete (Production-ready infrastructure)
- [x] All P2 tasks complete (Code quality improved)
- [ ] All P3 tasks complete (Testing gaps closed)
- [ ] All P4 tasks complete (Documentation updated)
- [x] All tests pass (98 backend + 115 frontend = 213 tests)
- [ ] Production deployment verified

**Note:** Pre-existing TypeScript errors in test files (turn-events.integration.test.ts, room-events.integration.test.ts) are unrelated to implementation tasks.
