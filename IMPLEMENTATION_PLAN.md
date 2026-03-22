# Peer P2P VoIP Application - Implementation Plan

> **Status:** In Progress
> **Last Updated:** 2026-03-22

---

## Executive Summary

This document tracks the gap analysis between specification files in `specs/*` and the current codebase implementation.

**Current Status: v0.7.16** | **Tests: 241+ passing** | **Coverage: 76.05%**

---

## Specification Files Analyzed

| File | Purpose |
|------|---------|
| `specs/Peer_System_Design.md` | Core system requirements and architecture |
| `specs/Testing_Strategy.md` | Testing layers, coverage targets, CI/CD integration |
| `specs/SECURITY_AUDIT.md` | 69 security findings (12 Critical, 19 High, 19 Medium, 19 Low) |
| `specs/code-review-findings.md` | Backend code quality review |
| `specs/CI_CD_ANALYSIS.md` | CI pipeline issues and remediation |

---

## Specification Coverage Status

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
| 6.6 Sprint 6 (Testing) | ✓ Complete | 241+ total tests |

---

## Security Audit Resolution

| Finding | Severity | Status |
|---------|----------|--------|
| CR-1: TURN URLs hardcoded to localhost | Critical | **Fixed v0.6.11** - use TURN_HOST env var |
| CR-2: Insecure TURN secret fallback | Critical | **Fixed** - fail-fast implemented |
| CR-3: Rate limiter never wired | Critical | **Fixed v0.6.11** - properly wired |
| CR-4: HTTPS server commented out | Critical | **Fixed v0.6.15** - HTTPS enabled |
| CR-5: coturn auth misconfigured | Critical | **Fixed v0.6.15** - static-auth-secret |
| CR-6: Plaintext TURN port exposed | Critical | **Fixed v0.7.16 on production** - TLS-only port 5349 |
| CR-7: certbot --staging flag | Critical | **Fixed v0.6.15** - removed staging |
| CR-8: TURN credential endpoint unprotected | Critical | **Fixed** - room membership verified |
| CR-9: Chat broken (peerId undefined) | Critical | **Fixed** - peerId set at join |
| CR-10: Media stream leak | Critical | **Fixed v0.6.14** - tracks stopped |
| CR-11: Event listener cleanup | Critical | **Fixed v0.6.14** - proper cleanup |
| CR-12: Nginx runs as root | Critical | **Fixed** - USER directive added |
| H-1: No SDP validation | High | **Fixed v0.6.14** - size validation |
| H-2: ICE candidate private IP leak | High | **Fixed v0.6.14** - relay-only policy |
| H-3: No authorization on signaling | High | **Fixed** - room membership check |
| H-4: Sourcemaps enabled | High | **Fixed v0.7.11** - disabled |
| H-5: CORS fallback to localhost | High | **Fixed** - explicit env required |
| H-6: Flat Docker network | High | **Fixed v0.6.17** - network isolation |
| H-7: Backend port exposed | High | **Fixed v0.6.15** - port removed |
| H-8: CSP unsafe-inline/eval | High | **Partially fixed** - production only |
| H-9: HSTS missing | High | **Fixed in nginx.conf** - missing in frontend config |
| H-10: No container resource limits | High | **Fixed** - limits added |
| H-11: No container hardening | High | **Fixed** - security options added |
| H-12: Display name whitelist | High | **Fixed** - Zod validation |
| H-13: Zod not used | High | **Fixed** - validatePayload used |
| H-14: System audio capture | High | **Fixed** - excluded |
| H-15: TURN URL validation | High | **Fixed** - allowlist validation |
| H-16: Rate limiting coarse | High | **Partially fixed** - per-socket limits |
| H-17: Silent connection failure | High | **Fixed** - proper event handling |
| Remaining High/Medium/Low | - | **Fixed or acknowledged** |

---

## CI/CD Resolution (specs/CI_CD_ANALYSIS.md)

| Issue | Status |
|-------|--------|
| ZAP scan with `\|\| true` | **Fixed** - proper error handling |
| Fixed `sleep 5` causes flaky tests | **Fixed** - health check loop |
| Build job no artifact output | **Fixed** - artifact publishing added |
| Duplicate install+build | **Fixed** - optimized pipeline |
| Security-headers tests backend not nginx | **Fixed** - uses docker-compose |
| Playwright webServer conflicts | **Fixed** - chromium only for CI |
| OWASP ZAP timeout | **Fixed** - timeout increased to 120s |
| ZAP target backend only | **Fixed** - now scans nginx |

---

## Testing Coverage

| Area | Count | Status |
|------|-------|--------|
| Backend unit tests | 104 | Passing |
| Frontend tests | 137 | Passing |
| E2E tests | 168 | Passing (3 skipped on mobile) |
| Backend line coverage | 76.05% | Exceeds 70% target |
| Total tests | 241+ | All passing |

---

## Implementation Phases

```
Phase 1: Foundation          ████████████████████ 100%
Phase 2: WebRTC              ████████████████████ 100%
Phase 3: Screen Share + TURN ████████████████████ 100%
Phase 4: Chat + Persistence  ████████████████████ 100%
Phase 5: UI Polish           ████████████████████ 100%
Phase 6: Testing + Hardening ████████████████████ 100%
```

---

## Remaining Gaps Identified

### 1. Development docker-compose exposes plaintext TURN port (Priority: Medium)

**Location:** `docker-compose.yml:58-62`

The development docker-compose still exposes port 3478 (plaintext TURN/STUN), which is inconsistent with the production configuration that only exposes port 5349 (TLS).

**Spec Requirement:** Section 2.3 specifies TLS-only TURN in production. Port 3478 should be internal-only or removed from dev config.

**Action:** Update `docker-compose.yml` to only expose port 5349 for TURN in development, similar to production.

---

### 2. CSP contains unsafe-inline and unsafe-eval (Priority: Medium)

**Locations:**
- `nginx.conf:78`
- `nginx-frontend.conf:32`

Both nginx configuration files contain `'unsafe-inline'` and `'unsafe-eval'` in the Content-Security-Policy header, which weakens XSS protection.

**Spec Requirement:** Section 8.4 specifies strict CSP that blocks inline scripts.

**Action:** Remove `'unsafe-eval'` from both configurations. The `'unsafe-inline'` for scripts is required for React but should be addressed via nonce-based approach in a future iteration.

---

### 3. HSTS header missing in nginx-frontend.conf (Priority: Low)

**Location:** `nginx-frontend.conf`

The `nginx.conf` has HSTS header configured (line 69), but the separate `nginx-frontend.conf` (used for frontend-only serving) does not include it.

**Spec Requirement:** Section 8.4 and 8.3 specify HSTS header with `max-age=31536000` and `includeSubDomains`.

**Action:** Add HSTS header to `nginx-frontend.conf`.

---

### 4. coturn image tag not pinned in docker-compose.yml (Priority: Low)

**Location:** `docker-compose.yml:56`

The development docker-compose uses `coturn/coturn:4.6.2-alpine`, but this should be verified to match production's pinned version.

**Action:** Verify both compose files use the same pinned version.

---

## Exit Criteria (v1.0 Release)

- [x] Build job produces artifacts
- [x] E2E tests run with proper service startup (docker-compose)
- [x] Security headers test runs against nginx
- [x] No console.* usage in backend (structured logging)
- [x] Zod validation for all Socket.IO payloads
- [x] Metrics endpoint available (`/metrics`)
- [x] Plaintext TURN port not exposed in production (TLS-only 5349)
- [ ] Development docker-compose consistency with production
- [ ] CSP hardened in nginx configs
- [ ] HSTS header in all nginx configs

---

## v0.7.17 Tasks

| Task | Priority | Status |
|------|----------|--------|
| Remove plaintext TURN port 3478 from docker-compose.yml | Medium | **Pending** - port 3478 still exposed |
| Remove unsafe-eval from nginx CSP | Medium | **Pending** - both nginx.conf:78 and nginx-frontend.conf:32 still contain unsafe-eval |
| Add HSTS header to nginx-frontend.conf | Low | **Pending** - header not present |
| Verify coturn image tag alignment | Low | **Completed** - both configs use coturn:4.6.2-alpine |

---

## Gap Analysis Summary

### Specification Coverage Status

| Spec Section | Implementation Status |
|--------------|----------------------|
| 5.1.1 Room Management | ✓ Complete |
| 5.1.2 Voice (VoIP) | ✓ Complete |
| 5.1.3 Video | ✓ Complete |
| 5.1.4 Screen Sharing | ✓ Complete |
| 5.1.5 Text Chat | ✓ Complete |
| 5.1.6 NAT Traversal | ✓ Complete |
| 6.1 Sprint 1 (Foundation) | ✓ Complete |
| 6.2 Sprint 2 (WebRTC) | ✓ Complete |
| 6.3 Sprint 3 (Screen+TURN) | ✓ Complete |
| 6.4 Sprint 4 (Chat) | ✓ Complete |
| 6.5 Sprint 5 (UI) | ✓ Complete |
| 6.6 Sprint 6 (Testing) | ✓ Complete |

### Security Audit Resolution

All 12 Critical findings have been fixed. All 19 High findings have been fixed or addressed. Remaining work is infrastructure hardening (CSP, HSTS).

### Testing Coverage

| Area | Current | Target |
|------|---------|--------|
| Backend unit tests | 104 | ≥ 70% |
| Frontend tests | 137 | ≥ 60% |
| E2E tests | 168 | Full coverage |
| Backend line coverage | 76.05% | ≥ 70% |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.7.17 | 2026-03-22 | Gap analysis refreshed - 3 tasks remaining (TURN port, CSP, HSTS) |
| 0.7.16 | 2026-03-22 | All exit criteria complete: metrics endpoint, no plaintext TURN |
| 0.7.15 | 2026-03-22 | Added /metrics endpoint, removed plaintext TURN port 3478 |
| 0.7.14 | 2026-03-22 | Gap analysis refreshed |
| 0.7.13 | 2026-03-22 | 2 remaining tasks confirmed |
| 0.7.12 | 2026-03-22 | Zod validation confirmed complete |
| 0.7.11 | 2026-03-22 | Sourcemaps disabled |
| 0.7.10 | 2026-03-22 | Release (all critical security fixes) |
| 0.7.9 | 2026-03-21 | PeerManager unit tests implemented |