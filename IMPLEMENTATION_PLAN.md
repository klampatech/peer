# Implementation Plan

This document maps security audit findings and feature requirements to actionable tasks.

---

## Priority 0: Deploy Blockers (Critical Security - Must Fix Before Production)

### P0-1: Add Non-Root User to Frontend Dockerfile
- **File**: `packages/frontend/Dockerfile`
- **Issue**: CR-12 - nginx runs as root in container
- **Fix**: Add USER directive before CMD
- **Effort**: 2 lines

### P0-2: Configure ICE Transport Policy to 'relay'
- **File**: `packages/frontend/src/lib/webrtc/peer-manager.ts:99`
- **Issue**: H-2 - Private IP leakage via ICE candidates
- **Fix**: Change `iceTransportPolicy: 'all'` to `iceTransportPolicy: 'relay'`
- **Effort**: 1 line

### P0-3: Disable Sourcemaps in Production Build
- **File**: Check `packages/frontend/vite.config.ts`
- **Issue**: H-4 - Sourcemaps expose source code
- **Fix**: Ensure `build.sourcemap: false` for production
- **Effort**: Verify config

### P0-4: Fix TURN Host Environment Validation
- **File**: `packages/backend/src/services/turn-credentials.ts:39`
- **Issue**: TURN_HOST defaults to localhost even in production
- **Fix**: Fail at startup if TURN_HOST not set in production mode
- **Effort**: 5 lines

### P0-5: Hardened TLS Ciphers in Coturn
- **File**: `turnserver.conf:12`
- **Issue**: HI-2 - Weak cipher list
- **Fix**: Use TLS 1.3-only ciphers
- **Effort**: 1 line

---

## Priority 1: Critical Path Features & Security

### P1-1: Implement Display Name Character Allowlist
- **File**: `packages/backend/src/events/room-events.ts`
- **Issue**: H-12 - ANSI escape codes, RTL/LTR overrides
- **Fix**: Enforce alphanumeric + common punctuation via Zod schema
- **Effort**: 10 lines + schema update

### P1-2: Add Room Membership Verification to TURN Request
- **File**: `packages/backend/src/events/turn-events.ts`
- **Issue**: CR-8 - TURN credential endpoint unprotected
- **Fix**: Verify socket is in room before generating credentials
- **Effort**: 15 lines

### P1-3: Fix Media Stream Cleanup on Screen Share Stop
- **File**: `packages/frontend/src/lib/webrtc/use-webrtc.ts`
- **Issue**: CR-10 - Camera continues broadcasting after screen share stops
- **Fix**: Explicitly stop camera tracks when switching from screen share
- **Effort**: 10 lines

### P1-4: Fix Event Listener Cleanup
- **File**: `packages/frontend/src/lib/webrtc/peer-manager.ts`
- **Issue**: CR-11 - `.bind(this)` creates new function refs
- **Fix**: Store bound function references for proper cleanup
- **Effort**: 20 lines

### P1-5: Fix System Audio Exclusion in Screen Share
- **File**: `packages/frontend/src/lib/webrtc/use-webrtc.ts`
- **Issue**: H-14 - System audio capture permitted
- **Fix**: Add `{ systemAudio: 'exclude' }` to display media constraints
- **Effort**: 2 lines

---

## Priority 2: Infrastructure Hardening

### P2-1: Add HTTPS Server Block to nginx.conf
- **File**: `nginx.conf`
- **Issue**: CR-4 - No HTTPS server block (HSTS header served over HTTP)
- **Fix**: Uncomment/add HTTPS server block with TLS certificates
- **Effort**: 20 lines

### P2-2: Remove unsafe-inline/unsafe-eval from CSP
- **File**: `nginx-frontend.conf`
- **Issue**: H-8, M-1 - XSS via inline scripts/styles
- **Fix**: Use nonces or hashes, remove unsafe directives
- **Effort**: 5 lines

### P2-3: Add no-new-privileges to All Containers
- **File**: `docker-compose.production.yml`
- **Issue**: ME-1 - Only coturn has this setting
- **Fix**: Add security_opt to nginx, backend, frontend, certbot
- **Effort**: 8 lines

### P2-4: Add Resource Limits to nginx and certbot
- **File**: `docker-compose.production.yml`
- **Issue**: ME-2 - Missing CPU/memory limits
- **Effort**: Already present in current file (verified)

### P2-5: Add Health Checks to nginx and certbot
- **File**: `docker-compose.production.yml`
- **Issue**: ME-3 - Missing healthchecks
- **Effort**: 10 lines

---

## Priority 3: Production Deployment Security

### P3-1: Remove Hardcoded Production IP
- **Files**: `deploy.sh`, `docker-compose.production.yml`
- **Issue**: CR-1 - Production IP `204.168.181.142` exposed
- **Fix**: Use environment variables for all sensitive values
- **Effort**: 15 lines

### P3-2: Switch to SSH Key Authentication
- **Files**: `deploy.sh`, CI configuration
- **Issue**: CR-2, CR-4 - Root login + plaintext password
- **Fix**: Use SSH keys, create deploy user
- **Effort**: 20 lines

### P3-3: Enable StrictHostKeyChecking
- **File**: `deploy.sh`
- **Issue**: CR-3 - MITM vulnerable
- **Fix**: Remove StrictHostKeyChecking=no, use ssh-keyscan
- **Effort**: 10 lines

### P3-4: Validate CERTBOT_EMAIL Required
- **File**: `docker-compose.production.yml:130`
- **Issue**: HI-3 - Default email fallback
- **Fix**: Make email required without default
- **Effort**: 2 lines

### P3-5: Fix Coturn Container User Directive
- **File**: `docker-compose.production.yml:62`
- **Issue**: HI-5 - Just UID, not proper USER
- **Fix**: Use proper USER directive or create user in Dockerfile
- **Effort**: 5 lines

---

## Priority 4: Testing & Validation

### P4-1: Enable OWASP ZAP in CI
- **File**: `.github/workflows/ci.yml`
- **Issue**: CI-1 - Security scan disabled
- **Fix**: Re-enable when Docker issues resolved
- **Effort**: 5 lines

### P4-2: Add Dependency Security Scanning
- **File**: `.github/workflows/ci.yml`
- **Issue**: CI-2 - No npm audit/snyk/trivy
- **Effort**: 10 lines

### P4-3: Add Post-Deploy Health Check
- **File**: `deploy.sh` or CI workflow
- **Issue**: LO-2 - No verification after deploy
- **Effort**: 5 lines

---

## Already Fixed (From Code Review)

| Issue | Status | Evidence |
|-------|--------|----------|
| CR-3: Socket.IO rate limiter not wired | ✅ Fixed | `server.ts:48` - `setupSocketRateLimiter(io)` is called |
| CR-9: Chat broken (peerId not set) | ✅ Fixed | `room-events.ts:76,129` - `socket.data.peerId = socket.id` |
| CR-2: Insecure TURN secret fallback | ✅ Fixed | `turn-credentials.ts:3-6` - throws if not set |
| CR-7: Certbot staging in prod | ✅ Fixed | `docker-compose.production.yml:130` - no --staging flag |
| CR-6: Plaintext TURN on 3478 | ✅ Fixed | Production only exposes 5349 (TLS) |
| CR-5: coturn auth misconfigured | ✅ Fixed | `turnserver.conf:23` - `static-auth-secret=${TURN_SECRET}` |
| Signaling authorization | ✅ Fixed | `room-events.ts:210-228` - room membership verified |

---

## Dependencies

```
P0-1 (Frontend Dockerfile) ──┐
                              ├─> P2-3 (Docker hardening)
P0-2 (ICE policy) ────────────┤
                              │
P0-3 (Sourcemaps) ────────────┤
                              ├─> P3-5 (Container security)
P0-4 (TURN host) ─────────────┘

P1-2 (TURN auth) ──> P1-1 (Display name validation)

P3-1 (Remove IP) ──> P3-2 (SSH keys)
                       P3-3 (StrictHostKeyChecking)
```

---

## Notes

- Some P0 issues are already fixed (see "Already Fixed" table)
- Frontend Dockerfile needs updating - the main `Dockerfile.frontend` just wraps `packages/frontend/Dockerfile`
- The production IP `204.168.181.142` should be replaced with `${PRODUCTION_DOMAIN}` or similar env var
- Consider using a domain name instead of IP to avoid rebuilds when IP changes
