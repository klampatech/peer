# Security Standards Reference — Peer P2P VoIP Web Application

**Document Version:** 1.0
**Date:** 2026-03-22
**Purpose:** Comprehensive industry security standards and best practices for a WebRTC P2P VoIP application
**Sources:** OWASP, NIST, CIS, W3C, IETF, WebRTCspec

---

## Table of Contents

1. [OWASP Top 10 2025](#1-owasp-top-10-2025)
2. [Transport Layer Security (TLS)](#2-transport-layer-security-tls)
3. [WebRTC Security](#3-webrtc-security)
4. [WebSocket / Socket.IO Security](#4-websocket-socketio-security)
5. [HTTP Security Headers](#5-http-security-headers)
6. [Container Security (Docker)](#6-container-security-docker)
7. [Input Validation & Injection Prevention](#7-input-validation--injection-prevention)
8. [Authentication & Session Management](#8-authentication--session-management)
9. [API Security](#9-api-security)
10. [Logging & Monitoring](#10-logging--monitoring)
11. [Compliance Frameworks](#11-compliance-frameworks)
12. [References](#12-references)

---

## 1. OWASP Top 10 2025

The [OWASP Top 10 2025](https://owasp.org/Top10/2025/en/) is the authoritative list of most critical web application security risks.

### A01 — Broken Access Control

Access control enforces policy so that users cannot act outside their intended permissions.

**Requirements:**
- Deny by default
- Implement access control mechanisms once and reuse throughout the application
- Model access controls enforcing record ownership rather than accepting user input to specify records
- Disable directory listing and protect against file inclusion attacks
- Log access control failures and alert administrators
- Rate-limit API and controller access to minimize automated attack harm
- Stateful session identifiers should be invalidated on the server after logout

**Peer Project Status:** Room tokens use UUID v4 (122 bits entropy). Room membership verification is needed on signaling events (see SECURITY_AUDIT.md CR-8, H-3).

### A02 — Cryptographic Failures

Failures related to cryptography which often lead to sensitive data exposure.

**Requirements:**
- Classify data processed, stored, or transmitted and apply controls accordingly
- Encrypt all sensitive data at rest and in transit
- Use TLS 1.2+ with modern cipher suites; prefer TLS 1.3
- Disable caching for responses containing sensitive data
- Apply strong adaptive hashing for passwords (bcrypt, scrypt, Argon2)
- Verify effective configuration and usage of cryptography

**Peer Project Status:** DTLS-SRTP is mandated by browsers for WebRTC media. HTTPS is required. TURN TLS on port 5349 is specified. The project must not fall back to plaintext.

### A03 — Injection

User-supplied data is not validated, filtered, or sanitized by the application.

**Requirements:**
- Use parameterized queries for SQLite (already done via better-sqlite3)
- Use server-side input validation (Zod schemas — currently installed but unused per H-13)
- Escape special characters for any residual dynamic SQL queries
- Use LIMIT and other SQL controls to prevent mass disclosure in case of injection

**Peer Project Status:** Parameterized SQLite queries are used. Zod is installed but not wired to Socket.IO event handlers. CRITICAL to enable.

### A04 — Insecure Design

Missing or ineffective controls in the design and architecture of the application.

**Requirements:**
- Establish secure development lifecycle with threat modeling for each tier
- Integrate security requirements into the application design
- Use defense-in-depth layering (CVE-2021-44228 — Log4Shell — would have been prevented with layered controls)
- Segregate tenant resources by design

**Peer Project Status:** WebRTC mesh architecture is sound. Signaling server authorization gaps (H-3) and missing Zod validation are the main insecure design issues.

### A05 — Security Misconfiguration

Security misconfiguration is the most commonly seen issue.

**Requirements:**
- Repeatable hardening process for fast, secure deployment
- Minimal platform without unnecessary features, components, or documentation
- Review and update configurations as part of patch management
- Architectural review for security of all environments (dev, staging, production)
- Automated verification of configurations in all environments

**Peer Project Status:** Multiple critical misconfigurations exist (see SECURITY_AUDIT.md CR-1 through CR-12). HTTPS server block commented out (CR-4), CORS fallback to localhost (H-5), unsafe CSP directives (H-8), missing HSTS (H-9).

### A06 — Vulnerable and Outdated Components

Using components with known vulnerabilities undermines defenses.

**Requirements:**
- Remove unused dependencies and features
- Continuously inventory component versions (Dependabot, npm audit)
- Monitor for CVEs in all components (CVE databases, security advisories)
- Only obtain components from official sources over secure channels
- Pin images to specific digests, not `latest` tags

**Peer Project Status:** `coturn:latest` used in docker-compose.yml (CR-1) is a direct violation. All image tags must be pinned.

### A07 — Identification and Authentication Failures

Errors in confirming user identity, authentication, and session management.

**Requirements:**
- Implement multi-factor authentication to prevent automated attacks
- Do not deploy with default credentials
- Implement weak password checks against top 10000 worst passwords list
- Harden account recovery mechanisms
- Limit failed login attempts and delay responses
- Use server-side, secure session manager with session identifiers rotated at login

**Peer Project Status:** No accounts exist (invite-link only). Session identifiers are Socket.IO socket IDs. Rate limiting on join events is defined but not wired (CR-3).

### A08 — Software and Data Integrity Failures

Software updates, CI/CD pipelines, and dependency integrity are not validated.

**Requirements:**
- Verify software integrity via digital signatures
- Review code and configuration changes before deployment
- Ensure CI/CD pipeline has proper access controls and input validation
- Do not send unencrypted or unauthenticated data to untrusted destinations
- Ensure library and package dependencies use integrity checking (npm lockfiles)

**Peer Project Status:** GitHub Actions CI/CD pipeline is documented. Lockfiles must be committed and verified.

### A09 — Security Logging and Monitoring Failures

Insufficient logging and monitoring leads to breaches going undetected.

**Requirements:**
- Log all login, access control, and server-side validation failures
- Ensure logs are in a format easily consumable by log management solutions
- Monitor for active attacks via application and API abnormal behavior
- Establish effective alerting thresholds and escalation procedures
- Establish incident response and recovery plan

**Peer Project Status:** No structured logging specification in the codebase. Error stack traces may leak (L-9).

### A10 — Server-Side Request Forgery (SSRF)

Fetch remote resources without validating user-supplied URLs.

**Requirements:**
- Segment remote resource access functionality into separate networks
- Enforce "deny by default" firewall policies
- Sanitize and validate all client-supplied input data
- Disable HTTP redirections
- Do not deploy other security-reducing services on front-end systems

**Peer Project Status:** Not directly applicable to Peer v1 architecture (no user-supplied URL fetching to external resources).

---

## 2. Transport Layer Security (TLS)

### TLS 1.3 Requirements (2024-2026 Industry Standard)

TLS 1.3 is mandated by [NIST SP 800-52 Rev. 2](https://csrc.nist.gov/pubs/sp/800/52/r2/final) and recommended by BSI (Germany) and most modern security frameworks.

**Mandatory Requirements:**
- TLS 1.3 shall be supported; TLS 1.2 may be permitted as fallback with restricted cipher suites
- TLS 1.0 and TLS 1.1 must be disabled
- SSL 2.0 and SSL 3.0 must be disabled
- RSA key exchange must be disabled (use ECDHE or DHE)
- All cipher suites must provide forward secrecy (PFS)
- AES-128-GCM or AES-256-GCM for symmetric encryption
- ChaCha20-Poly1305 as alternative for environments without AES hardware

**TLS 1.3 Cipher Suites:**
```
TLS_AES_128_GCM_SHA256
TLS_AES_256_GCM_SHA384
TLS_CHACHA20_POLY1305_SHA256
```

**TLS 1.2 Fallback Cipher Suites (if needed):**
```
ECDHE-RSA-AES128-GCM-SHA256
ECDHE-RSA-AES256-GCM-SHA384
ECDHE-RSA-CHACHA20-POLY1305
```

**Peer Project Requirements:**
- Nginx must be configured with TLS 1.3 minimum
- `ssl_protocols TLSv1.2 TLSv1.3;` (drop 1.2 in production if compliance allows)
- `ssl_ciphers` must exclude known-weak ciphers
- HSTS header required: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Let's Encrypt certificates must be auto-renewed (remove `--staging` flag in production — see CR-7)

### Certificate Requirements

- Certificates must be valid and not expired
- Use Let's Encrypt for automatic renewal
- Monitor certificate expiration
- Consider Certificate Transparency (CT) logs for monitoring
- OCSP stapling should be enabled

---

## 3. WebRTC Security

### Built-in WebRTC Security

WebRTC has mandatory encryption for all media streams:

| Layer | Protocol | Purpose |
|---|---|---|
| Media | SRTP (Secure RTP) | Encrypts audio/video streams |
| Key Exchange | DTLS (Datagram TLS) | Negotiates SRTP keys peer-to-peer |
| Transport | ICE + TURN | NAT traversal with encrypted relay |
| Signaling | TLS (via WebSocket) | Secures SDP offer/answer exchange |

### WebRTC Security Best Practices (2025)

**From [webrtc-security.github.io](https://webrtc-security.github.io/) and [WebRTC Ventures 2025](https://webrtc.ventures/2025/07/webrtc-security-in-2025-protocols-vulnerabilities-and-best-practices/):**

1. **DTLS-SRTP is mandatory** — Browsers enforce this. Media cannot be sent unencrypted.
2. **Signaling channel must be TLS-protected** — WebSocket connections must use `wss://` not `ws://`
3. **ICE candidate filtering** — Strip private IP candidates before exchange to prevent IP leakage
4. **TURN relay authentication** — Use short-term credentials (RFC 8489) with HMAC
5. **End-to-End Encryption (E2EE)** — For highest privacy, layer Insertable Streams API on top of DTLS-SRTP
6. **SDP validation** — Validate SDP structure before relay; reject oversized or malformed SDP
7. **ICE candidate format validation** — Reject private IP ranges in ICE candidates
8. **No force-relay policy by default** — Only relay traffic when necessary (symmetric NAT)

### Peer Project WebRTC Security Requirements

**Critical Gaps (from SECURITY_AUDIT.md):**
- TURN URLs hardcoded as `localhost` (CR-1) — must use environment variable `COTURN_HOST`
- TURN secret has insecure fallback (CR-2) — must fail at startup if unset
- ICE candidate private IP leakage (H-2) — set `iceTransportPolicy: 'relay'` or implement filtering
- SDP not validated (H-1) — add Zod schema validation before relay
- Signaling has no room membership check (H-3) — verify sender is in same room before relay
- Media stream cleanup missing (CR-10) — explicitly stop tracks when screen share ends
- TURN credential endpoint unprotected (CR-8) — verify room membership before issuing credentials
- TURN URL validation missing (H-15) — validate TURN server URLs against allowlist

---

## 4. WebSocket / Socket.IO Security

### WebSocket Security Principles

**From [websocket.org security guide](https://websocket.org/guides/security/) and [BrightSec](https://brightsec.com/blog/websocket-security-top-vulnerabilities/):**

1. **Use WSS (WebSocket Secure)** — All WebSocket connections must be TLS-encrypted
2. **Authentication on connection** — Authenticate before upgrading to WebSocket
3. **Input validation** — Validate all incoming messages server-side
4. **Rate limiting** — Implement per-connection, per-IP, and per-message-type limits
5. **Origin validation** — Verify Origin header against allowlist
6. **Message size limits** — Cap maximum message size to prevent DoS
7. **Connection timeout** — Close idle connections after configurable timeout
8. **No sensitive data in URL** — WebSocket URLs are logged; don't put tokens in them

### Socket.IO-Specific Security

**From [Socket.IO authentication guidance](https://medium.com/@rwillt/authenticating-socket-io-clients-f1e6f39a25fe):**

- Socket.IO provides no built-in authentication — must be implemented explicitly
- Authenticate during handshake, before socket joins rooms
- Use middleware for authentication checks
- Never trust `socket.request.headers`

**Peer Project Requirements:**
- `setupSocketRateLimiter()` defined but never called (CR-3) — must wire this up
- Rate limiting is per-IP only, trivially bypassed with multiple IPs (H-16) — implement per-socket limits
- No origin validation currently visible in `security.ts`
- In-memory rate limit state doesn't scale horizontally (M-2) — Redis-backed rate limiting recommended

---

## 5. HTTP Security Headers

### Required Security Headers (2024-2025)

| Header | Value | Purpose |
|---|---|---|
| Content-Security-Policy | Strict; no `unsafe-inline`/`unsafe-eval` | Prevents XSS and injection |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Enforces HTTPS; prevents downgrade |
| X-Frame-Options | `DENY` (or `SAMEORIGIN` if needed) | Prevents clickjacking |
| X-Content-Type-Options | `nosniff` | Prevents MIME sniffing |
| Referrer-Policy | `strict-origin-when-cross-origin` | Controls referrer leakage |
| Permissions-Policy | `camera=(), microphone=(), display-capture=()` | Disables unused browser features |
| Cross-Origin-Embedder-Policy | `require-corp` | Prevents cross-origin data leaks |
| Cross-Origin-Opener-Policy | `same-origin` | Isolates browsing context |

### Content-Security-Policy (CSP) Best Practices

**Never use:**
- `unsafe-inline` — defeats XSS protection
- `unsafe-eval` — allows eval()-based attacks
- `*` wildcards for script-src, style-src, img-src

**Use instead:**
- Nonce-based inline scripts: `script-src 'self' 'nonce-{random}'`
- Hash-based inline scripts: `script-src 'self' 'sha256-{hash}'`
- Strict-dynamic for dynamically loaded scripts

**Recommended CSP for React + Vite application:**
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline'; # Vite injects styles; hash or nonce preferred
img-src 'self' data: https:;
connect-src 'self' wss: https:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

### Peer Project Status

- CSP contains `unsafe-inline` and `unsafe-eval` (H-8) — HIGH PRIORITY fix
- HSTS header missing (H-9)
- `X-Content-Type-Options` missing (M-12)
- `Referrer-Policy` missing (L-4)
- `Permissions-Policy` missing (L-5)

---

## 6. Container Security (Docker)

### CIS Docker Benchmark v1.7 (2024)

The [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker) provides prescriptive guidance for secure Docker deployments.

### Critical Docker Security Controls

**1. Container Images:**
- Use specific version tags, not `latest`
- Use minimal base images (Alpine, distroless)
- Verify image integrity with digests
- Scan images for vulnerabilities regularly
- Do not run as root inside container

**2. Container Runtime:**
```yaml
# Required security options
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
read_only: true
```

**3. Network Isolation:**
- Use Docker networks to isolate services
- Minimum: frontend network, backend network, coturn network
- Nginx should NOT be able to reach coturn directly
- Backend should NOT expose ports to host (remove `ports: ["3000:3000"]`)

**4. Resource Limits:**
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

**5. User Permissions:**
- Never run containers as root
- Create dedicated users in Dockerfile: `RUN addgroup -S app && adduser -S app -G app`
- Switch to non-root user: `USER app`

**Peer Project Status:**
- `coturn:latest` used instead of pinned version (CR-1, M-6)
- Nginx runs as root in frontend container (CR-12) — `USER nginx` required
- No container resource limits (H-10)
- No container hardening (H-11)
- Single flat Docker network — no service isolation (H-6)
- Backend port 3000 exposed to host (H-7)
- File permissions on mounted volumes not set (M-7)

### Docker Bench Security Recommendations

Docker Bench Security (docker-bench-security) validates against CIS benchmarks. Run it in CI:
```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  --network host \
  aquasec/docker-bench-security:latest
```

---

## 7. Input Validation & Injection Prevention

### Input Validation Strategy

**Defense in Depth — Validate at Every Layer:**

1. **Client-side validation** — Good UX, not security. Can be bypassed.
2. **Server-side validation** — Required. Single source of truth.
3. **Database parameterization** — Prevents SQL injection.

### Zod Schema Validation (Required for Peer)

The project has Zod installed but unused. All Socket.IO event payloads MUST be validated:

```typescript
import { z } from 'zod';

// Room events
const JoinRoomSchema = z.object({
  roomToken: z.string().uuid(),
  displayName: z.string().max(50).regex(/^[a-zA-Z0-9\s.,!?'-]+$/),
});

const SdpOfferSchema = z.object({
  targetPeerId: z.string(),
  sdp: z.string().max(10240), // 10KB max SDP
  type: z.literal('offer'),
});

const IceCandidateSchema = z.object({
  targetPeerId: z.string(),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().nullable(),
  }),
});

const ChatMessageSchema = z.object({
  roomToken: z.string().uuid(),
  message: z.string().max(2000),
});
```

**All Socket.IO handlers must:**
1. Validate payload schema with Zod
2. Return 400/appropriate error for invalid payloads
3. Log validation failures for monitoring
4. Never process invalid data further

### HTML Sanitization

- Use DOMPurify for rendering HTML content from chat messages
- Never use `innerHTML` with unsanitized user content
- Custom sanitizers are inadequate (L-1)

### Peer Project Status

- Zod installed but unused (H-13) — CRITICAL to wire up
- Display name has no character allowlist (H-12) — ANSI escape codes, RTL/LTR overrides possible
- Chat messages lack content-type validation (M-11)
- Room tokens validated with UUID regex server-side (good)

---

## 8. Authentication & Session Management

### Session Security

**For invite-link applications (no accounts):**

1. **Token as secret** — Room invite links contain UUID v4 tokens treated as passwords
2. **Session binding** — Display name bound to sessionStorage, not server-side
3. **Logout** — Socket disconnect invalidates session
4. **Session timeout** — Close idle sockets after configurable inactivity period
5. **Concurrent session limits** — Prevent same token being used from too many IPs simultaneously

### Rate Limiting

Rate limiting requirements for signaling servers:

| Endpoint/Event | Limit | Window | Purpose |
|---|---|---|---|
| Connection attempt | 10 | per IP / minute | Prevent connection flooding |
| Room join | 10 | per IP / minute | Prevent room flooding |
| Chat message | 30 | per socket / minute | Prevent spam |
| TURN credential request | 10 | per socket / minute | Prevent credential harvesting |
| SDP offer/answer | 60 | per socket / minute | Prevent DoS via signaling |

**Scaling Consideration:** In-memory rate limiting does not work horizontally. Redis-backed rate limiting (e.g., `rate-limiter-flexible` with Redis) is required before scaling beyond single-server deployment.

### Peer Project Status

- Rate limiter defined but not wired (CR-3) — 1-line fix, HIGH PRIORITY
- Rate limiting too coarse (H-16) — per-IP only, trivially bypassed
- In-memory state doesn't scale (M-2)
- No session timeout configuration visible

---

## 9. API Security

### REST API Security

The signaling server exposes REST endpoints. Security requirements:

1. **Authentication** — All REST endpoints except `/health` require valid session
2. **Authorization** — Verify requester has permission for the requested resource
3. **Rate limiting** — Apply to all REST endpoints
4. **Input validation** — Zod schemas for all request bodies
5. **Output encoding** — Escape all responses appropriately for content-type
6. **HTTPS only** — No HTTP endpoints in production

### Health Endpoint Security

The `/health` endpoint is typically public. Ensure it:
- Does not expose sensitive system information
- Does not enable information gathering for attackers
- Returns only operational status (not stack traces)

### Peer Project REST Endpoints

| Endpoint | Auth | Rate Limited | Notes |
|---|---|---|---|
| `GET /health` | No | No | Operational status only |
| `GET /turn-credentials` | Yes (socket) | Yes | Should verify room membership |

---

## 10. Logging & Monitoring

### Structured Logging Requirements

All production logs must be:
- JSON-formatted for machine parsing
- Include: timestamp, level, service name, traceId, message, context
- Sensitive data redacted (passwords, tokens, PII)

**Log Levels:**
- `ERROR` — Failures requiring attention; all 5xx errors
- `WARN` — Recoverable anomalies; failed auth attempts, rate limit hits
- `INFO` — Significant events; server start, room created/destroyed
- `DEBUG` — Development detail; never enabled in production

### Security Events to Log

| Event | Level | Fields |
|---|---|---|
| Authentication failure | WARN | IP, socketId, reason |
| Rate limit exceeded | WARN | IP, event type, limit |
| Room join | INFO | roomToken (masked), peerId |
| Room created | INFO | roomToken |
| Room destroyed | INFO | roomToken, reason |
| Chat message blocked (validation) | WARN | socketId, reason |
| TURN credential issued | INFO | peerId, roomToken |
| Unauthorized signaling attempt | WARN | socketId, targetPeerId |

### Monitoring Requirements

- **Metrics endpoint** (`/metrics`) — Prometheus format
- **Key metrics:** Request rate, error rate, latency (p50, p95, p99)
- **Business metrics:** Active rooms, active peers, TURN relay usage
- **Alerting:** Error rate spike, latency degradation, resource saturation

### Peer Project Status

- No structured logging specification implemented
- Error stack traces may leak in development (L-9)
- No `/metrics` endpoint visible in current implementation

---

## 11. Compliance Frameworks

### GDPR (General Data Protection Regulation)

**Peer v1 is GDPR-ready by design:**
- No PII stored server-side
- Display names in sessionStorage only (client-side)
- Room tokens are UUID v4 (not personal data)
- No persistent user accounts
- Chat messages are ephemeral (24h retention then deletion)

**Required for compliance if EU users:**
- Privacy policy accessible to users
- Data deletion mechanism (chat purge on request)
- Cookie consent if any tracking is used

### OWASP Top 10 Coverage

See Section 1 above. The Peer project has findings across A01-A09.

### WebRTC Security Compliance

WebRTC security is governed by:
- [W3C WebRTC Specification](https://www.w3.org/TR/webrtc/) — mandates DTLS-SRTP
- [RFC 8827](https://datatracker.ietf.org/doc/html/rfc8827) — WebRTC Security Architecture
- [RFC 8829](https://datatracker.ietf.org/doc/html/rfc8829) — WebRTC Privacy Considerations

### PCI DSS (If Applicable)

Not applicable for Peer v1 (no payment card data). If recording feature is added with storage, PCI DSS may apply.

---

## 12. References

### Standards Documents

| Source | Document | URL |
|---|---|---|
| OWASP | Top 10 2025 | https://owasp.org/Top10/2025/en/ |
| OWASP | ASVS 5.0 | https://owasp.org/www-project-application-security-verification-standard/ |
| OWASP | WebSocket Security Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html |
| NIST | SP 800-52 Rev. 2 (TLS) | https://csrc.nist.gov/pubs/sp/800/52/r2/final |
| NIST | SP 800-63B (Digital Identity) | https://pages.nist.gov/800-63-3/sp800-63b.html |
| CIS | Docker Benchmark v1.7 | https://www.cisecurity.org/benchmark/docker |
| W3C | WebRTC Specification | https://www.w3.org/TR/webrtc/ |
| IETF | RFC 8827 (WebRTC Security) | https://datatracker.ietf.org/doc/html/rfc8827 |
| IETF | RFC 8489 (TURN) | https://datatracker.ietf.org/doc/html/rfc8489 |
| Cloudflare | TLS 1.3 Best Practices | https://blog.cloudflare.com/tls-1-3/ |

### Security Tools

| Tool | Purpose |
|---|---|
| OWASP ZAP | Web application security scanning |
| Docker Bench Security | CIS Docker compliance validation |
| npm audit | Node.js dependency vulnerability scanning |
| Snyk / Dependabot | Dependency vulnerability monitoring |
| Qualys SSL Labs | TLS configuration testing (ssllabs.com/ssltest) |
| securityheaders.com | HTTP security header analysis |

### Key Vulnerabilities and References

| Vulnerability | Reference | Peer Relevance |
|---|---|---|
| Log4Shell (CVE-2021-44228) | Apache Log4j | Not applicable (no Java) |
| Spring4Shell (CVE-2022-22965) | Spring Framework | Not applicable |
| Insecure Design | OWASP A04 2025 | H-3, H-13 in audit |
| TURN Relay Abuse | WebRTC attack vector | CR-1, CR-2, CR-5, CR-8 in audit |
| WebRTC IP Leakage | e.g., ICE candidate filtering | H-2 in audit |

---

## Appendix: Peer Project Priority Standards Compliance

Based on the SECURITY_AUDIT.md findings, the following priority actions are required to meet industry standards:

### P0 — Immediate (Before Any Deployment)

| Standard | Issue | Fix |
|---|---|---|
| CIS Docker 1.7 | `coturn:latest` tag | Pin to specific version: `coturn:4.6.2-alpine` |
| TLS | HTTPS server block commented out | Uncomment nginx HTTPS block; remove `--staging` |
| TURN Security | TURN URLs hardcoded localhost | Add `COTURN_HOST` env var; fix `turn-credentials.ts` |
| TURN Security | Insecure secret fallback | Remove fallback; throw at startup if unset |
| TURN Security | coturn no auth mechanism | Use `static-auth-secret` in turnserver.conf |
| Rate Limiting | Rate limiter defined but not wired | Import and call `setupSocketRateLimiter(io)` |
| TLS | Plaintext TURN port 3478 exposed | Remove port 3478; expose only 5349 (TLS) |

### P1 — Critical Path (Before Production)

| Standard | Issue | Fix |
|---|---|---|
| OWASP A03 (Injection) | Zod installed but unused | Wire Zod schemas to all Socket.IO event handlers |
| OWASP A01 (Access Control) | No signaling authorization | Add room membership verification on all signaling events |
| OWASP A05 (Misconfiguration) | CSP has `unsafe-inline/eval` | Remove directives; use nonces or hashes |
| OWASP A05 (Misconfiguration) | HSTS header missing | Add HSTS header in nginx |
| WebRTC Security | ICE private IP leakage | Set `iceTransportPolicy: 'relay'` or filter candidates |
| WebRTC Security | TURN credential endpoint open | Verify room membership before issuing credentials |
| WebRTC Security | Media stream not stopped | Call `track.stop()` on screen share end |
| Container Security | Nginx runs as root | Add `USER nginx` before CMD |
| Container Security | Backend port exposed | Remove `ports: ["3000:3000"]` from docker-compose |

### P2 — Hardening (Post-Launch)

| Standard | Issue | Fix |
|---|---|---|
| OWASP A09 (Logging) | No structured logging | Implement JSON structured logging with trace IDs |
| Container Security | No resource limits | Add CPU/memory limits to all containers |
| Container Security | No network isolation | Create separate Docker networks per service |
| WebSocket Security | Per-IP rate limit only | Add per-socket and per-room rate limits |
| OWASP A07 (Auth) | Session timeout not set | Configure socket idle timeout |

---

*Document compiled from: OWASP Top 10 2025, NIST SP 800-52 Rev. 2, CIS Docker Benchmark v1.7, W3C WebRTC Specification, IETF RFC 8827/8829/8489, WebRTC Security GitHub (webrtc-security.github.io), WebRTC Ventures 2025, BrightSec WebSocket Security Guide*
