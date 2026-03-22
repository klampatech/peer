# GitHub CI/CD Pipeline — Analysis & Remediation Recommendations

**Date:** 2026-03-22
**Pipeline:** `.github/workflows/ci.yml`
**Project:** Peer — P2P VoIP Web Application with WebRTC mesh

---

## 1. Summary

The CI pipeline has 7 jobs covering lint, typecheck, unit tests, E2E tests, security headers verification, OWASP ZAP scanning, and a final build. The pipeline structure is mostly sound, but **7 critical/high issues** undermine reliability, security coverage, and CI efficiency.

---

## 2. Issues Found

### CRITICAL-1: OWASP ZAP Scan Always Passes (`|| true`)

**File:** `.github/workflows/ci.yml` lines 196–202

```yaml
docker run -v $(pwd):/zap/wrk:rw \
  -t owasp/zap2docker-stable zap.sh \
  -cmd -quickurl http://localhost:3000 \
  -quickprogress \
  -timeout 10 \
  -reportfile zap-report.html \
  -jsonreport zap-report.json || true    # ← ALWAYS SUCCEEDS
```

The `|| true` suffix causes the Docker/ZAP command to return exit code 0 regardless of whether ZAP actually ran, failed, or timed out. The subsequent check (lines 204–214) only runs if `zap-report.json` exists, but a ZAP failure typically leaves no JSON file, so the check is bypassed silently.

**Impact:** High-severity vulnerabilities can be introduced without the pipeline failing.

**Fix:** Remove `|| true`. If ZAP fails, the job should fail. Wrap ZAP in a proper error check instead:

```yaml
- name: Run OWASP ZAP scan
  run: |
    docker run --rm \
      -v "$(pwd):/zap/wrk:rw" \
      owasp/zap2docker-stable zap.sh \
      -cmd -quickurl http://localhost:3000 \
      -quickprogress \
      -timeout 120 \
      -reportfile zap-report.html \
      -jsonreport zap-report.json

- name: Check for high-severity issues
  run: |
    if [ ! -f zap-report.json ]; then
      echo "FAIL: ZAP report not generated — scan may have failed"
      exit 1
    fi
    HIGH=$(grep -o '"High":[0-9]*' zap-report.json | grep -o '[0-9]*' | head -1 || echo "0")
    echo "High severity issues: $HIGH"
    if [ "$HIGH" -gt 0 ]; then
      echo "FAIL: High severity vulnerabilities found!"
      exit 1
    fi
```

---

### CRITICAL-2: Fixed `sleep 5` Causes Flaky E2E & Security Tests

**File:** `.github/workflows/ci.yml` lines 110–117, 146–154, 183–191

All three jobs that start the backend use:

```yaml
- name: Start backend
  run: |
    cd packages/backend
    pnpm dev &

- name: Wait for backend
  run: sleep 5
```

A fixed 5-second delay is unreliable. On cold CI runners, dependency initialization, database setup, or OS scheduling can push startup past 5 seconds, causing intermittent test failures that are hard to reproduce locally.

**Impact:** Intermittent CI failures that erode trust in the pipeline ("flaky tests").

**Fix:** Replace `sleep 5` with a proper health-check loop:

```yaml
- name: Start backend
  run: |
    cd packages/backend
    pnpm dev &
    BACKEND_PID=$!
    echo "Backend PID: $BACKEND_PID" >> $GITHUB_ENV
    echo "pid=$BACKEND_PID" >> $GITHUB_ENV

- name: Wait for backend to be ready
  run: |
    for i in $(seq 1 30); do
      if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo "Backend ready after ${i} attempts"
        exit 0
      fi
      echo "Waiting for backend... ($i/30)"
      sleep 2
    done
    echo "FAIL: Backend did not become ready within 60 seconds"
    exit 1
```

---

### CRITICAL-3: `build` Job Has No Deployment or Artifact Output

**File:** `.github/workflows/ci.yml` lines 216–239

The `build` job depends on `lint`, `typecheck`, and `test`, but after successfully building all packages it simply... exits. Nothing is saved, published, or deployed.

**Impact:** The CI run produces no artifacts. There is no way to verify the exact build that passed CI, and no path to production deployment from this pipeline.

**Fix:** Add artifact publishing and (optionally) a deployment trigger:

```yaml
build:
  name: Build
  runs-on: ubuntu-latest
  needs: [lint, typecheck, test]
  steps:
    - name: Checkout code
      uses: actions/checkout@v4

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

    - name: Build packages
      run: pnpm build

    - name: Upload build artifacts
      uses: actions/upload-artifact@v4
      with:
        name: build-artifacts
        path: |
          packages/backend/dist/
          packages/frontend/dist/
          packages/shared/dist/
        retention-days: 7

    # Optional: deploy to staging on merge to main
    - name: Deploy to staging
      if: github.ref == 'refs/heads/main' && github.event_name == 'push'
      run: |
        echo "Add deployment steps here (e.g., rsync to server, k8s rollout, etc.)"
      env:
        DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
```

---

### CRITICAL-4: Playwright `webServer` Conflicts With Manual Backend Start

**File:** `playwright.config.ts` lines 57–64

```typescript
webServer: [
  {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
],
```

The `playwright.config.ts` has a `webServer` that auto-starts the frontend dev server and waits for it. In the CI job (`test-e2e`), the workflow **also** manually starts the backend with `pnpm dev &`. This creates two processes both trying to manage server lifecycle, risking port conflicts and duplicate resource consumption.

Additionally, the E2E tests target `http://localhost:5173` (the Vite dev server, per `baseURL` in playwright.config), but the CI only starts the **backend** at port 3000. The frontend dev server at 5173 is never started in the CI workflow — yet the playwright config expects it.

**Impact:** E2E tests likely fail in CI because the frontend dev server (port 5173) is never started.

**Fix:** Either remove the `webServer` block from playwright.config and start both services via the workflow, or keep the webServer and remove the manual backend start from the workflow:

```yaml
# Option A: Start both services in workflow (recommended)
- name: Start frontend
  run: pnpm dev &
  cwd: packages/frontend

- name: Start backend
  run: pnpm dev &
  cwd: packages/backend

- name: Wait for frontend
  run: |
    for i in $(seq 1 30); do
      if curl -sf http://localhost:5173 > /dev/null 2>&1; then
        echo "Frontend ready"
        exit 0
      fi
      sleep 2
    done
    exit 1
```

And in `playwright.config.ts`, remove the `webServer` block entirely for CI runs.

---

### HIGH-1: All 7 Playwright Browser Variants Run in CI

**File:** `playwright.config.ts` lines 26–54

The Playwright config defines 7 browser/device projects:
- chromium, firefox, webkit, msedge
- Mobile Chrome, Mobile Safari

Running all 7 in every CI run dramatically increases CI duration. Industry standard is to run only chromium (and optionally firefox) in CI, with webkit and edge run on a nightly or weekly schedule.

**Impact:** Slow CI feedback loop; msedge and mobile browsers add marginal value in every-PR run.

**Fix:** Add a CI-specific project filter in `playwright.config.ts`:

```typescript
const ciProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  // Uncomment for weekly/full matrix:
  // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
];

export default defineConfig({
  projects: process.env.CI ? ciProjects : [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'msedge', use: { ...devices['Desktop Edge'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
  // ...
});
```

Or use `GITHUB_EVENT_NAME` to differentiate:

```yaml
# In ci.yml — run full matrix only on a schedule, not on every PR:
test-e2e:
  if: github.event_name == 'pull_request'  # limited browsers via env
  ...
test-e2e-full:
  if: github.event_name == 'schedule'       # full matrix on cron
```

---

### HIGH-2: `security-headers` Job Tests Wrong URL

**File:** `.github/workflows/ci.yml` lines 156–157

```yaml
- name: Verify security headers
  run: node tests/security/http-headers.js
```

The `http-headers.js` script fetches `http://localhost:3000/health` (line 167 of that script). This is the **backend Express server directly**. In production, all traffic goes through nginx (port 443), which is where security headers are actually enforced.

Key headers like `Content-Security-Policy`, `HSTS`, and `X-Frame-Options` are set by nginx in `nginx.conf` lines 69–76 — they are **never sent by the backend directly**. The `http-headers.js` script validates headers from the backend, which in production are blank (Express doesn't set them by default — that's nginx's job).

**Impact:** The security-headers job validates the wrong surface. It checks backend headers that won't be present in production, while the actual production headers (set by nginx) are never tested in CI.

**Fix:** Test the nginx front-end URL instead, or add a dedicated nginx-based security check:

```yaml
# Start the full stack via docker-compose in CI instead of just the backend:
- name: Start full stack
  run: docker-compose -f docker-compose.yml up -d

- name: Wait for nginx
  run: |
    for i in $(seq 1 30); do
      if curl -sf https://localhost/health --insecure > /dev/null 2>&1; then
        echo "Stack ready"
        exit 0
      fi
      sleep 2
    done
    exit 1

- name: Verify security headers
  run: node tests/security/http-headers.js
  env:
    BASE_URL: https://localhost
    NODE_TLS_REJECT_UNAUTHORIZED: '0'  # for self-signed local certs
```

Alternatively, if keeping the backend-only test: add a second job that starts nginx and tests it.

---

### HIGH-3: OWASP ZAP Scan Target Is Backend Only

**File:** `.github/workflows/ci.yml` line 198

```yaml
-quickurl http://localhost:3000 \
```

The ZAP scan crawls `http://localhost:3000` (the backend health endpoint). It never reaches the frontend or the nginx layer. The scan misses entire classes of vulnerabilities that manifest at the HTTP layer: cookie misconfigurations, missing CSRF protections on forms, frontend XSS, etc.

**Impact:** Incomplete security coverage; critical web vulnerabilities go undetected.

**Fix:** Crawl the frontend URL through nginx, or run the full docker-compose stack:

```yaml
# Scan through nginx (requires the full stack running)
-quickurl https://localhost \
# or scan the frontend directly (if frontend serves its own security headers):
-quickurl http://localhost:5173 \
```

---

### HIGH-4: Duplicate Setup Across Jobs

**File:** `.github/workflows/ci.yml` — `test-e2e`, `security-headers`, `security-scan`

Each of these three jobs independently runs:
1. `pnpm install --frozen-lockfile`
2. `pnpm build`
3. Backend startup

This triplication makes the pipeline ~3x slower than needed for these jobs. The `lint`, `typecheck`, and `test` jobs run first and already validate the same code — the duplicate install+build is purely wasted time.

**Fix:** Use a pre-built artifact from the `build` job:

```yaml
test-e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  needs: [build]
  steps:
    - name: Checkout code
      uses: actions/checkout@v4

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

    - name: Install Playwright browsers
      run: pnpm exec playwright install --with-deps chromium

    - name: Download build artifacts
      uses: actions/download-artifact@v4
      with:
        name: build-artifacts

    - name: Start backend
      run: |
        cd packages/backend
        pnpm start &
      env:
        NODE_ENV: test

    - name: Run E2E tests
      run: pnpm exec playwright test
```

Note: For `security-headers` and `security-scan`, also download artifacts and skip `pnpm build`.

---

### HIGH-5: ZAP Timeout Too Short

**File:** `.github/workflows/ci.yml` line 200

```yaml
-timeout 10 \
```

10 seconds is insufficient for a ZAP spider crawl + passive scan, especially on a cold Docker container image pull. The scan will timeout before completing, resulting in no report being generated.

**Fix:** Increase to at least 120 seconds:

```yaml
-timeout 120 \
```

---

### MEDIUM-1: No Artifact Retention Policy

**File:** `.github/workflows/ci.yml` — `build` job

There is no explicit `retention-days` on build artifacts. GitHub defaults vary; explicitly setting it prevents storage bloat.

---

### MEDIUM-2: Backend Process Not Cleaned Up

**File:** `.github/workflows/ci.yml` — all jobs that use `pnpm dev &`

Background processes started with `&` are not explicitly killed at the end of the job. While GitHub Actions kills the runner after the job, long-running Playwright tests or ZAP scans may leave orphaned `pnpm dev` processes.

**Fix:** Use a cleanup trap:

```yaml
- name: Start backend
  run: |
    cd packages/backend
    pnpm dev &
    echo $! > /tmp/backend.pid
  env:
    NODE_ENV: test

- name: Run E2E tests
  run: pnpm exec playwright test

- name: Cleanup
  if: always()
  run: |
    if [ -f /tmp/backend.pid ]; then
      kill $(cat /tmp/backend.pid) 2>/dev/null || true
    fi
```

---

### MEDIUM-3: Docker-in-Docker Without Network Flag

**File:** `.github/workflows/ci.yml` lines 196–202

```yaml
docker run -v $(pwd):/zap/wrk:rw \
  -t owasp/zap2docker-stable zap.sh \
  -cmd -quickurl http://localhost:3000 \
```

The Docker container runs without `--network="host"`. If the runner's network namespace doesn't expose `localhost:3000` into the container (which depends on the Docker version and configuration), the ZAP scan will fail to reach the backend.

**Fix:** Add `--network="host"` on Linux (GitHub Actions ubuntu runners use Linux):

```yaml
docker run --rm \
  --network="host" \
  -v "$(pwd):/zap/wrk:rw" \
  owasp/zap2docker-stable zap.sh \
  -cmd -quickurl http://localhost:3000 \
  -quickprogress \
  -timeout 120 \
  -reportfile zap-report.html \
  -jsonreport zap-report.json
```

---

### MEDIUM-4: `CORS_ORIGIN=https://localhost` in Production docker-compose

**File:** `docker-compose.yml` line 15

```yaml
- CORS_ORIGIN=https://localhost
```

The development `docker-compose.yml` has `https://localhost` hardcoded as the CORS origin. This will break when accessed from any other host. The production file (`docker-compose.production.yml`) omits this entirely. While this is a docker-compose issue rather than a CI issue, it means the locally-built Docker image has wrong CORS configuration baked in.

---

### LOW-1: NGINX CSP Contains `unsafe-inline` and `unsafe-eval`

**File:** `nginx.conf` line 76, `nginx-frontend.conf` line 32

```nginx
add_header Content-Security-Policy "... script-src 'self' 'unsafe-inline' 'unsafe-eval' ..." always;
```

`'unsafe-inline'` allows inline `<script>` tags and `style-src 'unsafe-inline'` allows inline styles. `'unsafe-eval'` allows `eval()` and similar. These significantly weaken XSS protection. However, React and some build tools legitimately require `unsafe-eval` in development. For production, this should be tightened.

**Fix:** Remove `unsafe-eval` from production nginx.conf. Use nonces or hashes for any legitimately needed inline scripts. The `unsafe-inline` for scripts is particularly dangerous — consider migrating to `'nonce-{base64}'` with a rotating nonce value.

---

## 3. Recommended Priority Order

| Priority | Issue | Effort |
|----------|-------|--------|
| CRITICAL-1 | Remove `\|\| true` from ZAP scan | Low |
| CRITICAL-2 | Replace `sleep 5` with health-check loop | Medium |
| CRITICAL-3 | Add artifact publishing to `build` job | Medium |
| CRITICAL-4 | Fix Playwright webServer / missing frontend startup | Medium |
| HIGH-1 | Limit Playwright to chromium in CI | Low |
| HIGH-2 | Test security headers against nginx/production URL | Medium |
| HIGH-3 | Scan frontend URL with OWASP ZAP | Medium |
| HIGH-4 | Use build artifacts in downstream jobs | Medium |
| HIGH-5 | Increase ZAP timeout to 120s | Low |
| MEDIUM-1 | Add artifact retention policy | Low |
| MEDIUM-2 | Add process cleanup trap | Low |
| MEDIUM-3 | Add `--network="host"` to ZAP Docker command | Low |
| LOW-1 | Tighten CSP in nginx.conf | High |

---

## 4. Out of Scope (Not Reviewed)

- Backend application code logic
- Frontend React component implementation
- Dockerfile security (build hardening, multi-stage best practices)
- pnpm workspace configuration
- Actual deployment automation (Ansible, Terraform, k8s, etc.)
- Staging/production environment parity
- Notification integrations (Slack, etc.)
