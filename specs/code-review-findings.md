# Backend Code Quality Review Findings

**Review Date:** 2026-03-21
**Reviewer:** backend-review
**Scope:** packages/backend/src/**, packages/shared/**

---

## 1. API Design Patterns

### Issue 1.1: Inconsistent Response Shapes Across Socket.IO Events
**Severity:** Medium
**File:** packages/backend/src/events/room-events.ts (lines 51-54, 123-125)
**Description:** Room creation and join events return `{ success: true, data: {...} }` format, but chat events return raw payloads directly without wrapping. This inconsistency forces frontend to handle different response shapes.
**Remediation:** Standardize all Socket.IO event responses to follow a consistent `ApiResponse<T>` format (already defined in @peer/shared).

### Issue 1.2: Lack of Request/Response Type Contracts
**Severity:** Medium
**File:** packages/backend/src/events/room-events.ts, chat-events.ts, turn-events.ts
**Description:** Socket.IO event handlers accept `payload: unknown` or loosely typed payloads. No runtime validation of payload structure before processing.
**Remediation:** Implement Zod or similar schema validation for all incoming Socket.IO payloads to ensure type safety and fail fast on invalid input.

---

## 2. Error Handling

### Issue 2.1: Direct console.* Usage Instead of Structured Logging
**Severity:** High
**Files:**
- packages/backend/src/events/room-events.ts (lines 25, 57, 128, 157, 202, 214)
- packages/backend/src/events/chat-events.ts (lines 62, 92)
- packages/backend/src/events/turn-events.ts (lines 28, 39)
- packages/backend/src/services/cleanup.ts (lines 26, 31, 42, 54, 67)

**Description:** Code uses `console.log`, `console.error` directly instead of structured logging. This violates observability requirements - logs are not JSON formatted, lack trace IDs, and cannot be filtered by level in production.
**Remediation:** Replace with a structured logger (pino, winston) that outputs JSON with fields: timestamp, level, service, traceId, message, context.

### Issue 2.2: Inconsistent Error Response Shapes
**Severity:** Medium
**File:** packages/backend/src/events/chat-events.ts (lines 34-37, 44-47, 63-66, 80-83, 93-96)
**Description:** Chat error responses use `{ code, message }` but room-events errors use `{ code, message }` within a callback wrapper. Some errors return to client, others only log server-side.
**Remediation:** Create a unified error response helper function that all event handlers use.

### Issue 2.3: Empty Catch Blocks with Silent Swallowing
**Severity:** Low
**File:** packages/backend/src/repositories/message-repository.ts (lines 97-99, 118-121)
**Description:** Catch blocks in `softDeleteRoomMessages` and `deleteOldMessages` silently swallow errors with empty catch bodies and generic comments "Database not initialized - ignore in tests/development".
**Remediation:** Log warnings when ignoring database errors, or use a specific sentinel error type that can be safely ignored.

---

## 3. TypeScript Strictness and Type Safety

### Issue 3.1: Type Duplication Between Backend and Shared Package
**Severity:** Medium
**Files:**
- packages/backend/src/rooms.ts (Peer interface, line 5-9)
- packages/shared/src/index.ts (RoomPeer interface, line 22-26)

**Description:** `Peer` in rooms.ts and `RoomPeer` in @peer/shared are nearly identical but not the same type. This creates drift and requires manual synchronization.
**Remediation:** Use the shared types exclusively. Import RoomPeer from @peer/shared in rooms.ts instead of defining a local Peer type.

### Issue 3.2: Unsafe Type Assertions
**Severity:** Medium
**File:** packages/backend/src/rooms.ts (lines 25, 97, 106, 152, 208)
**Description:** Multiple instances of `as Room['token']` and `as RoomToken` type assertions that bypass TypeScript's type checking without validation.
**Remediation:** Use branded types properly with validation functions. The `isRoomToken()` function exists but is not used consistently to validate before casting.

### Issue 3.3: Socket Data Not Typed
**Severity:** Medium
**File:** packages/backend/src/events/chat-events.ts (line 21)
**Description:** `socket.data` is cast to local `SocketData` interface but there is no enforcement that this data was actually set. If middleware fails to set socket data, runtime errors occur.
**Remediation:** Use Socket.IO's `socket.data` with proper typing via `Socket<ClientData, ServerData>` generics, or validate socket data presence at event handler entry.

### Issue 3.4: Missing Input Validation on WebRTC Signaling Payloads
**Severity:** High
**File:** packages/backend/src/events/room-events.ts (lines 173-196)
**Description:** SDP and ICE candidate handlers accept `sdp: object` and `candidate: object` without validation. Malformed payloads could cause crashes when forwarding.
**Remediation:** Add schema validation for SDP structure and ICE candidate structure before forwarding.

---

## 4. Code Organization

### Issue 4.1: No Service Layer for Business Logic
**Severity:** Medium
**File:** packages/backend/src/events/*.ts
**Description:** Socket.IO event handlers contain business logic directly in handler callbacks. This mixes transport layer (Socket.IO) with business logic (room management, chat handling).
**Remediation:** Extract business logic into service classes/functions. Event handlers should only: 1) validate input, 2) call service, 3) handle response/error.

### Issue 4.2: Inconsistent File Organization
**Severity:** Low
**File:** packages/backend/src/rooms.ts
**Description:** `rooms.ts` contains both room domain types (Room, Peer) and in-memory storage. Repository pattern is used for messages but not for rooms.
**Remediation:** Consider separating room storage/repo from domain types, or at minimum grouping with other domain logic in a dedicated folder.

### Issue 4.3: No Dependency Injection
**Severity:** Low
**File:** packages/backend/src/events/*.ts
**Description:** Services and repositories are imported directly as module singletons. This makes testing harder and creates implicit global state.
**Remediation:** Consider dependency injection pattern for services to improve testability and reduce implicit dependencies.

---

## 5. Logging and Observability

### Issue 5.1: No Correlation/Trace IDs
**Severity:** High
**Files:** All Socket.IO event handlers
**Description:** No traceId or correlationId passed through request chains. When a single user action triggers multiple events (room create → join → SDP exchange), logs cannot be correlated.
**Remediation:** Generate traceId on connection or first event, store in socket.data, and include in all log entries for that socket's requests.

### Issue 5.2: Missing Security Event Logging
**Severity:** Medium
**File:** packages/backend/src/middleware/rate-limit.ts
**Description:** Rate limit violations are logged but not with security event context. Failed auth attempts should be logged as security events.
**Remediation:** Add structured security event logging for rate limit hits with client IP, endpoint, and timestamp.

### Issue 5.3: No Health Check Depth
**Severity:** Medium
**File:** packages/backend/src/routes/health.ts (lines 12-20)
**Description:** Health endpoint only returns status "ok" and uptime. Does not check database connectivity, disk space, or dependency health.
**Remediation:** Extend health check to verify database connection, that cleanup scheduler is running, and include in status response.

---

## 6. Performance Anti-Patterns

### Issue 6.1: Unbounded Message History Retrieval
**Severity:** Medium
**File:** packages/backend/src/events/chat-events.ts (line 88)
**Description:** `getMessagesByRoom(roomToken, 100)` defaults to 100 but clients can request arbitrary amounts. No cursor-based pagination for large histories.
**Remediation:** Implement cursor-based pagination: return `nextCursor` timestamp with results, client passes `before` cursor for previous page.

### Issue 6.2: Database Save Without Change Detection
**Severity:** Low
**File:** packages/backend/src/db/index.ts (lines 45-49)
**Description:** Database is saved every 30 seconds unconditionally, even if no changes occurred. Wastes I/O on idle instances.
**Remediation:** Track dirty flag on database mutations; only save when actual changes exist.

### Issue 6.3: Synchronous File Operations in Init
**Severity:** Low
**File:** packages/backend/src/db/index.ts (lines 29-36)
**Description:** Uses `fs.existsSync`, `fs.mkdirSync`, `fs.readFileSync` during server startup. These block the event loop.
**Remediation:** Use async fs methods with await during initDatabase, or offload to worker thread.

### Issue 6.4: Hardcoded Magic Numbers
**Severity:** Info
**Files:**
- packages/backend/src/db/index.ts (save interval: 30000)
- packages/backend/src/services/cleanup.ts (cleanup interval: 3600000, threshold: 24)
- packages/backend/src/services/turn-credentials.ts (TTL: 3600)
- packages/backend/src/middleware/rate-limit.ts (30 events per 10 seconds)

**Description:** Magic numbers scattered across files. Some are documented with comments, others are not.
**Remediation:** Extract all to named constants in a config module with JSDoc comments explaining rationale.

---

## 7. Security Observations

### Issue 7.1: TURN Credentials Hardcoded Fallback
**Severity:** High
**File:** packages/backend/src/services/turn-credentials.ts (line 3)
**Description:** `const TURN_SECRET = process.env.TURN_SECRET || 'change-me-in-production'` - default fallback secret is insecure and would be catastrophic if deployed.
**Remediation:** Fail fast at startup if TURN_SECRET is not set in production. Throw error instead of fallback.

### Issue 7.2: CORS Origin Validation
**Severity:** Low
**File:** packages/backend/src/middleware/security.ts (line 43)
**Description:** CORS origin is read from env var but not validated to be a proper origin. Invalid values could bypass CORS entirely.
**Remediation:** Validate CORS_ORIGIN is a valid URL or comma-separated list of valid origins at startup.

### Issue 7.3: Rate Limiter Memory Only
**Severity:** Low
**File:** packages/backend/src/middleware/rate-limit.ts
**Description:** RateLimiterMemory is used - state is not shared across multiple server instances. In multi-instance deployment, rate limiting can be bypassed.
**Remediation:** For production, use Redis-backed rate limiter (rate-limiter-flexible supports Redis).

---

## Summary

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

### Top Priority Items
1. **Replace console.* with structured logger** - Immediate observability impact
2. **Add traceId to all requests** - Required for debugging production issues
3. **Fail fast on missing TURN_SECRET** - Production security critical
4. **Implement input validation for WebRTC payloads** - Security hardening
5. **Use shared types consistently** - Prevent type drift and bugs

---

*Review completed by backend-review agent*

---

# Infrastructure Security Audit Findings

**Review Date:** 2026-03-21
**Reviewer:** infrastructure-security-audit
**Scope:** docker-compose*.yml, Dockerfile*, nginx*.conf, turnserver.conf

## Critical Severity

### 1. TURN Server Runs as Root in Container

**Location:** `docker-compose.production.yml:39` (coturn service)

**Description:** The coturn container runs as root by default. TURN servers are network-facing services that could be targeted for privilege escalation.

**Evidence:**
```yaml
coturn:
  image: coturn/coturn:latest
  # No USER directive or security context defined
```

**Remediation:** Create a dedicated user for coturn:
```yaml
coturn:
  user: 1001:1001
  security_opt:
    - no-new-privileges:true
```

---

### 2. Production HTTPS is Completely Disabled

**Location:** `nginx.conf:41-83` (HTTP server block)

**Description:** The HTTPS server block is entirely commented out. All production traffic, including potentially sensitive WebRTC signaling, is served over unencrypted HTTP.

**Evidence:**
```nginx
# HTTP server - redirect to HTTPS and handle ACME challenges
server {
    listen 80;
    # ...
    # Redirect to HTTPS (uncomment for production)
    # return 301 https://$host$request_uri;
```

**Remediation:** Uncomment and configure the HTTPS server block with proper TLS 1.2/1.3 settings. Enable HSTS header. Ensure `ssl_certificate` and `ssl_certificate_key` paths are correct.

---

### 3. Coturn Image Uses `latest` Tag

**Location:** `docker-compose.production.yml:39`

**Description:** Using `coturn/coturn:latest` means the image can change unexpectedly between deployments, potentially introducing breaking changes or vulnerabilities.

**Evidence:**
```yaml
coturn:
  image: coturn/coturn:latest
```

**Remediation:** Pin to a specific version:
```yaml
coturn:
  image: coturn/coturn:4.6.2
```

---

## High Severity

### 4. No Container Resource Limits

**Location:** `docker-compose.production.yml` (all services)

**Description:** No CPU or memory limits are defined for any container. A compromised or runaway container could exhaust host resources.

**Evidence:** Services like `backend`, `nginx`, `coturn` have no `deploy.limits` defined.

**Remediation:** Add resource limits to all services:
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

---

### 5. No Read-Only Filesystems

**Location:** `docker-compose.production.yml` (all services)

**Description:** Containers have writable filesystems by default. If an attacker gains code execution, they can write malicious files.

**Evidence:** No `read_only: true` or `:ro` volume flags except for config files.

**Remediation:** Enable read-only root filesystem where possible:
```yaml
services:
  backend:
    read_only: true
    volumes:
      - backend-data:/app/data
```

---

### 6. TURN Server Missing TLS Configuration

**Location:** `turnserver.conf`, `docker-compose.production.yml`

**Description:** The TURN server listens on port 5349 (TLS) but no TLS certificates are configured. The TLS listening port will be non-functional or use defaults.

**Evidence:**
```
tls-listening-port=5349
# No cert/key paths specified in turnserver.conf
```

**Remediation:** Add TLS certificate paths to turnserver.conf:
```
cert=/etc/coturn/certs/turn_server_cert.pem
pkey=/etc/coturn/certs/turn_server_pkey.pem
```

---

### 7. WebSocket Proxy Timeout Too Long

**Location:** `nginx.conf:74`

**Description:** `proxy_read_timeout 86400` (24 hours) is excessively long and could allow idle connections to persist indefinitely, consuming resources.

**Evidence:**
```nginx
location /socket.io/ {
    proxy_read_timeout 86400;
```

**Remediation:** Reduce to a reasonable value (e.g., 300 seconds for WebRTC):
```nginx
proxy_read_timeout 300;
```

---

### 8. No Container Capability Dropping

**Location:** `docker-compose.production.yml`

**Description:** Containers run with default capabilities. Coturn and Nginx don't need full capabilities.

**Evidence:** No `cap_drop` or `cap_add` directives in any service.

**Remediation:** Drop unnecessary capabilities:
```yaml
services:
  nginx:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

---

## Medium Severity

### 9. CSP Header Allows unsafe-eval

**Location:** `nginx-frontend.conf:32`

**Description:** Content-Security-Policy allows `'unsafe-eval'` which enables XSS attacks to execute arbitrary JavaScript.

**Evidence:**
```
add_header Content-Security-Policy "... script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...";
```

**Remediation:** Remove `'unsafe-eval'` and ensure all code is built without needing eval:
```nginx
add_header Content-Security-Policy "... script-src 'self' 'unsafe-inline'; ..." always;
```

---

### 10. Missing HSTS Header

**Location:** `nginx-frontend.conf`

**Description:** The HTTPS server should send `Strict-Transport-Security` header to enforce HTTPS.

**Evidence:** No HSTS header present in `nginx-frontend.conf`.

**Remediation:** Add HSTS header:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

### 11. Missing Permissions-Policy Header

**Location:** `nginx-frontend.conf`

**Description:** The newer `Permissions-Policy` header controls browser feature access (camera, microphone, etc.). Should be set for a WebRTC app.

**Evidence:** No Permissions-Policy header defined.

**Remediation:** Add appropriate policy:
```nginx
add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(self)";
```

---

### 12. No Rate Limiting in Nginx

**Location:** `nginx.conf`

**Description:** No rate limiting is configured at the Nginx level for API endpoints, making the application vulnerable to brute force and DoS attacks.

**Evidence:** Only backend has `RATE_LIMIT_MAX_POINTS` env var, but Nginx has no `limit_req_zone` configuration.

**Remediation:** Add rate limiting zones:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=1r/s;
```

---

### 13. TURN Server Default Fallback Secret

**Location:** `docker-compose.production.yml:46`, `docker-compose.yml:16`

**Description:** The default fallback `change-me-in-production` for `TURN_SECRET` is weak and could be exploited if the env var is not set.

**Evidence:**
```yaml
- TURN_SECRET=${TURN_SECRET:-change-me-in-production}
```

**Remediation:** Remove the default fallback. Require the secret to be explicitly set:
```yaml
env:
  - TURN_SECRET=${TURN_SECRET}
```
Ensure deployment fails if TURN_SECRET is not set.

---

### 14. Coturn Container Port Exposure

**Location:** `docker-compose.production.yml:40-44`

**Description:** TURN ports 3478 and 5349 are exposed directly to the host, increasing attack surface.

**Evidence:**
```yaml
ports:
  - "3478:3478/udp"
  - "3478:3478/tcp"
  - "5349:5349/udp"
  - "5349:5349/tcp"
```

**Remediation:** If TURN server is only used internally by WebRTC peers on the same host/network, consider removing host port mapping and using Docker networking instead.

---

### 15. Gzip Compression Vulnerability (Gzip Bomb)

**Location:** `nginx.conf:25-29`

**Description:** Gzip compression is enabled without `gzip_ratio` or buffer limits, potentially allowing zip bomb attacks.

**Evidence:**
```nginx
gzip on;
# No gzip_ratio or gzip_buffers configuration
```

**Remediation:** Add ratio limits:
```nginx
gzip_comp_level 6;
gzip_min_length 1024;
gzip_proxied any;
gzip_vary on;
```

---

## Low Severity

### 16. Nginx Uses Generic `alpine` Tag

**Location:** `docker-compose.production.yml:55`

**Description:** While alpine is minimal, using a floating tag (`alpine`) could lead to unexpected updates.

**Evidence:**
```yaml
nginx:
  image: nginx:alpine
```

**Remediation:** Pin to specific version:
```yaml
nginx:
  image: nginx:1.26-alpine
```

---

### 17. Backend Healthcheck Uses wget

**Location:** `docker-compose.production.yml:23`

**Description:** The healthcheck installs wget inside the container. Alpine-based images may not have wget by default.

**Evidence:**
```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
```

**Remediation:** Use curl or the node health endpoint:
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
```

---

### 18. Missing `no-new-privileges` Security Option

**Location:** `docker-compose.production.yml`

**Description:** No `security_opt` is set to prevent privilege escalation via setuid binaries.

**Evidence:** No `security_opt` on any service.

**Remediation:**
```yaml
services:
  backend:
    security_opt:
      - no-new-privileges:true
```

---

### 19. Turnserver.conf Allows All Interfaces

**Location:** `turnserver.conf`

**Description:** Coturn binds to all interfaces by default. For a containerized deployment, should be restricted.

**Evidence:**
```
# No listening-ip or relay-ip specified
```

**Remediation:** If the TURN server should only relay for internal peers:
```
listening-ip=10.0.0.0
relay-ip=10.0.0.0
```

---

### 20. CORS Origin Hardcoded in Development Compose

**Location:** `docker-compose.yml:15`

**Description:** CORS_ORIGIN is set to `https://localhost` which may not match actual deployment domains.

**Evidence:**
```yaml
- CORS_ORIGIN=https://localhost
```

**Remediation:** Use environment variable with proper fallback:
```yaml
- CORS_ORIGIN=${CORS_ORIGIN}
```

---

## Informational (Good Practices Found)

1. **Non-root users in Dockerfiles:** `packages/backend/Dockerfile` and `packages/frontend/Dockerfile` correctly create and use non-root users
2. **Healthchecks:** Backend services have proper healthcheck configurations
3. **Network isolation:** Services use a dedicated `peer-network` bridge
4. **Restart policies:** `unless-stopped` is correctly set for resilience
5. **Read-only config volumes:** Config files are mounted as `:ro`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 6 |
| Medium | 7 |
| Low | 4 |
| **Total** | **20** |

### Top Priority Items
1. **Enable HTTPS in production** - All traffic is unencrypted
2. **Run Coturn as non-root** - Privilege escalation risk
3. **Pin Coturn image tag** - Supply chain integrity
4. **Add container resource limits** - DoS protection
5. **Configure TURN TLS certificates** - Secure TURN relay

---

*Review completed by infrastructure-security-audit agent*

---

# Backend Security & Code Review (backend-security)

**Scope**: `packages/backend/src/events/**`, `packages/shared/**`
**Review Date**: 2026-03-21

---

## Critical

### S-1: WebRTC Signaling Without Authorization

**File**: `packages/backend/src/events/room-events.ts:173-197`

The `sdp:offer`, `sdp:answer`, and `ice-candidate` handlers accept a `targetPeerId` from the client and relay the payload without verifying the sender is in the same room as the target. Any connected socket can send signaling messages to any other connected socket.

```typescript
socket.on('sdp:offer', (data: { targetPeerId: string; sdp: object }) => {
  const { targetPeerId, sdp } = data;
  socket.to(targetPeerId).emit('sdp:offer', { peerId: socket.id, sdp });
});
```

An attacker connected to the server can send arbitrary SDP offers/answers or ICE candidates to any other connected peer, potentially causing DoS (crashing WebRTC connections) or traffic interception if the victim accepts a rogue offer.

**Remediation**: Verify sender and target share at least one room before relaying:
```typescript
// In sdp:offer handler:
const senderRooms = socket.rooms;
const targetSocket = io.sockets.sockets.get(targetPeerId);
if (!targetSocket || ![...senderRooms].some(r => targetSocket.rooms.has(r))) {
  return; // Not in same room — silently drop
}
io.to(targetPeerId).emit('sdp:offer', { peerId: socket.id, sdp });
```

---

### S-2: TURN Secret Hardcoded Fallback

**File**: `packages/backend/src/services/turn-credentials.ts:3`

```typescript
const TURN_SECRET = process.env.TURN_SECRET || 'change-me-in-production';
```

If `TURN_SECRET` is not set, the server uses a well-known default value. TURN credentials generated with this secret allow unauthorized third parties to relay traffic through the TURN server, effectively turning it into an open proxy.

**Remediation**: Fail fast at startup:
```typescript
if (!process.env.TURN_SECRET) {
  throw new Error('TURN_SECRET environment variable is required');
}
```

---

## High

### S-3: TURN URLs Hardcoded to localhost

**File**: `packages/backend/src/services/turn-credentials.ts:30-35`

TURN URLs point to `localhost`/`127.0.0.1` regardless of environment. Credentials generated in production contain invalid URLs, making TURN completely non-functional. The client silently fails to connect via TURN.

**Remediation**: Add a `TURN_HOST` environment variable:
```typescript
const TURN_HOST = process.env.TURN_HOST || 'localhost';
const turnUrls = [
  `turn:${TURN_HOST}:${turnPort}`,
  `turn:${TURN_HOST}:${turnPort}/tcp`,
];
```

---

### S-4: Room Token Ignored in TURN Request

**File**: `packages/backend/src/events/turn-events.ts:18-23`

The `TurnRequestPayload` includes a `roomToken`, but `generateTurnCredentials()` does not accept or validate it. Any connected socket can request TURN credentials without proof of being in a room.

**Remediation**: Validate the room token before generating credentials and consider scoping credentials to the room session.

---

### S-5: Socket Rate Limiter Does Not Block Connections

**File**: `packages/backend/src/middleware/rate-limit.ts:51-62`

```typescript
io.use((socket: Socket, next: (err?: Error) => void) => {
  socketRateLimiter.consume(ip).then(() => {
    next();  // Always calls next() — error case still calls next()
  }).catch(() => {
    next(new Error('Too many connection attempts'));
  });
});
```

The middleware always calls `next()`. Even in the error path, `next(new Error(...))` does not disconnect the socket — the client connects anyway. The Socket.IO rate limiter is ineffective against connection floods.

**Remediation**: Disconnect on rate limit exceed:
```typescript
.catch(() => {
  socket.disconnect(true);
  next(new Error('Rate limit exceeded'));
});
```

---

### S-6: No Per-Socket Authentication / Session Binding

**File**: `packages/backend/src/events/room-events.ts`

There is no authentication layer. A socket is identified only by its Socket.IO `socket.id`. No token, certificate, or proof of identity is required to connect. Any client can create rooms, join rooms, send chat messages, and request TURN credentials without authentication.

While room-join uses UUID v4 tokens (unguessable), there is no rate limiting on room creation and no mechanism to prevent automated spam or room enumeration.

**Remediation**: Implement token-based authentication as a Socket.IO handshake guard, or integrate with an existing auth system (JWT, OAuth). Require a short-lived auth token as a Socket.IO handshake query parameter.

---

### S-7: WebRTC Signaling Message Routing Is Ineffective

**File**: `packages/backend/src/events/room-events.ts:173-197`

`socket.to(targetPeerId)` in Socket.IO creates/joins a room named `targetPeerId`. There is no such join in the codebase. As a result, `socket.to(targetPeerId)` broadcasts to **zero sockets** in practice, making signaling silently fail. Even if it worked, it lacks authorization checks (see S-1).

**Remediation**: Verify shared room membership before routing, then use `io.to(targetSocketId).emit(...)` with explicit authorization validation.

---

### S-8: HMAC-SHA1 Used for TURN Password Generation

**File**: `packages/backend/src/services/turn-credentials.ts:24`

HMAC-SHA1 is cryptographically weak and deprecated for security-sensitive applications. An attacker with a compromised TURN secret could generate valid credentials more easily with SHA-1's reduced collision resistance.

**Remediation**: Use HMAC-SHA-256:
```typescript
const hmac = crypto.createHmac('sha256', TURN_SECRET);
```

---

## Medium

### S-9: Database File Written Without WAL Mode

**File**: `packages/backend/src/db/index.ts:25-52`

SQLite runs with default journal mode. Without WAL (Write-Ahead Logging), concurrent writes from multiple server instances cause locks and potential data loss. The periodic 30-second save interval means up to 30 seconds of data can be lost on crash.

**Remediation**: Enable WAL mode after database creation:
```typescript
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA synchronous=NORMAL');
```

---

### S-10: Chat Messages Not Rate Limited

**File**: `packages/backend/src/events/chat-events.ts:26-68`

The `rateLimitMiddleware` applies only to HTTP routes. The `chat:message` Socket.IO event has no per-socket rate limiting. A malicious user in a room can flood at full Socket.IO speed (throttled only by the 30 events/10s socket connection limit, which covers ALL events, not just chat).

**Remediation**: Add a dedicated per-socket event rate limiter for `chat:message`.

---

### S-11: No Message Spam Prevention Beyond Length

**File**: `packages/backend/src/repositories/message-repository.ts:143-153`

`validateMessage` only checks for empty/whitespace and length. No check for repeated identical messages (spam), excessive Unicode combining characters, zero-width characters, or excessive emoji sequences.

**Remediation**: Add pattern-based spam detection (repeated messages, emoji density limits, Unicode normalization) before storing.

---

### S-12: SQLite Concurrency Safety Not Guaranteed

**File**: `packages/backend/src/db/index.ts:45-49`

The periodic save races with in-flight writes, potentially corrupting the on-disk state. sql.js is not designed for concurrent access patterns.

**Remediation**: Use a write queue with mutex, or migrate to a production-grade database (PostgreSQL with connection pool) for any non-trivial deployment.

---

### S-13: No Payload Schema Validation on Socket.IO Events

**File**: `packages/backend/src/events/chat-events.ts:26-28`, `room-events.ts:28,69,140,173`

Socket.IO event handlers accept loosely typed payloads. No runtime validation of payload structure. Malformed or unexpected payload shapes could cause silent failures or unexpected behavior.

**Remediation**: Use a schema validator (e.g., Zod) at the event handler boundary for all incoming payloads.

---

### S-14: Content-Security-Policy `styleSrc` Allows `'unsafe-inline'`

**File**: `packages/backend/src/middleware/security.ts:12`

`unsafe-inline` in styles enables CSS injection attacks (e.g., `style="behavior: url(xss.htc)"` on IE, data exfiltration via background images on attacker domains).

**Remediation**: Remove `'unsafe-inline'` if possible, or use a nonce-based CSP.

---

## Low

### S-15: Version Exposed in Health Endpoint

**File**: `packages/backend/src/routes/health.ts:6`

Package version is returned in the health endpoint, allowing attackers to fingerprint the exact version and search for known vulnerabilities.

**Remediation**: Remove version from the health response in production.

---

### S-16: Missing `Permissions-Policy` Header

**File**: `packages/backend/src/middleware/security.ts`

The Helmet configuration does not include a `permissionsPolicy` directive.

**Remediation**: Add:
```typescript
permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
```

---

### S-17: TURN Credential Request Logged Without Security Context

**File**: `packages/backend/src/events/turn-events.ts:28`

Logging credential generation events with socket IDs could leak operational security information.

**Remediation**: Use structured logging at INFO level with a counter metric instead of per-request logging.

---

## Positive Findings

The following are implemented correctly:

- **Parameterized SQL queries**: All database operations use `?` placeholders, preventing SQL injection. (`message-repository.ts:42-45`, `message-repository.ts:63-69`)
- **HTML sanitization**: Chat messages are sanitized with HTML entity encoding before storage and display. (`message-repository.ts:127-138`)
- **Room token UUID v4 validation**: The `isRoomToken` guard validates UUID v4 format for room tokens. (`room-events.ts:14-17`)
- **Room membership authorization**: `chat:message` and `chat:history` correctly validate that the sender is in the requested room. (`chat-events.ts:33-39`, `chat-events.ts:79-85`)
- **Soft delete for room messages**: Messages are soft-deleted when rooms are destroyed, supporting audit trails. (`rooms.ts:93`)
- **Graceful shutdown**: The server handles SIGTERM/SIGINT and drains connections before exiting. (`index.ts:19-39`)
- **Structured error responses**: All error responses follow a consistent `{ code, message }` envelope format.
- **Helmet security headers**: HSTS, frameguard, XSS filter, and referrer policy are properly configured.
- **Peer list scoped to room**: `getPeersInRoom` is correctly scoped to return only peers in the specified room. (`rooms.ts:114-120`)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 6     |
| Medium   | 6     |
| Low      | 3     |

**Most urgent (fix before production):**
1. **S-1**: WebRTC signaling authorization — any socket can disrupt any peer's WebRTC session
2. **S-2**: TURN secret fallback — would expose TURN server as an open relay


---

# Frontend Security Review Findings

**Review Date**: 2026-03-21
**Reviewer**: Frontend Security Audit Agent
**Scope**: packages/frontend/src/**
**Confidence Score**: 85/100

---

## Critical Findings

### 1. WebRTC Media Stream Injection Risk
**Severity**: Critical
**Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:96-117`

**Description**:
The `ontrack` handler accepts any remote stream without verifying its origin or contents. A malicious peer could potentially inject arbitrary media streams.

**Evidence**:
```typescript
connection.ontrack = (event) => {
  const remoteStream = event.streams[0];
  // No validation that this stream is from the expected peer
  useRoomStore.getState().updatePeer(peerId, { stream: remoteStream });
};
```

**Mitigation**:
- Implement DTLS-SRTP verification to ensure media streams are from authenticated peers
- Add stream fingerprint verification if available
- Validate that the peer ID in the connection matches the stream source

---

## High Findings

### 2. No Server-Side Token Validation on Client
**Severity**: High
**Location**: `packages/frontend/src/lib/signalling.ts:55-64`

**Description**:
Room tokens are generated client-side using `crypto.randomUUID()` and never validated by the server. An attacker who guesses or brute-forces a room UUID can join any room. The token provides no authentication or authorization.

**Evidence**:
```typescript
// HomePage.tsx:29 - client generates token
const token = crypto.randomUUID();
navigate(`/room/${token}`);

// signalling.ts:55 - server accepts token without validation
this.socket?.emit('room:join', { token, displayName }, ...)
```

**Mitigation**:
- Server should generate and cryptographically sign room tokens
- Implement room access control (e.g., room password/PIN, invite-only links)
- Add rate limiting on join attempts to prevent brute force

### 3. Display Name Not Sanitized Before Rendering
**Severity**: High
**Location**: `packages/frontend/src/components/MessageList.tsx:44`
**Location**: `packages/frontend/src/components/Sidebar.tsx:53-55`
**Location**: `packages/frontend/src/components/VideoTile.tsx:82`

**Description**:
Display names received from the server (via Socket.IO events) are rendered without sanitization. A malicious user could set a display name containing XSS payloads (e.g., `<img src=x onerror=alert(1)>`).

**Evidence**:
```typescript
// MessageList.tsx:44
<span className="text-xs font-medium text-gray-300">
  {isOwnMessage ? 'You' : msg.displayName}
</span>

// Sidebar.tsx:55
<span className="text-textPrimary">{peer.displayName}</span>

// VideoTile.tsx:82
{isLocal ? 'You' : displayName}
```

**Mitigation**:
- Sanitize display names server-side before broadcasting
- Use a sanitization library (e.g., DOMPurify) on the client before rendering
- Enforce strict display name validation (alphanumeric + spaces, max length)

### 4. Unrestricted Room Token in URL
**Severity**: High
**Location**: `packages/frontend/src/App.tsx:31`

**Description**:
Room tokens are exposed in the URL path (`/room/:token`). These tokens can be leaked via:
- Browser history
- Referer headers
- Server access logs
- Clipboard (when sharing link)

**Evidence**:
```typescript
<Route path="/room/:token" element={<RoomPage displayName={displayName} />} />
```

**Mitigation**:
- Consider using post-message or fragment identifiers for sensitive tokens
- Implement token rotation on room close
- Add a separate room access password as a secondary factor

---

## Medium Findings

### 5. TURN Server URL Not Validated
**Severity**: Medium
**Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:277-298`

**Description**:
TURN credentials received from the server are accepted without validating the TURN server URLs. A compromised or malicious signaling server could redirect WebRTC media through an attacker-controlled TURN server, enabling MITM attacks on media traffic.

**Evidence**:
```typescript
setTurnServers(credentials: TurnCredentials): void {
  // No validation that credentials.urls are legitimate TURN servers
  const turnServers: RTCIceServer[] = credentials.urls.map((url) => ({
    urls: url,  // Trusting server-provided URLs
    username: credentials.username,
    credential: credentials.password,
  }));
}
```

**Mitigation**:
- Maintain an allowlist of trusted TURN server domains
- Reject credentials from unknown TURN servers
- Log and alert when TURN servers outside the allowlist are used

### 6. No CSP Header Configured
**Severity**: Medium
**Location**: `packages/frontend/index.html`
**Location**: `packages/frontend/vite.config.ts`

**Description**:
No Content Security Policy (CSP) header is configured. This leaves the application vulnerable to XSS attacks if any user-controlled data is rendered unsafely.

**Evidence**:
```html
<!-- index.html has no CSP meta tag -->
<meta charset="UTF-8" />
<!-- No CSP header -->
```

**Mitigation**:
Add a CSP meta tag or configure CSP in Vite build:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:;">
```

### 7. Silent Failure on Connection Errors
**Severity**: Medium
**Location**: `packages/frontend/src/lib/signalling.ts:28-34`, `packages/frontend/src/stores/room-store.ts:164-172`

**Description**:
Connection errors are silently swallowed with `resolve()` instead of proper error handling. The application continues in an unsafe/degraded state without informing the user, potentially exposing media to the wrong peers.

**Evidence**:
```typescript
// signalling.ts:70-71
this.socket.on('connect_error', (error) => {
  // Don't reject - resolve anyway to allow offline/local mode
  resolve();
});

// room-store.ts:167-171
try {
  await signallingClient.connect(token, displayName);
} catch (err) {
  console.warn('Failed to connect to signalling server, continuing anyway:', err);
}
```

**Mitigation**:
- Distinguish between recoverable and non-recoverable errors
- Show clear UI indicators when connection is degraded/unsafe
- Implement a safe mode that restricts functionality when connected unsafely

### 8. Chat Message Rendering Without Contextual Encoding
**Severity**: Medium
**Location**: `packages/frontend/src/components/MessageList.tsx:57`

**Description**:
While React escapes text content by default, chat messages containing special characters or homoglyphs could potentially cause display issues. Messages should be rendered with explicit text encoding.

**Evidence**:
```typescript
// MessageList.tsx:57
<div className={...}>
  {msg.message}
</div>
```

**Mitigation**:
- Ensure all user input is sanitized on the server
- Consider using a library like DOMPurify if any HTML is ever supported in messages
- Implement input validation limiting character types and length

---

## Low Findings

### 9. Insecure Direct Reference to Peer ID in Events
**Severity**: Low
**Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:163-183`

**Description**:
SDP offers/answers and ICE candidates are routed using `peerId` from events without verifying the peer actually sent the message or that the peer is still in the room.

**Evidence**:
```typescript
// peer-manager.ts:163-174
private async handleSdpOffer(event: Event): Promise<void> {
  const { peerId, sdp } = customEvent.detail;
  // peerId is trusted from the event
  let peer = this.peers.get(peerId);
  // ...
}
```

**Mitigation**:
- Add peer ID verification against known active peers
- Implement message signing for signaling messages
- Add sequence numbers to prevent replay attacks

### 10. Session Storage Stores Display Name in Plain Text
**Severity**: Low
**Location**: `packages/frontend/src/App.tsx:19`

**Description**:
Display name is stored in sessionStorage without encryption. While this is low risk for display names, it establishes a pattern that could be extended to storing sensitive data.

**Evidence**:
```typescript
// App.tsx:19
sessionStorage.setItem('peer_display_name', name);
```

**Mitigation**:
- Use HttpOnly cookies for any sensitive session data
- Consider encrypting sensitive data if it must be stored client-side

### 11. No Origin Validation on WebRTC Signalling
**Severity**: Low
**Location**: `packages/frontend/src/lib/signalling.ts`

**Description**:
Socket.IO events don't validate the origin of incoming messages. While Socket.IO has built-in origin checking, the application should explicitly validate peer sources.

**Mitigation**:
- Ensure Socket.IO server is configured with strict origin validation
- Add explicit peer identity verification in the signaling flow

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 4 |
| Medium | 4 |
| Low | 3 |

### Top Priority Fixes
1. Implement DTLS-SRTP verification for WebRTC streams (Critical)
2. Add server-side room token validation and room access control (High)
3. Sanitize all display names and user input (High)
4. Add allowlist validation for TURN server URLs (Medium)
5. Implement CSP headers (Medium)

---

*Review completed by Frontend Security Audit Agent*

---

# Testing Coverage Review Findings

**Review Date:** 2026-03-21
**Reviewer:** testing-review
**Scope:** packages/*/src/__tests__/**, tests/**, e2e/**

---

## 1. Backend Test Coverage

### 1.1 Room Management (packages/backend/src/__tests__/rooms.test.ts)
**Coverage: Good**

The rooms.test.ts provides comprehensive unit tests for the rooms module, covering:
- Room creation with UUID v4 tokens
- Peer join/leave operations
- Room destruction when last peer leaves
- Edge cases (non-existent rooms, duplicate peers)

**Issue:** Tests do not verify the `isPeerInRoom` function behavior when room is deleted mid-operation.

---

### 1.2 TURN Credentials (packages/backend/src/__tests__/turn-credentials.test.ts)
**Coverage: Good**

Comprehensive tests for TURN credential generation and validation:
- Username format validation (timestamp:realm)
- HMAC-SHA1 password generation
- TTL enforcement
- Credential expiry handling
- Environment variable configuration

**Issue:** None significant.

---

### 1.3 Chat Events Integration (packages/backend/src/__tests__/chat-events.integration.test.ts)
**Coverage: Good**

Integration tests cover:
- Message sending between peers in same room
- Message rejection when peer not in room
- HTML sanitization (XSS prevention)
- Room-scoped message broadcasting
- Message length validation (2000 char limit)
- chat:history rejection for non-room members

**Issue:** Missing test for `chat:history` success case when peer IS in room.

---

### 1.4 Room Events Integration (packages/backend/src/__tests__/room-events.integration.test.ts)
**Coverage: Good**

Comprehensive Socket.IO integration tests for:
- Room creation with valid tokens
- Display name validation (empty, whitespace, length > 50)
- Room joining with valid/invalid/non-existent tokens
- Peer notification (peer-joined, peer-left, peer-list)
- Room destruction on last peer leave
- Socket disconnect handling

**Issue:** Missing test for `sdp:offer`, `sdp:answer`, and `ice-candidate` event handlers (WebRTC signaling).

---

### 1.5 TURN Events Integration (packages/backend/src/__tests__/turn-events.integration.test.ts)
**Coverage: Good**

Tests cover:
- TURN credential generation via callback
- TURN credential generation via socket event
- Rate limiting on HTTP endpoints
- Health endpoint with security/CORS headers

**Issue:** No test for the error path when `generateTurnCredentials()` throws (line 37-56 in turn-events.ts).

---

### 1.6 Rate Limiting (packages/backend/src/__tests__/rate-limit.test.ts)
**Coverage: Low - Critical Gap**

**Severity:** High

**Description:** Tests only verify that functions are defined, with no assertions on actual rate limiting behavior.

**Missing Tests:**
- Rate limit threshold enforcement (100 points per minute)
- 429 response after exceeding limit
- IP-based rate limiting isolation
- Block duration behavior

**Remediation:** Add tests that verify:
1. Request count tracking per IP
2. 429 status code returned when limit exceeded
3. Block duration is respected

---

### 1.7 Message Repository (packages/backend/src/__tests__/message-repository.test.ts)
**Coverage: Low - Placeholder Tests**

**Severity:** High

**Description:** Tests exist but contain no real assertions. The file shows:
```typescript
describe('Message Repository', () => {
  it('should create a message', async () => {
    expect(true).toBe(true);
  });
});
```

**Missing Tests:**
- `createMessage()` with valid input
- `createMessage()` with message > 2000 chars (should throw)
- `createMessage()` with XSS content (HTML sanitization)
- `getMessagesByRoom()` with messages
- `getMessagesByRoom()` empty room
- `validateMessage()` edge cases

**Remediation:** Implement actual tests for all repository functions.

---

### 1.8 Cleanup Service (packages/backend/src/__tests__/cleanup.test.ts)
**Coverage: Medium**

Tests cover:
- deleteOldMessages with custom hours
- deleteOldMessages default (24 hours)
- Error handling when database unavailable

**Missing Tests:**
- `performCleanup()` function
- `startCleanupScheduler()` / `stopCleanupScheduler()` lifecycle
- Interval configuration
- Message threshold enforcement

---

## 2. Frontend Test Coverage

### 2.1 useWebRTC Hook (packages/frontend/src/__tests__/use-webrtc.test.ts)
**Coverage: Good**

Tests cover:
- Initial state (null stream, media not ready)
- Control function availability
- Media auto-request
- Peer manager initialization on connection
- Peer connection for existing peers
- Toggle mute/camera
- Peer reconnection

**Issue:** Does not test error handling when `getUserMedia` fails.

---

### 2.2 Room Store (packages/frontend/src/__tests__/room-store.test.ts)
**Coverage: Good**

Comprehensive tests for all store operations:
- Initial state verification
- Connection/room/peer state updates
- Local stream management
- Audio/video track enabling
- Screen sharing state
- Peer add/remove/update
- Message management
- Reset functionality

**Issue:** None significant.

---

### 2.3 Media Module (packages/frontend/src/__tests__/media.test.ts)
**Coverage: Good**

Tests cover all media utility functions with mocked WebRTC APIs:
- getUserMedia success/failure
- getDisplayMedia with error handling
- Screen share support detection
- Media stream stopping
- Audio/video toggling
- Permissions API
- Device enumeration

**Issue:** None significant.

---

### 2.4 Peer Manager (packages/frontend/src/__tests__/peer-manager.test.ts)
**Coverage: Critical Gap - Placeholder Tests**

**Severity:** Critical

**Description:** Tests contain only interface documentation, no actual implementation testing:
```typescript
describe('PeerManager (basic)', () => {
  it('should have a working test setup', () => {
    expect(true).toBe(true);
  });
});
```

**Missing Tests (Critical for WebRTC app):**
- Peer connection establishment
- SDP offer/answer exchange
- ICE candidate handling
- Remote stream attachment
- Peer disconnection cleanup
- Error handling for failed connections
- Multiple peer management

**Remediation:** Implement comprehensive tests for the PeerManager class with mocked RTCPeerConnection.

---

### 2.5 Signalling Client (packages/frontend/src/__tests__/signalling.test.ts)
**Coverage: Critical Gap - Placeholder Tests**

**Severity:** Critical

**Description:** Tests only document expected event structures, no actual SignallingClient testing.

**Missing Tests (Critical):**
- Socket connection establishment
- Room creation/join/leave via signalling
- Turn credentials request
- SDP offer/answer forwarding
- ICE candidate forwarding
- Reconnection handling
- Error event handling

**Remediation:** Implement integration tests for SignallingClient with mocked socket.io.

---

### 2.6 useAudioLevel (packages/frontend/src/__tests__/use-audio-level.test.ts)
**Coverage: Critical Gap - Interface Tests Only**

**Severity:** High

**Description:** Tests only verify TypeScript interfaces, not actual hook behavior.

**Missing Tests:**
- Actual audio level detection
- speakingThreshold behavior
- Sampling interval handling
- smoothingFactor behavior
- Cleanup on unmount

**Remediation:** Implement tests with Web Audio API mocking.

---

## 3. E2E Test Coverage

### 3.1 Rooms E2E (e2e/rooms.spec.ts)
**Coverage: Medium**

Tests cover:
- Homepage loading with title and button
- Room creation with valid display name
- Room URL token format
- Joining existing room via token
- Error handling for invalid tokens
- Display name requirement

**Issue:** Tests are basic and rely on `page.waitForTimeout()` for async operations. No assertions on actual WebRTC connection state.

---

### 3.2 Chat E2E (e2e/chat.spec.ts)
**Coverage: Low**

**Severity:** High

**Description:** Only 3 tests exist, all minimal:
- Room page loads
- Homepage loads
- Navigation to room

**Missing Critical Tests:**
- Sending a chat message
- Receiving a chat message
- Message appears for all peers in room
- Chat history loading
- Empty message rejection
- XSS content rendering prevention

**Remediation:** Add comprehensive chat E2E tests.

---

### 3.3 Call E2E (e2e/call.spec.ts)
**Coverage: Low**

**Severity:** High

**Description:** Tests only verify URL navigation and page structure, not actual call functionality.

**Missing Critical Tests:**
- Local video stream display
- Remote peer video display (when multiple browsers)
- Mute/unmute functionality
- Camera toggle functionality
- Screen sharing flow

---

### 3.4 Accessibility E2E (e2e/accessibility.spec.ts)
**Coverage: Good**

Comprehensive accessibility tests covering:
- Keyboard navigation
- ARIA labels on buttons
- Form input labels
- Focus management
- Screen reader announcements

**Issue:** None significant.

---

### 3.5 Permission Denied E2E (e2e/permission-denied.spec.ts)
**Coverage:** Needs review of actual file content.

---

### 3.6 NAT Traversal E2E (e2e/nat-traversal.spec.ts)
**Coverage:** Needs review of actual file content.

---

## 4. Security Test Coverage

### 4.1 TURN Credential Theft Test (tests/security/turn-credential-theft.js)
**Coverage: Excellent**

Comprehensive security test covering:
- HMAC-SHA1 credential generation
- TTL enforcement (3600s)
- Username format validation
- Replay attack resistance
- Credential request without room session (spec gap detected)
- TURN secret management

**Issue:** Test correctly documents a WARN for the spec gap where TURN credentials can be requested without room membership.

---

### 4.2 Room Token Bruteforce Test (tests/security/room-token-bruteforce.js)
**Coverage: Excellent**

Comprehensive security tests covering:
- UUID v4 token format validation
- Entropy analysis (122 bits)
- Server-side token validation
- Rate limiting on join attempts
- Room enumeration resistance
- Ephemeral room lifecycle

**Issue:** None significant.

---

### 4.3 Load Tests (tests/load/)
**Coverage:** Limited

Files exist but content needs verification. Load testing for WebSocket and signalling under load is critical for production readiness.

---

## 5. Missing Integration Points

### 5.1 WebRTC Signaling Flow
**Severity:** Critical

**Description:** No integration tests cover the full WebRTC signaling flow:
1. Client A creates room
2. Client B joins room
3. Client A receives peer-list
4. Client A sends SDP offer to B
5. Client B receives SDP offer
6. Client B sends SDP answer to A
7. ICE candidates exchanged
8. P2P connection established

**Remediation:** Add integration test for complete WebRTC signaling flow.

---

### 5.2 Multi-Peer Room Scenarios
**Severity:** High

**Description:** No tests for rooms with 3+ peers. WebRTC mesh topology should be tested with multiple simultaneous connections.

**Missing Tests:**
- 3 peers joining same room
- Peer leaving in 3+ peer room
- Message broadcast to all peers in 3+ room

---

### 5.3 Error Recovery Scenarios
**Severity:** Medium

**Missing Tests:**
- Reconnection after socket disconnect
- Room state recovery on reconnect
- Media stream recovery after permission denial
- Turn credential refresh during active session

---

## 6. Test Quality Issues

### 6.1 Flaky Test Patterns
**Severity:** Medium

**Issue:** Multiple tests use `setTimeout` for async operations:
```typescript
await new Promise(resolve => setTimeout(resolve, 50));
```

This is brittle and can cause intermittent failures.

**Remediation:** Use proper event listeners or condition-based waits instead of arbitrary timeouts.

---

### 6.2 Missing Test Isolation
**Severity:** Low

**Issue:** Some backend integration tests share mutable state via module-level `rooms` Map.

**Example:** room-events.integration.test.ts modifies global room state between tests.

**Remediation:** Ensure each test is fully isolated with proper beforeEach/afterEach cleanup.

---

### 6.3 Weak Assertions
**Severity:** Medium

**Issue:** Several tests only check "truthy" values rather than specific expected values.

**Example:** `expect(url).toContain('/room/')` - should also validate UUID format.

**Remediation:** Use more specific assertions where possible.

---

## 7. Summary

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| Backend Unit Tests | 0 | 2 | 1 | 0 | 0 |
| Frontend Unit Tests | 2 | 1 | 0 | 0 | 0 |
| E2E Tests | 0 | 2 | 1 | 1 | 0 |
| Integration Coverage | 1 | 1 | 1 | 0 | 0 |
| Test Quality | 0 | 1 | 2 | 1 | 0 |
| **Total** | **3** | **7** | **5** | **2** | **0** |

---

## 8. Priority Remediation

### Critical (Blockers)
1. **Implement PeerManager tests** - Core WebRTC functionality untested
2. **Implement SignallingClient tests** - Critical signaling untested
3. **Add WebRTC signaling integration test** - Full flow untested
4. **Fix message-repository.test.ts** - Placeholder tests provide no coverage

### High
5. **Add chat E2E tests** - Chat functionality barely tested
6. **Add call E2E tests** - Core call functionality barely tested
7. **Implement useAudioLevel tests** - Hook functionality untested
8. **Fix rate-limit.test.ts** - Rate limiting behavior untested

### Medium
9. **Add multi-peer room tests** - 3+ peer scenarios untested
10. **Replace setTimeout with proper waits** - Flaky test pattern
11. **Add error recovery tests** - Reconnection scenarios untested

---

*Review completed by testing-review agent*

---

# Code Audit Findings - 2026-03-22

**Reviewer:** Claude Code Audit (4 parallel agents)
**Scope:** Full codebase audit (backend, frontend, WebRTC, infrastructure)
**Confidence Score:** 85-95/100

---

## Critical Severity

### 1. ICE Candidate Private IP Leakage

**Severity:** Critical
**Files:**
- `packages/shared/src/index.ts:312-319`
- `packages/backend/src/events/room-events.ts:252-271`

**Description:** SDP offers/answers are validated for private IPs via `validateSdpNoPrivateIPs()`, but ICE candidates bypass this check entirely. The `IceCandidateSchema` only validates structure, not content. The candidate string contains the actual IP address (`candidate:0 1 UDP 2112 192.168.1.100 12345 typ host...`) and is not validated for private IPs.

**Evidence:** Compare the `sdp:offer` handler (lines 194-220 in room-events.ts) which calls `validateSdpNoPrivateIPs(sdp.sdp)` against the `ice-candidate` handler (lines 252-271) which performs no such check.

**Remediation:** Add a `validateIceCandidateNoPrivateIPs()` function similar to `validateSdpNoPrivateIPs()` and call it in the `ice-candidate` handler after schema validation.

---

### 2. Screen Share Track Leak on Browser-Stopped Share

**Severity:** Critical
**File:** `packages/frontend/src/components/ControlBar.tsx:104-123`

**Description:** When a user stops screen sharing via the browser's built-in stop button (not the app's button), the `videoTrack.onended` handler restores the camera but **never stops the screen share stream's tracks**. The screen stream tracks continue running indefinitely, causing media resource leaks.

**Evidence:**
```typescript
if (videoTrack) {
  videoTrack.onended = async () => {
    // Restore camera but screenStream tracks are never stopped!
    const cameraStream = await getUserMedia({ video: true, audio: false });
    // ...
    setScreenSharing(false);
    // BUG: screenStream tracks still running
  };
}
```

**Remediation:** Before restoring the camera, stop all tracks on the screen share stream:
```typescript
if (localStream) {
  localStream.getTracks().forEach(track => track.stop());
}
```

---

### 3. Missing Diffie-Hellman Parameters

**Severity:** Critical
**File:** `nginx.conf:63`

**Description:** nginx.conf references `/etc/letsencrypt/live/peer/dhparam.pem` for TLS configuration but this file is never generated or mounted. Without custom DH parameters, nginx uses weaker default DH groups for exported cipher suites.

**Remediation:** Generate and mount DH parameters:
```bash
openssl dhparam -out dhparam.pem 2048
```
And add to nginx.conf:
```nginx
ssl_dhparam /etc/letsencrypt/live/peer/dhparam.pem;
```

---

## High Severity

### 4. Previous Stream Tracks Not Stopped on Screen Share Start

**Severity:** High
**File:** `packages/frontend/src/hooks/use-webrtc.ts:158-163`

**Description:** In `startScreenShare`, the previous stream is saved but its tracks are not stopped before starting screen share. The camera tracks continue running while screen share tracks also run, wasting resources.

**Evidence:**
```typescript
if (localStream) {
  previousStreamRef.current = localStream;  // Saved but NOT stopped
}
const displayStream = await getDisplayMedia();
```

**Remediation:** Stop the previous stream's tracks before acquiring display media.

---

### 5. Camera Stream Ref Never Cleaned Up

**Severity:** High
**File:** `packages/frontend/src/components/ControlBar.tsx:55,90`

**Description:** `cameraStreamRef.current` stores the camera stream when screen sharing starts but is never cleared when screen sharing ends. This holds a reference to the old camera stream preventing garbage collection.

**Remediation:** Clear `cameraStreamRef.current = null` when screen sharing stops.

---

### 6. Peer remoteStream Not Cleared on Disconnect

**Severity:** High
**File:** `packages/frontend/src/lib/webrtc/peer-manager.ts:233-244`

**Description:** When a peer disconnects, `handlePeerDisconnected` closes the connection and removes the peer from the map, but does not clear `peer.remoteStream`. The store's `removePeer` only removes the peer from state, not the stream reference.

**Evidence:**
```typescript
private handlePeerDisconnected(peerId: string): void {
  const peer = this.peers.get(peerId);
  if (peer) {
    peer.connection.close();
    this.peers.delete(peerId);
  }
  // BUG: peer.remoteStream is not set to undefined
  useRoomStore.getState().removePeer(peerId);
}
```

**Remediation:** Set `peer.remoteStream = undefined` before closing the connection.

---

### 7. Connection State 'closed' Not Handled

**Severity:** High
**File:** `packages/frontend/src/lib/webrtc/peer-manager.ts:141-147`

**Description:** The connection state change handler only handles `disconnected` and `failed` states. If `connection.close()` is called directly, the state becomes `closed` and `handlePeerDisconnected` is not called, potentially leaving dangling peer entries.

**Evidence:**
```typescript
connection.onconnectionstatechange = () => {
  if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed') {
    this.handlePeerDisconnected(peerId);
  }
  // Missing: connectionState === 'closed'
};
```

**Remediation:** Also handle `connectionState === 'closed'`.

---

### 8. Timing-Safe Comparison Not Used for TURN Password

**Severity:** High
**File:** `packages/backend/src/services/turn-credentials.ts:67-84`

**Description:** Password comparison uses `===` instead of `crypto.timingSafeEqual`, vulnerable to timing attacks that could allow attackers to guess valid TURN credentials by measuring response times.

**Evidence:**
```typescript
return password === expectedPassword;
```

**Remediation:** Replace with constant-time comparison:
```typescript
if (password.length !== expectedPassword.length) {
  return false;
}
return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword));
```

---

## Medium Severity

### 9. Plaintext TURN Port 3478 Exposed in Development

**Severity:** Medium
**File:** `docker-compose.yml:58-60`

**Description:** The development docker-compose exposes port 3478 (plaintext STUN/TURN) to all interfaces. Production only exposes TLS port 5349. This is inconsistent with the production configuration.

**Evidence:**
```yaml
coturn:
  ports:
    - "3478:3478"
    - "3478:3478/udp"
```

**Remediation:** Either remove the plaintext port exposure or bind it to localhost only (`127.0.0.1:3478:3478`).

---

### 10. CSP Contains unsafe-inline and unsafe-eval

**Severity:** Medium
**Files:**
- `nginx.conf:78`
- `nginx-frontend.conf:32`

**Description:** Content Security Policy allows `'unsafe-inline'` and `'unsafe-eval'` which significantly weakens XSS protection.

**Evidence:**
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...";
```

**Remediation:** Remove `'unsafe-eval'` from both configurations. Use nonces or hashes for inline scripts if needed.

---

### 11. HSTS Header Missing in nginx-frontend.conf

**Severity:** Medium
**File:** `nginx-frontend.conf`

**Description:** The main nginx.conf has HSTS header configured, but the frontend-specific config used as the default server does not include it.

**Remediation:** Add to nginx-frontend.conf server block:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

### 12. certbot Uses latest Tag

**Severity:** Medium
**File:** `docker-compose.production.yml:115`

**Description:** The certbot image uses `latest` tag instead of a versioned tag, breaking reproducible deployments.

**Evidence:**
```yaml
certbot:
  image: certbot/certbot:latest
```

**Remediation:** Pin to specific version:
```yaml
image: certbot/certbot:v2.11.0
```

---

### 13. Room Token Logged on Every Chat Message

**Severity:** Medium
**File:** `packages/frontend/src/lib/signalling.ts:224`

**Description:** The room token is logged on every chat send operation, potentially exposing room tokens in development logs and production log aggregation systems.

**Evidence:**
```typescript
console.log('sendChatMessage called, roomToken:', roomToken, 'socket id:', this.socket?.id);
```

**Remediation:** Remove roomToken from log output or use a non-sensitive reference (e.g., token prefix/suffix).

---

### 14. Development Docker Compose Lacks Security Hardening

**Severity:** Medium
**File:** `docker-compose.yml`

**Description:** The development docker-compose lacks security options that production has:
- No `read_only: true` filesystem restriction
- No `security_opt: no-new-privileges:true`
- No resource limits (cpus, memory)
- No user specification for services

**Remediation:** Apply the same security hardening from production compose to development compose.

---

### 15. coturn Image Tag Not Pinned to Digest

**Severity:** Low
**File:** `docker-compose.production.yml:56`

**Description:** The coturn image uses `coturn/coturn:4.6.2` without an exact digest pin, which does not guarantee reproducible builds.

**Remediation:** Pin to exact digest:
```yaml
image: coturn/coturn:4.6.2@sha256:<exact-digest>
```

---

### 16. TURN URL Scheme Not Validated in Frontend

**Severity:** Medium
**File:** `packages/frontend/src/lib/webrtc/peer-manager.ts:291-312`

**Description:** TURN server URLs from the server are used without validating that they use the `turn:` or `turns:` scheme. A malicious or compromised server could provide `http://` URLs that would cause WebRTC to attempt routing traffic through an unintended server.

**Remediation:** Add URL scheme validation before using TURN URLs:
```typescript
const validScheme = url.startsWith('turn:') || url.startsWith('turns:');
if (!validScheme) {
  console.warn('Invalid TURN URL scheme:', url);
  continue;
}
```

---

## Low Severity

### 17. X-XSS-Protection Header Deprecated

**Severity:** Low
**File:** `nginx.conf:74`

**Description:** The `X-XSS-Protection: 1; mode=block` header is deprecated and can be used to introduce XSS vulnerabilities in some browsers. Modern browsers support CSP which makes this header unnecessary.

**Remediation:** Remove the X-XSS-Protection header. XSS protection is better handled via CSP.

---

### 18. CORS Defaults to localhost in Production

**Severity:** Low
**File:** `packages/backend/src/middleware/security.ts:60`

**Description:** CORS configuration defaults to `'http://localhost:5173'` when `CORS_ORIGIN` environment variable is not set. If misconfigured in production, cross-site connections could be permitted.

**Remediation:** Add validation to ensure `CORS_ORIGIN` is a valid origin when `NODE_ENV=production`.

---

### 19. Rate Limiting Uses req.ip Without trust proxy

**Severity:** Low
**File:** `packages/backend/src/middleware/rate-limit.ts:22-23`

**Description:** The HTTP rate limiting middleware uses `req.ip` without configuring Express's `trust proxy` setting. When behind a reverse proxy, `req.ip` may return the proxy's IP rather than the client's actual IP.

**Remediation:** Configure `trust proxy` in Express when behind a reverse proxy:
```typescript
app.set('trust proxy', 1);
```

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 7 |
| Low | 3 |

### Top Priority Items

1. **ICE candidate private IP validation** - Currently SDP is validated but ICE candidates bypass this check
2. **Screen share track leak** - Browser-stopped screen share leaves tracks running
3. **Diffie-Hellman parameters** - nginx references a file that doesn't exist
4. **Stream cleanup on screen share** - Previous stream tracks not stopped
5. **Timing-safe password comparison** - TURN password validation vulnerable to timing attacks

---

## Positive Findings

The following are implemented correctly:

- **SQL injection protection** via parameterized queries
- **Zod validation** on all socket payloads
- **Room membership checks** on all sensitive events
- **Media stream cleanup** in `use-webrtc.ts` (though not in `ControlBar.tsx`)
- **Non-root users** in Docker containers
- **DTLS-SRTP encryption** enabled by default in WebRTC
- **Graceful shutdown** handling in backend
- **Soft delete** for room messages

---

*Review completed by Claude Code audit agents - 2026-03-22*
