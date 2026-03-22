# Peer P2P VoIP Application - Implementation Plan

> **Last Updated:** 2026-03-22

## Gap Analysis Summary

**Specification Sources:**
- `specs/Peer_System_Design.md` - Full system design
- `specs/Testing_Strategy.md` - Testing requirements
- `specs/code-review-findings.md` - Code review findings

### What's Complete (Baseline)

| Phase | Status | Details |
|-------|--------|---------|
| Phase 1: Foundation | ✅ Complete | Project scaffold, backend signalling, Docker, unit tests (98 tests, 73.72% coverage) |
| Phase 2: WebRTC | ✅ Complete | Frontend scaffold, WebRTC integration, media controls, mesh topology |
| Phase 3: Screen Share + TURN | ✅ Complete | Screen sharing, TURN infrastructure |
| Phase 4: Chat + Persistence | ✅ Complete | Chat backend/frontend, SQLite persistence, cleanup jobs |
| Phase 5: UI Polish | ✅ Complete | Layout, components, responsive, typography, accessibility |

### What's Remaining (Gap Analysis)

**Testing Status:**
- Backend unit tests: 98 passing ✅
- Frontend unit tests: 115 passing ✅
- E2E tests: 6 spec files ✅
- Load tests: 3 scripts ✅
- Security tests: 6 scripts ✅

---

## Remaining Tasks - Prioritized

### P0: Critical Infrastructure Security Issues

These must be fixed before production deployment.

#### Task P0.1: Fix TURN Server Running as Root
**Severity:** Critical
**File:** `docker-compose.production.yml`

**Steps:**
1. Read current docker-compose.production.yml
2. Add security context to coturn service:
```yaml
coturn:
  user: "1001:1001"
  security_opt:
    - no-new-privileges:true
```
3. Commit with message: `fix: run coturn as non-root user`

#### Task P0.2: Enable Production HTTPS
**Severity:** Critical
**File:** `nginx.conf`

**Steps:**
1. Read current nginx.conf
2. Uncomment and configure HTTPS server block with TLS 1.2/1.3
3. Enable HSTS header
4. Ensure ssl_certificate paths are correct
5. Commit with message: `fix: enable production HTTPS in nginx`

#### Task P0.3: Pin Coturn Image Version
**Severity:** Critical
**File:** `docker-compose.production.yml`

**Steps:**
1. Change `coturn/coturn:latest` to `coturn/coturn:4.6.2`
2. Commit with message: `fix: pin coturn to specific version`

---

### P1: High Priority Infrastructure Issues

#### Task P1.1: Add Container Resource Limits
**Severity:** High
**File:** `docker-compose.production.yml`

**Steps:**
1. Add deploy.resources.limits to all services:
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 256M
```
2. Commit with message: `fix: add container resource limits`

#### Task P1.2: Enable Read-Only Filesystems
**Severity:** High
**File:** `docker-compose.production.yml`

**Steps:**
1. Add read_only: true to services where possible
2. Use :ro volume flags for config files
3. Commit with message: `fix: enable read-only filesystems`

#### Task P1.3: Configure TURN Server TLS
**Severity:** High
**File:** `turnserver.conf`, `docker-compose.production.yml`

**Steps:**
1. Configure TLS certificates for coturn
2. Enable TLS listening port 5349
3. Commit with message: `fix: configure TURN server TLS`

---

### P2: Backend Code Quality Issues

#### Task P2.1: Replace console.* with Structured Logging
**Severity:** High
**Files:** Multiple backend files (24 console usages found)

**Steps:**
1. Install pino or winston for structured logging
2. Create logger utility in `packages/backend/src/utils/logger.ts`
3. Replace all console.log/warn/error with logger
4. Files to update:
   - `packages/backend/src/index.ts` (6 usages)
   - `packages/backend/src/services/cleanup.ts` (5 usages)
   - `packages/backend/src/events/chat-events.ts` (2 usages)
   - `packages/backend/src/events/room-events.ts` (9 usages)
   - `packages/backend/src/events/turn-events.ts` (2 usages)
5. Run tests to verify
6. Commit with message: `refactor: replace console with structured logging`

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
└── P1.3: TURN TLS config

P2 (Medium - Code Quality)
├── P2.1: Structured logging
├── P2.2: Response shapes
└── P2.3: Zod validation

P3 (Testing)
├── P3.1: Unit test gaps
└── P3.2: E2E gaps

P4 (Documentation)
└── P4.1: Update docs
```

---

## Exit Criteria

- [ ] All P0 tasks complete (Critical security issues fixed)
- [ ] All P1 tasks complete (Production-ready infrastructure)
- [ ] All P2 tasks complete (Code quality improved)
- [ ] All tests pass
- [ ] Production deployment verified
