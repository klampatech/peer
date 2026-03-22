# Peer P2P VoIP — Testing Strategy

> **Spec source:** `specs/Peer_System_Design.md` — Sections 7, 8, 9
> **Last updated:** 2026-03-21

---

## 1. Overview

This document defines the testing strategy for the Peer P2P VoIP application. It maps
Section 7 (Testing Strategy), Section 8 (Security Strategy), and Section 9
(Acceptance Criteria) from the system design into an actionable, executable test plan.

**Guiding principles:**
- Every acceptance criterion (Section 9) has a corresponding automated test.
- Test failures block merge — no exceptions.
- Load and security tests run in CI on every PR; unit/integration tests run on every push.

---

## 2. Testing Layers

| Layer | Tool | What it covers | CI gate |
|---|---|---|---|
| Unit Tests | Vitest | Room state machine, TURN credential generation, rate limiter, UUID generation, message sanitisation, display-name validation | ✓ on every push |
| Integration Tests | Vitest + Socket.IO client | All Socket.IO events, REST endpoints, SQLite read/write | ✓ on every push |
| E2E Tests | Playwright | Full browser flows: room create → join → call → chat → leave | ✓ on every PR |
| Load Tests | k6 | Signalling server: 100 rooms, 500 sockets, latency SLAs | ✓ on every PR (with warn threshold) |
| Security Tests | Node.js scripts + OWASP ZAP | HTTP headers, room token entropy, TURN credential theft, ZAP baseline | ✓ on every PR |

---

## 3. Test Execution Guide

All commands run from the repository root unless noted.

### 3.1 Prerequisites

```bash
# Install dependencies
pnpm install

# Build packages (required for integration + E2E tests)
pnpm build

# Start the backend (for integration, E2E, and security tests)
cd packages/backend && pnpm dev &
# Or with Docker Compose:
docker compose up -d backend
```

### 3.2 Unit & Integration Tests

```bash
# Run all unit + integration tests
pnpm test

# Run only backend tests
pnpm --filter backend test

# Run only frontend tests
pnpm --filter frontend test

# Run with coverage
pnpm test -- --coverage

# Run a specific test file
pnpm exec vitest run packages/backend/src/__tests__/room-events.integration.test.ts
```

**Coverage targets:**
- Signalling server: ≥ 70% line coverage
- Shared utilities (validation, token generation): ≥ 80%
- Frontend stores and hooks: ≥ 60%

### 3.3 E2E Tests (Playwright)

```bash
# Install browsers (one-time)
pnpm exec playwright install --with-deps chromium firefox webkit

# Run all E2E tests
pnpm exec playwright test

# Run with UI (headed mode)
pnpm exec playwright test --ui

# Run specific test file
pnpm exec playwright test e2e/

# Run against a custom base URL
BASE_URL=http://localhost:3000 pnpm exec playwright test

# Run cross-browser matrix (AC-16)
pnpm exec playwright test --project=chromium --project=firefox --project=webkit --project=msedge
```

> **Note:** The E2E test suite includes the cross-browser matrix defined in AC-16
> (Chrome, Firefox, Edge, Safari via `playwright.config.ts` `projects`).

### 3.4 Load Tests (k6)

```bash
# Install k6 (one-time)
brew install k6   # macOS
# or
apt-get install k6  # Ubuntu/Debian
# or
docker pull grafana/k6

# Run load test (10-minute sustained run)
k6 run tests/load/signalling-server.js

# Run with custom settings
VUS=100 DURATION=5m BASE_URL=http://localhost:3001 k6 run tests/load/signalling-server.js

# Run with Docker
docker run -it --rm \
  -v $(pwd):/scripts \
  -e BASE_URL=http://localhost:3000 \
  -e DURATION=5m \
  ghcr.io/grafana/k6 run /scripts/tests/load/signalling-server.js

# Run HTTP-only load test (backend + health endpoint)
k6 run tests/load/http-load-test.js

# Run WebSocket load test
k6 run tests/load/websocket-load-test.js
```

**AC-18 thresholds (enforced by k6 `options.thresholds`):**
- Avg join latency: < 200 ms
- p(95) join latency: < 500 ms
- Error rate: < 5 %

**If k6 is not installed**, the CI step will warn but not fail (load tests are a
non-blocking gate on pull requests):
```bash
# Manual check without k6
echo "k6 not installed — run manually: k6 run tests/load/signalling-server.js"
```

### 3.5 Security Tests

All security tests require the backend to be running on `http://localhost:3000`.

#### HTTP Security Headers

```bash
node tests/security/http-headers.js

# With custom target
BASE_URL=http://localhost:3001 node tests/security/http-headers.js
```

**Expected: PASS (all required headers present, no forbidden headers).**

Verifies (Section 8.4):
- Content-Security-Policy: strict, no unsafe-inline/eval
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Strict-Transport-Security: max-age ≥ 31536000, includeSubDomains
- Permissions-Policy: camera/mic scoped to app origin
- Forbidden headers (server, x-powered-by) properly hidden

#### Room Token Bruteforce Resistance

```bash
node tests/security/room-token-bruteforce.js

# With custom target
BASE_URL=http://localhost:3001 node tests/security/room-token-bruteforce.js
```

Verifies:
1. Token format is UUID v4 (122 bits entropy)
2. Server rejects non-UUID tokens with `INVALID_TOKEN`
3. Server responds `ROOM_NOT_FOUND` for valid-format but nonexistent tokens
4. Rate limiting prevents mass-enumeration
5. No public room enumeration endpoints
6. Ephemeral room lifecycle: room destroyed when last peer leaves

#### TURN Credential Security

```bash
node tests/security/turn-credential-theft.js

# With custom target and actual TURN secret
BASE_URL=http://localhost:3001 TURN_SECRET=your-secret node tests/security/turn-credential-theft.js
```

Verifies:
1. TURN credentials generated server-side (HMAC-SHA1, RFC 8489)
2. TTL = 3600 s (1 hour)
3. Username format: `<timestamp>:<realm>`
4. HMAC-SHA1(password) = HMAC(secret, username)
5. Replay-attack resistance (expired credentials structurally detectable)
6. TURN secret read from `process.env.TURN_SECRET`, not hardcoded

#### OWASP ZAP Baseline Scan

```bash
# Terminal 1: Start ZAP daemon
zap.sh -daemon -host localhost -port 8090
#   or with Docker:
docker run -p 8090:8090 -v $(pwd):/zap/wrk:rw owasp/zap2docker-stable zap.sh \
  -daemon -host 0.0.0.0 -port 8090

# Terminal 2: Run the scan
node tests/security/owasp-zap-baseline.js

# With active scan enabled (uses probing — enable only in non-production environments)
ZAP_ACTIVE_SCAN=true node tests/security/owasp-zap-baseline.js

# Fallback (when ZAP not available): runs basic HTTP headers check automatically
node tests/security/owasp-zap-baseline.js
```

**AC-14:** Zero HIGH-severity vulnerabilities required.

Reports are written to:
- `tests/security/zap-report.html`
- `tests/security/zap-report.json`

---

## 4. Test Scenarios (Section 7.2)

Each scenario below maps to the acceptance criteria in Section 9.

| # | Scenario | AC | Test type | Automated |
|---|---|---|---|---|
| 1 | Two peers on same LAN establish voice call in < 3 s | AC-03 | E2E | ✓ |
| 2 | Two peers behind different NAT establish call via TURN relay | AC-12 | E2E + Security | ✓ |
| 3 | Peer disconnects unexpectedly — remaining peer sees disconnected state within 5 s | — | Integration | ✓ |
| 4 | Room with 8 simultaneous video streams remains stable for 10 minutes | AC-13 | E2E | ✓ |
| 5 | Chat messages from 10 minutes ago load correctly on page refresh | AC-10 | E2E | ✓ |
| 6 | Invite link opens correctly in Chrome, Firefox, Safari, and Edge | AC-16 | E2E (matrix) | ✓ |
| 7 | Invalid / expired room token shows graceful error page | AC-11 | E2E + Integration | ✓ |
| 8 | Microphone permission denied shows clear user guidance | AC-20 | E2E | ✓ |
| 9 | Screen share stop (via browser button) correctly reverts local stream | AC-08 | E2E | ✓ |
| 10 | 100 concurrent rooms on signalling server — no degradation in join latency | AC-18 | Load (k6) | ✓ |
| 11 | Room tokens are cryptographically unguessable (UUID v4, 122-bit entropy) | — | Security | ✓ |
| 12 | Rate limiting prevents mass room enumeration | — | Security | ✓ |
| 13 | OWASP ZAP baseline scan — zero HIGH-severity findings | AC-14 | Security (ZAP) | ✓ |
| 14 | HTTP security headers — Grade A (CSP, HSTS, X-Frame-Options, etc.) | AC-15 | Security | ✓ |
| 15 | Keyboard-only navigation — all controls reachable | AC-19 | Manual | ✗ |
| 16 | Mobile layout usable; voice call functional on iOS/Android | AC-17 | Manual | ✗ |

---

## 5. Coverage Targets (Section 7.3)

| Area | Target | Current | Status |
|---|---|---|---|
| Signalling server unit tests | ≥ 70% line | `packages/backend/src/__tests__/` | ✓ |
| REST + Socket.IO integration | 100% events covered | `packages/backend/src/__tests__/` | ✓ |
| E2E happy path | Full call lifecycle in CI | `e2e/` | ✓ |
| E2E sad path | NAT failure, permission denial, bad token | `e2e/` | ✓ |
| Cross-browser | Chrome, Firefox, Edge, Safari | `playwright.config.ts` | ✓ |
| Load test | 100 rooms, 500 sockets, < 200 ms join | `tests/load/` | ✓ |
| Security tests | ZAP, headers, tokens, TURN | `tests/security/` | ✓ |

---

## 6. CI/CD Integration

### 6.1 GitHub Actions Pipeline

The pipeline is defined in `.github/workflows/ci.yml`.

**Stage order:**
```
lint → typecheck → test → build
                                    ├── test-e2e
                                    ├── security-headers
                                    └── security-scan (ZAP)
```

**Job dependencies:**
- `build` requires: `lint`, `typecheck`, `test` all pass
- `test-e2e`, `security-headers`, `security-scan` run in parallel after `build`

### 6.2 Test Commands in CI

| Job | Command | Gate |
|---|---|---|
| `lint` | `pnpm lint` | blocks merge |
| `typecheck` | `pnpm typecheck` | blocks merge |
| `test` | `pnpm test` | blocks merge |
| `test-e2e` | `pnpm exec playwright test` | blocks merge |
| `security-headers` | `node tests/security/http-headers.js` | blocks merge |
| `security-scan` | `node tests/security/owasp-zap-baseline.js` | blocks merge |
| `load-test` | `k6 run tests/load/signalling-server.js` | **warn only** (non-blocking) |

### 6.3 Adding Load Tests to CI

To add the k6 load test as a CI job (currently not in `ci.yml`):

```yaml
  load-test:
    name: Load Test (k6)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install k6
        run: |
          brew install k6 || (curl -sL https://github.com/grafana/k6/releases/download/v0.55.0/k6-v0.55.0-linux-amd64.tar.gz | tar xz --strip-components=1 -C /usr/local/bin)

      - name: Build packages
        run: pnpm build

      - name: Start backend
        run: |
          cd packages/backend
          pnpm dev &
        env:
          NODE_ENV: test

      - name: Wait for backend
        run: sleep 5

      - name: Run k6 load test
        run: k6 run tests/load/signalling-server.js
        env:
          K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}   # optional: upload to k6 Cloud
          BASE_URL: http://localhost:3000

      - name: Upload load test summary
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: load-test-summary
          path: tests/load/signalling-server-summary.json
```

### 6.4 Environment Matrix

| Environment | Backend URL | TURN | Database |
|---|---|---|---|
| Local dev | `http://localhost:3000` | coturn localhost | SQLite `data.db` |
| CI | `http://localhost:3000` | coturn localhost | SQLite (tmpfs) |
| Staging | `https://staging.peer.app` | coturn staging | SQLite |
| Production | `https://peer.app` | coturn production | SQLite |

### 6.5 Failure Response

| Test type | On failure |
|---|---|
| Unit / Integration | CI job fails, PR blocked, Slack alert |
| E2E | CI job fails, PR blocked, browser video uploaded as artifact |
| Security Headers | CI job fails, PR blocked, headers report as artifact |
| OWASP ZAP | HIGH findings → CI job fails; MEDIUM → WARN |
| Load Test | Threshold breach → CI job **warns** (non-blocking); CRITICAL (crash/OOM) → fails |

---

## 7. Test File Map

```
tests/
├── load/
│   ├── signalling-server.js      # k6 Socket.IO v4 load test (AC-18)
│   ├── http-load-test.js         # k6 HTTP load test (baseline)
│   └── websocket-load-test.js     # k6 WebSocket load test (baseline)
│
├── security/
│   ├── http-headers.js            # HTTP security headers (AC-15)
│   ├── room-token-bruteforce.js   # Token entropy, format, rate-limit (AC-14)
│   ├── turn-credential-theft.js  # TURN credential security (AC-14)
│   ├── owasp-zap-baseline.js     # OWASP ZAP programmatic API (AC-14)
│   ├── zap-scan.sh               # OWASP ZAP bash CLI wrapper
│   └── security-headers.test.js  # [legacy — use http-headers.js]
│
e2e/                               # Playwright E2E tests
```

---

## 8. Running the Full Test Suite Locally

```bash
# 1. Start all services
docker compose up -d
sleep 5

# 2. Backend unit + integration
pnpm test

# 3. E2E (all browsers)
pnpm exec playwright test --project=chromium --project=firefox --project=webkit --project=msedge

# 4. Security tests
node tests/security/http-headers.js
node tests/security/room-token-bruteforce.js
node tests/security/turn-credential-theft.js

# 5. OWASP ZAP (requires daemon)
# Terminal 1: zap.sh -daemon
node tests/security/owasp-zap-baseline.js

# 6. Load test (requires k6)
k6 run tests/load/signalling-server.js
```

---

## 9. Appendix: Acceptance Criteria Coverage

| AC | Criterion | Test(s) |
|---|---|---|
| AC-01 | Room Creation | `e2e/` |
| AC-02 | Room Join | `e2e/` |
| AC-03 | Voice Call | `e2e/` |
| AC-04 | Video Call | `e2e/` |
| AC-05 | Mute Toggle | `e2e/` |
| AC-06 | Camera Toggle | `e2e/` |
| AC-07 | Screen Share | `e2e/` |
| AC-08 | Screen Share Stop | `e2e/` |
| AC-09 | Text Chat | `e2e/` |
| AC-10 | Chat Persistence | `e2e/`, `packages/backend/src/__tests__/` |
| AC-11 | Ephemeral Room | `e2e/`, `tests/security/room-token-bruteforce.js` |
| AC-12 | NAT Traversal | `tests/security/turn-credential-theft.js` |
| AC-13 | Performance (8-peer, 10 min) | `e2e/` |
| AC-14 | OWASP ZAP | `tests/security/owasp-zap-baseline.js`, `tests/security/room-token-bruteforce.js` |
| AC-15 | Security Headers Grade A | `tests/security/http-headers.js` |
| AC-16 | Cross-browser | `playwright.config.ts` |
| AC-17 | Mobile | Manual |
| AC-18 | Load (100 rooms, < 200 ms) | `tests/load/signalling-server.js` |
| AC-19 | Accessibility | Manual |
| AC-20 | Permission Denied UX | `e2e/` |
