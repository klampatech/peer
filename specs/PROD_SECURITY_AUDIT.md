# Production Security Audit Report

**Target**: http://204.168.181.142
**Date**: 2026-03-23
**Status**: IN PROGRESS

---

## Infrastructure Security

### Findings

#### 1. Missing TLS Termination in Nginx
- **Severity**: CRITICAL
- **Affected file/component**: `nginx.conf`, `docker-compose.production.yml`
- **Description**: The main nginx configuration listens on HTTP port 80 only. TLS certificates are mounted at `/etc/ssl/peer` but no `listen 443 ssl` block exists. The comment states "HTTPS/TLS termination is handled at the load balancer or CDN level," but in a bare-metal deployment at `http://204.168.181.142`, there is no upstream load balancer or CDN — traffic goes directly to nginx. HSTS headers are set (`Strict-Transport-Security`), yet no HTTPS endpoint is configured. This means the HSTS header actively misleads clients into using HTTPS that does not exist on this server.
- **Remediation**: Add a TLS server block to `nginx.conf`: `listen 443 ssl;` with `ssl_certificate /etc/ssl/peer/fullchain.pem;` and `ssl_certificate_key /etc/ssl/peer/privkey.pem;`. Add a redirect from port 80 to 443.

---

#### 2. Missing USER Directive in Frontend Dockerfile (Root Container)
- **Severity**: HIGH
- **Affected file/component**: `packages/frontend/Dockerfile` (used by root `Dockerfile.frontend`)
- **Description**: The frontend Dockerfile does not create a non-root user or set a `USER` directive. The nginx container runs as root by default. In a compromised container, root access provides full system access including the ability to install packages, modify network configurations, and escape via container runtime vulnerabilities.
- **Remediation**: Add a non-root user to the frontend Dockerfile:
  ```dockerfile
  RUN adduser -D -g '' nginx && \
      chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /etc/nginx/conf.d
  USER nginx
  ```

---

#### 3. Missing USER Directive in Root-level Dockerfile.frontend
- **Severity**: HIGH
- **Affected file/component**: `Dockerfile.frontend`
- **Description**: This Dockerfile (separate from `packages/frontend/Dockerfile`) builds the frontend and serves it via nginx but has no `USER` directive. If this Dockerfile is used in any pipeline or deployment, it will run the nginx process as root.
- **Remediation**: Add user creation and `USER` directive, or ensure only the multi-stage `packages/frontend/Dockerfile` is used in all deployment paths.

---

#### 4. Coturn Port Exposed Directly to Internet Without IP Allowlist
- **Severity**: HIGH
- **Affected file/component**: `docker-compose.production.yml`
- **Description**: The coturn container binds ports 5349/TCP and 5349/UDP directly to the host interface (`0.0.0.0:5349`). This exposes the TURN server to the entire internet without any IP-based access restrictions. While TURN credentials provide application-layer protection, open TURN servers are a well-known vector for amplification attacks and third-party relay abuse (attackers relaying traffic through your TURN server).
- **Remediation**: Add `no-loopback-peers` and consider restricting at the network level (iptables/firewall) to only allow-known client IP ranges. Monitor for abuse patterns. Alternatively, expose coturn only to the internal `turn-network` and use a network firewall rule to restrict inbound UDP/TCP 5349.

---

#### 5. Coturn Entrypoint Script Runs as Root with `sed -i` on Root-Owned Config
- **Severity**: HIGH
- **Affected file/component**: `coturn-entrypoint.sh`
- **Description**: The entrypoint script runs as root inside the container and uses `sed -i` to substitute the `TURN_SECRET` environment variable into `/etc/coturn/turnserver.conf`. While this substitution is necessary, `sed -i` with an environment variable is a command injection risk if `TURN_SECRET` contains special characters (e.g., `/`, `&`). The secret value briefly exists in the container filesystem before coturn reads it.
- **Remediation**: Use a template approach with `envsubst` (e.g., `turnserver.conf.template`), or validate that `TURN_SECRET` contains only safe characters before substitution. Coturn 4.6+ supports reading the secret from an environment variable directly — replace the sed-based substitution with native env support.

---

#### 6. Missing Rate Limiting in Nginx Configuration
- **Severity**: MEDIUM
- **Affected file/component**: `nginx.conf`
- **Description**: No `limit_req_zone` or `limit_conn_zone` directives are defined in the nginx configuration. Without rate limiting, the server is vulnerable to brute-force attacks, volumetric DDoS attacks, and credential stuffing attempts against any authentication endpoints proxied through nginx.
- **Remediation**: Add rate limiting directives in the `http` block of `nginx.conf`:
  ```nginx
  limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
  ```
  Apply to location blocks: `limit_req zone=api_limit burst=20 nodelay;`

---

#### 7. Insecure X-Forwarded-Proto Header (Hardcoded as `http`)
- **Severity**: MEDIUM
- **Affected file/component**: `nginx.conf`
- **Description**: The `proxy_set_header X-Forwarded-Proto http;` directive is hardcoded to `http` instead of using `$scheme`. If TLS is properly terminated at nginx (once issue #1 is fixed), the backend will incorrectly believe all requests are HTTP, potentially causing mixed-content issues, insecure cookie flags, and broken HSTS enforcement in the application layer.
- **Remediation**: Change to `proxy_set_header X-Forwarded-Proto $scheme;` once TLS termination is properly configured.

---

#### 8. Weak Content Security Policy
- **Severity**: MEDIUM
- **Affected file/component**: `nginx.conf`, `nginx-frontend.conf`
- **Description**: Both nginx configurations include `'unsafe-inline'` in both `script-src` and `style-src` CSP directives. `unsafe-inline` allows inline `<script>` tags and inline `style` attributes, significantly weakening XSS protection. Additionally, `connect-src` and `img-src` allow `http:` and `data:` schemes, which could enable data exfiltration or MIME-type confusion attacks.
- **Remediation**: Remove `unsafe-inline` and use nonces or hashes for inline scripts/styles. Replace `http:` in `connect-src` and `img-src` with specific HTTPS origins or remove them entirely if not needed.

---

#### 9. certbot Container Uses `latest` Tag
- **Severity**: MEDIUM
- **Affected file/component**: `docker-compose.production.yml`
- **Description**: The certbot service uses `image: certbot/certbot:latest`. The `latest` tag is mutable and can change between pulls, causing non-reproducible builds and potential security issues if a newer (potentially compromised or buggy) version is pulled. This is especially risky for a certificate management tool that handles private key material.
- **Remediation**: Pin to an exact version tag: `image: certbot/certbot:v3.0.1` (or current stable). Regularly update the pinned version in a controlled manner.

---

#### 10. Missing Health Checks on Multiple Containers
- **Severity**: MEDIUM
- **Affected file/component**: `docker-compose.production.yml` (nginx, certbot, frontend)
- **Description**: The nginx, certbot, and frontend containers lack health check definitions. Without health checks, orchestrators cannot automatically restart unhealthy containers, leading to prolonged service outages. The backend and coturn containers do have health checks defined.
- **Remediation**: Add `healthcheck` definitions to nginx, frontend, and certbot services. For nginx: `test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]` (ensure a `/health` endpoint exists or use nginx's stub status module).

---

#### 11. Coturn Listening on Both TCP and UDP Port 5349
- **Severity**: MEDIUM
- **Affected file/component**: `docker-compose.production.yml`, `turnserver.conf`
- **Description**: The coturn configuration exposes both TCP and UDP on port 5349. DTLS-over-UDP on port 5349 is the standard for TURN-over-TLS. Exposing TCP 5349 increases the attack surface unnecessarily. Additionally, `listening-port=3478` is also configured in `turnserver.conf` but not exposed, which is fine.
- **Remediation**: Remove `- "5349:5349/tcp"` and only expose UDP 5349 for TURN-over-TLS (DTLS).

---

#### 12. Missing Proxy Timeouts in Nginx Configuration
- **Severity**: LOW
- **Affected file/component**: `nginx.conf`
- **Description**: The backend and WebSocket proxy configurations lack explicit `proxy_connect_timeout`, `proxy_send_timeout`, and `proxy_read_timeout` directives (only `proxy_read_timeout 86400` is set for WebSocket). Default nginx timeouts may be too permissive for some endpoints and can allow slow-read attacks.
- **Remediation**: Set appropriate timeouts for each location block:
  ```nginx
  proxy_connect_timeout 60s;
  proxy_send_timeout 60s;
  proxy_read_timeout 120s;
  ```

---

#### 13. Coturn Static Auth Secret Relies on Environment Variable Substitution
- **Severity**: LOW
- **Affected file/component**: `coturn-entrypoint.sh`, `turnserver.conf`
- **Description**: The `${TURN_SECRET}` placeholder in `turnserver.conf` is substituted at container startup via `sed` in the entrypoint script. The secret value briefly exists in the container filesystem before coturn reads it. Coturn's native environment variable support would be more secure than file-based substitution.
- **Remediation**: Coturn 4.6+ supports reading the secret from an environment variable directly. Replace the sed-based substitution with native env support or use `static-auth-secretfile` pointing to a tmpfs-mounted secret file.

---

### Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 4 |
| MEDIUM   | 5 |
| LOW      | 3 |
| **Total**| **13** |

---

## Backend Security

### F1 — TURN Credentials Issued Without Room Membership Validation

**Severity**: CRITICAL

**Location**: `packages/backend/src/events/turn-events.ts` (lines 37–98), `packages/shared/src/index.ts` (TurnRequestSchema, line 273)

**Description**: The `turn:request` handler accepts an optional payload. When `roomToken` is absent from the payload, the handler falls through to a secondary check that verifies the socket has joined "any" Socket.IO room—but this includes rooms the socket was added to by other operations, not rooms the user legitimately belongs to. An attacker with a valid Socket.IO connection can obtain TURN relay credentials without authenticating to a specific room, enabling anonymous relay usage at the application's expense.

**Evidence**:
```typescript
// turn-events.ts line 57 — only runs if roomToken was provided
const roomToken = validation.data?.roomToken ? createRoomToken(validation.data.roomToken) : undefined;
if (roomToken && !isPeerInRoom(roomToken, peerId)) { /* reject */ }

// Lines 78–97 — fallback checks ANY socket room membership, not app-level room membership
const rooms = socketRooms.filter((room) => room !== socket.id);
if (rooms.length === 0) { /* reject */ }
```

**Remediation**: Make `TurnRequestSchema` require a `roomToken` field. Enforce `isPeerInRoom(roomToken, socket.id)` as the sole authorization check. Remove the "any room" fallback entirely.

---

### F2 — SQLite Database Written to Disk Every 30 Seconds Without Transaction Bounding

**Severity**: HIGH

**Location**: `packages/backend/src/db/index.ts` (lines 44–49)

**Description**: The database save uses an unconditional `setInterval` that calls `saveDatabase()` every 30 seconds. The write is not awaited and there is no transaction wrapping. If the process crashes between saves, up to 30 seconds of chat messages can be lost silently. The `DB_PATH` defaults to a predictable relative path (`../../data/peer.db`), which could aid attackers with filesystem access.

**Evidence**:
```typescript
// db/index.ts line 45–49
setInterval(() => {
  if (db) { saveDatabase(); }
}, 30000); // Save every 30 seconds
```

**Remediation**: Enable SQLite WAL mode for crash recovery. Wrap related writes in transactions. Add a `DB_SAVE_INTERVAL_MS` environment variable. Add startup validation that the data directory is on a reliable filesystem.

---

### F3 — Database Write Return Values Not Checked

**Severity**: MEDIUM

**Location**: `packages/backend/src/repositories/message-repository.ts` (lines 42–46, 96)

**Description**: All SQL writes use parameterized queries (correct), but the return values from `db.run()` are not captured. sql.js's `db.run()` returns `{ changes: number }`. If a write fails silently (constraint violation, disk full), the application continues without error, and callers may believe messages were persisted when they were not.

**Evidence**:
```typescript
// message-repository.ts line 42–46
db.run(
  `INSERT INTO messages ...`,
  [id, params.roomToken, params.peerId, params.displayName, sanitizedMessage, timestamp]
);
// No return value check
```

**Remediation**: Check `db.run()` return values. Assert `changes > 0` for inserts and updates. Throw on failure so the caller can return an error to the client.

---

### F4 — No Per-Socket Event Rate Limiting

**Severity**: MEDIUM

**Location**: `packages/backend/src/middleware/rate-limit.ts`

**Description**: The Socket.IO rate limiter applies only at connection time (10 per IP per minute). After a socket connects, there is no rate limiting on individual events. An attacker with one valid connection can flood `chat:message`, `room:join`, `sdp:offer`, or `ice-candidate` events without throttling, enabling chat spam and DoS against room state.

**Evidence**:
```typescript
// rate-limit.ts line 56–67 — only runs at connection handshake
io.use((socket: Socket, next: (err?: Error) => void) => {
  socketRateLimiter.consume(ip).then(() => next()).catch(() => next(new Error('Too many connection attempts')));
});
// No per-event rate limiters inside connection handlers
```

**Remediation**: Add per-socket rate limiters keyed on `socket.id` for: `chat:message` (1/sec), WebRTC signaling events (10/sec), and `room:join`/`room:create` (5/min).

---

### F5 — TURN Secret Has No Length/Entropy Validation

**Severity**: MEDIUM

**Location**: `packages/backend/src/services/turn-credentials.ts` (lines 3–8)

**Description**: `TURN_SECRET` is only checked for existence. A 4-character secret (e.g., `abcd`) passes the `if (!TURN_SECRET)` check but is trivially brute-forceable. Coturn's `static-auth-secret` uses this directly as an HMAC key.

**Evidence**:
```typescript
const TURN_SECRET = process.env.TURN_SECRET;
if (!TURN_SECRET) {
  throw new Error('TURN_SECRET environment variable is required');
}
// No minimum length or entropy check
```

**Remediation**: Add startup validation: require `TURN_SECRET.length >= 32` and contains mixed character classes. Fail fast if the secret is insufficient.

---

### F6 — CORS Origin Defaults to `localhost:5173`

**Severity**: MEDIUM

**Location**: `packages/backend/src/middleware/security.ts` (line 60), `docker-compose.production.yml` (line 11)

**Description**: The CORS middleware falls back to `http://localhost:5173` if `CORS_ORIGIN` is unset. While `docker-compose.production.yml` sets it explicitly, manual deployments without the env var would allow any `localhost:5173` origin to connect, effectively disabling origin validation.

**Evidence**:
```typescript
// security.ts line 60
const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
```

**Remediation**: Throw at startup if `CORS_ORIGIN` is not set and `NODE_ENV === 'production'`. Default to rejecting cross-origin requests in production.

---

### F7 — Room Token Derived from `socket.rooms` Enumeration in WebRTC Handlers

**Severity**: MEDIUM

**Location**: `packages/backend/src/events/room-events.ts` (lines 217, 260, 296)

**Description**: The `sdp:offer`, `sdp:answer`, and `ice-candidate` handlers identify the room by enumerating `socket.rooms` and selecting the first entry matching the UUID regex. This relies on Socket.IO's internal room state rather than the application's authoritative `rooms.ts` state. If Socket.IO's internal state diverges from application state (e.g., reconnection race), authorization decisions could be based on stale or incorrect room data.

**Evidence**:
```typescript
// room-events.ts line 217
const roomToken = Array.from(socket.rooms).find(room => isRoomToken(room));
// Then checks application state at line 224–228
const room = getRoom(roomToken as Room['token']);
if (!room || !room.peers.has(targetPeerId)) { /* reject */ }
```

**Remediation**: Store the room token in `socket.data.roomToken` during `room:join`/`room:create` and use it directly in all handlers. Eliminate the `socket.rooms` enumeration pattern.

---

### F8 — `req.ip` Derived from `X-Forwarded-For` for Rate Limiting

**Severity**: MEDIUM

**Location**: `packages/backend/src/middleware/rate-limit.ts` (line 23)

**Description**: The HTTP rate limiter uses `req.ip` (Express derives from `X-Forwarded-For`). If nginx does not set `X-Forwarded-For` correctly, or if the backend is accessed directly, a client-provided `X-Forwarded-For` header could bypass IP-based rate limiting. Additionally, `req.socket.remoteAddress` is used as a fallback without `trust proxy` being configured in Express.

**Evidence**:
```typescript
const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
```

**Remediation**: Set `app.set('trust proxy', 1)` in Express. Configure nginx to always set `X-Forwarded-For`. Add defensive validation rejecting `X-Forwarded-For` with multiple entries.

---

### F9 — Metrics Endpoint Exposes Internal Operational State

**Severity**: LOW

**Location**: `packages/backend/src/routes/metrics.ts`

**Description**: The `/metrics` endpoint returns connection counts, room counts, peer counts, chat message totals, and request rates without authentication. This provides operational intelligence to any client that can reach the endpoint, aiding reconnaissance.

**Evidence**: Endpoint returns raw Prometheus-format metrics including `socketio_connections_total`, `socketio_rooms_active`, `chat_messages_total` — all without auth.

**Remediation**: Restrict `/metrics` to internal network access via nginx ACL, or add HTTP basic auth with credentials from environment variables.

---

### F10 — Version Exposed in Health Endpoint via `npm_package_version`

**Severity**: LOW

**Location**: `packages/backend/src/routes/health.ts` (line 7)

**Description**: The health endpoint exposes `process.env.npm_package_version` which could return `undefined` if unset, leaking "undefined" as the version string. Exact version disclosure aids attackers in targeting known vulnerabilities.

**Evidence**:
```typescript
const VERSION = process.env.npm_package_version || '1.0.0';
```

**Remediation**: Set version at build time via a properly injected constant. Use a fallback of `'unknown'` rather than a hardcoded default.

---

### F11 — Display Name Not Sanitized Before Broadcast

**Severity**: LOW

**Location**: `packages/backend/src/events/room-events.ts` (lines 74, 77, 127, 130, 142)

**Description**: The `displayName` field is stored and broadcast via `peer-joined`, `peer-list`, and chat messages without sanitization. A malicious user could include ANSI terminal escape codes, zero-width characters, or homoglyph attacks to confuse or mislead other users.

**Evidence**: `displayName` is used directly in event payloads:
```typescript
socket.to(token).emit('peer-joined', {
  peerId: socket.id,
  displayName: displayName.trim(), // No sanitization
});
```

**Remediation**: Sanitize `displayName` before broadcast: strip ANSI escape codes, zero-width characters, and control characters. Enforce a whitelist of printable Unicode characters.

---

### F12 — Duplicate Message Emission in Chat Events

**Severity**: LOW

**Location**: `packages/backend/src/events/chat-events.ts` (lines 101–107)

**Description**: Each chat message is emitted twice: once via `io.to(roomTokenTyped).emit()` (includes the sender) and again via `socket.emit()`. The comment explains this is for multi-tab reliability, but it provides no deduplication, so concurrent submissions from multiple tabs produce duplicate database entries and UI messages.

**Evidence**:
```typescript
io.to(roomTokenTyped).emit('chat:message', chatMessage);  // includes sender
socket.emit('chat:message', chatMessage);                  // duplicates
```

**Remediation**: Remove the duplicate `socket.emit()`. Rely on `io.to()` alone. If multi-tab reliability is needed, implement client-side deduplication using message IDs.

---

### F13 — No Maximum Peer Count Per Room

**Severity**: LOW

**Location**: `packages/backend/src/rooms.ts`, `packages/backend/src/events/room-events.ts`

**Description**: There is no limit on peers per room. An attacker can programmatically create rooms and fill each with unlimited peers, exhausting server memory. Coturn has `total-quota=100`, but the signaling server has no corresponding guard.

**Evidence**: `joinRoom()` in `rooms.ts` has no size check.

**Remediation**: Add a configurable `MAX_PEERS_PER_ROOM` (default: 10) and check `room.peers.size` before adding a peer. Return a `ROOM_FULL` error when the limit is reached.

---

### F14 — Express Server Binds to `0.0.0.0` in Production Without Firewall

**Severity**: LOW

**Location**: `packages/backend/src/index.ts` (line 6)

**Description**: The backend binds to `0.0.0.0` by default. While `docker-compose.production.yml` uses a Docker network for isolation, there is no `iptables` or similar host-level firewall preventing direct access to port 3000 if the container port is accidentally exposed.

**Evidence**:
```typescript
const HOST = process.env.HOST || '0.0.0.0';
```

**Remediation**: Default `HOST` to `127.0.0.1` in production, relying on nginx as the only entrypoint. Expose only the nginx ports (80, 443) externally.

---

### F15 — Custom HTML Sanitization for Chat Messages

**Severity**: LOW

**Location**: `packages/backend/src/repositories/message-repository.ts` (lines 127–137)

**Description**: The `sanitizeHtml()` function uses hand-written character replacement rather than a well-maintained library. It handles the five primary XSS vectors but does not cover Unicode encoding attacks, SVG/MathML injection, or event handlers in allowed contexts.

**Evidence**:
```typescript
function sanitizeHtml(input: string): string {
  const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', ... };
  return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}
```

**Remediation**: Replace with `sanitize-html` or jsdom+DOMPurify. Configure it to strip all HTML tags, allowing only plain text.

---

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 1 |
| MEDIUM | 6 |
| LOW | 7 |

**Immediate Priority**: Address F1 (TURN credentials without room membership) — this is the highest-risk finding and allows anonymous relay usage. F2 (database persistence gap) should be addressed before production traffic increases.

---

## Frontend Security

### 1. Content Security Policy (CSP) Allows unsafe-inline

**Severity**: HIGH

**Location**: `nginx-frontend.conf:17` and `nginx.conf:55`

**Description**: The Content-Security-Policy header allows `'unsafe-inline'` for both `script-src` and `style-src`. This significantly weakens XSS protection by allowing inline scripts and styles to execute, bypassing CSP protections.

**Evidence**:
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; ...";
```

**Remediation**: Remove `'unsafe-inline'` from CSP directives. For React applications, inline styles should be converted to CSS classes, and if any inline scripts are needed for legitimate purposes (e.g., Google Fonts loading), use nonces or hashes. Modern React builds with Vite automatically hash inline scripts.

---

### 2. X-Forwarded-Proto Set to HTTP Instead of HTTPS

**Severity**: MEDIUM

**Location**: `nginx.conf:71`, `nginx.conf:83`

**Description**: When proxying to backend, `X-Forwarded-Proto` is hardcoded to `http`. In production behind a TLS-terminating reverse proxy, this prevents the backend from correctly identifying that the original request was over HTTPS. This can cause security issues if the application makes decisions based on protocol.

**Evidence**:
```nginx
proxy_set_header X-Forwarded-Proto http;
```

**Remediation**: Change to `proxy_set_header X-Forwarded-Proto $scheme;` to dynamically set the protocol based on the actual request scheme, or use `$http_x_forwarded_proto` if the upstream load balancer passes the original protocol.

---

### 3. Chat Message Rendering Without Explicit Sanitization

**Severity**: MEDIUM

**Location**: `packages/frontend/src/components/MessageList.tsx:57`

**Description**: Chat messages are rendered directly via React JSX (`{msg.message}`). While React escapes content by default, this pattern relies on implicit escaping without defense-in-depth. If the backend stores unsanitized messages and the frontend rendering approach changes, XSS could become possible.

**Evidence**:
```tsx
<div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ...`}>
  {msg.message}
</div>
```

**Remediation**: Add explicit sanitization using a library like `DOMPurify` before rendering user-generated content. Consider creating a `SanitizedText` component that wraps user messages with sanitization as a defense-in-depth measure.

---

### 4. Room Token Exposed in URL

**Severity**: LOW

**Location**: `packages/frontend/src/pages/RoomPage.tsx:13`, `packages/frontend/src/App.tsx:30`

**Description**: Room tokens (which grant access to video calls) are passed via URL path (`/room/:token`). This exposes the token in browser history, server access logs, referrer headers, and browser autofill suggestions.

**Evidence**:
```tsx
// RoomPage.tsx:13
const { token } = useParams<{ token: string }>();

// App.tsx:30
<Route path="/room/:token" element={<RoomPage displayName={displayName} />} />
```

**Remediation**: Consider transitioning to session-cookie-based authentication for room access. If URL tokens are necessary, implement short token lifetimes and provide a "leave room" function that invalidates the token server-side.

---

### 5. No CSRF Protection for Socket.IO Connections

**Severity**: LOW

**Location**: `packages/frontend/src/lib/signalling.ts`

**Description**: Socket.IO connections lack CSRF token protection. WebSocket-based applications typically rely on the Same-Origin Policy, but CSRF tokens provide defense-in-depth for state-changing operations (e.g., joining rooms, sending messages).

**Evidence**: No CSRF token generation or validation found in `SignallingClient` class.

**Remediation**: Implement origin validation on the server-side and consider adding Socket.IO middleware that validates a CSRF token for room-joining and message-sending operations.

---

### 6. Public Google STUN Servers Used

**Severity**: LOW

**Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:6-9`

**Description**: Public Google STUN servers (`stun.l.google.com:19302`) are used for NAT traversal. Google can potentially observe who is connecting to the service and infer IP addresses of participants.

**Evidence**:
```javascript
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
```

**Remediation**: Consider using self-hosted STUN servers or a commercial TURN service with privacy guarantees. The production `coturn` service already exists but STUN requests still go to Google.

---

### 7. DTLS-SRTP Encryption Not Verifiable from Frontend

**Severity**: INFO

**Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts`

**Description**: DTLS-SRTP encryption for media streams cannot be verified from frontend code alone. The `RTCPeerConnection` configuration doesn't explicitly enable or disable DTLS, so WebRTC relies on browser defaults.

**Evidence**:
```javascript
const connection = new RTCPeerConnection({
  iceServers,
  iceTransportPolicy: 'all',
});
```

**Remediation**: Verify server-side that DTLS-SRTP is enforced. Consider adding explicit configuration if supported: `certificates` array for certificate pinning, and verify `connection.getStats()` shows `dtlsEncryption` is enabled for media channels.

---

### 8. TURN Credential Handling - SECURE

**Severity**: INFO

**Location**: `packages/frontend/src/lib/signalling.ts:141-151`, `packages/frontend/src/lib/webrtc/peer-manager.ts:291-312`

**Description**: TURN credentials are received from the server and validated before use. Credentials are checked for existence before being applied, which prevents using empty/malformed credentials.

**Evidence**:
```typescript
// In peer-manager.ts
setTurnServers(credentials: TurnCredentials): void {
  if (!credentials.username || !credentials.password || credentials.urls.length === 0) {
    console.warn('Invalid TURN credentials provided');
    return;
  }
  // ...
}
```

**Assessment**: This pattern is secure. Short-lived TURN credentials from the server is the recommended approach.

---

### 9. Permissions-Policy Header - Camera/Microphone Only in Production

**Severity**: INFO

**Location**: `nginx-frontend.conf:15`

**Description**: The production Permissions-Policy header enables camera and microphone for the app (`camera=(self), microphone=(self)`), which is required for WebRTC. This is correct and follows least-privilege principles.

**Evidence**:
```nginx
add_header Permissions-Policy "camera=(self), microphone=(self), display-capture=(self), ...";
```

**Assessment**: Correct configuration.

---

### 10. WebSocket Transport Falls Back to HTTP

**Severity**: LOW

**Location**: `packages/frontend/src/lib/signalling.ts:41-42`, `packages/frontend/src/pages/HomePage.tsx:46-48`

**Description**: Socket.IO is configured to use `['websocket', 'polling']` transports. In environments where WebSocket is blocked, it falls back to HTTP polling. While this works, WebSocket over HTTPS (WSS) should be preferred in production.

**Evidence**:
```typescript
this.socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  // ...
});
```

**Remediation**: Ensure the production load balancer/proxy properly forwards WebSocket connections and that `VITE_API_URL` uses `wss://` in production.

---

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 2 |
| LOW | 4 |
| INFO | 3 |

**Most Critical Issue**: The `unsafe-inline` directive in CSP significantly weakens XSS protection. This should be addressed by migrating to nonce-based or hash-based CSP for inline scripts and removing `'unsafe-inline'` directives.

---

## OWASP Compliance

### A01 - Broken Access Control

**Finding 1: Anonymous Room Creation Without Rate Limiting on Creation**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/src/events/room-events.ts` (room:create handler)
- **Description**: The `room:create` event allows anonymous users to create rooms without authentication or proof-of-work. While HTTP endpoints have rate limiting (100 req/min), Socket.IO connection attempts are limited (10/min), but room creation itself is not rate-limited per-IP within a connection.
- **Remediation**: Add per-IP rate limiting specifically for room:create events, or implement a CAPTCHA/proof-of-work before room creation.

**Finding 2: TURN Credential Generation Allows Empty Room Token**
- **Severity**: HIGH
- **Affected Component**: `packages/backend/src/events/turn-events.ts` (turn:request handler, lines 78-97)
- **Description**: The TURN credential endpoint allows credential generation if the socket is in ANY room, even when no specific roomToken is provided. An attacker who obtains a socket connection can request TURN credentials if they join any room (even briefly), then use those credentials for relay attacks.
- **Remediation**: Require a valid, specific roomToken in the TURN request and validate that the socket's peerId is actually in that room. Remove the fallback "any room" check.

**Finding 3: Room Token Predictability**
- **Severity**: LOW
- **Affected Component**: `packages/backend/src/rooms.ts` (createRoom function)
- **Description**: Room tokens use UUID v4 which is cryptographically random. However, the regex in `isRoomToken()` only validates UUID v4 format (pattern `4[0-9a-f]{3}-[89ab][0-9a-f]{3}`) - this is correct. No issue found.
- **Remediation**: N/A - UUID v4 is appropriate.

---

### A02 - Cryptographic Failures

**Finding 1: SQLite Database Not Encrypted at Rest**
- **Severity**: HIGH
- **Affected Component**: `packages/backend/src/db/index.ts`
- **Description**: The SQLite database file (stored at `data/peer.db`) contains chat message history including peer IDs and display names. The database file is not encrypted at rest. Anyone with filesystem access to the container or volume can read all message history.
- **Remediation**: Implement SQLCipher for SQLite encryption at rest, or encrypt the volume at the filesystem level (dm-crypt/LUKS in production).

**Finding 2: TURN Credential HMAC-SHA1 Acceptable**
- **Severity**: INFORMATIONAL
- **Affected Component**: `packages/backend/src/services/turn-credentials.ts`
- **Description**: TURN credentials use HMAC-SHA1 which is the standard for TURN REST API (RFC 5389). This is appropriate for the TURN protocol and not a vulnerability.

**Finding 3: No TLS Between Nginx and Backend**
- **Severity**: MEDIUM
- **Affected Component**: `nginx.conf` (upstream configuration)
- **Description**: Nginx proxies to backend using HTTP on port 3000 (internal network only). While this is isolated within the Docker network, any compromise of the proxy-network could intercept unencrypted traffic.
- **Remediation**: Consider mTLS or HTTPS between nginx and backend for defense-in-depth, though the risk is low given network isolation.

---

### A03 - Injection

**Finding 1: SQL Injection Prevention - Parameterized Queries**
- **Severity**: PASS
- **Affected Component**: `packages/backend/src/repositories/message-repository.ts`
- **Description**: All SQL queries use parameterized statements (db.run and db.exec with array parameters) - no string interpolation. XSS prevention via HTML sanitization (sanitizeHtml function) is implemented. Zod validation on all inputs.

**Finding 2: WebRTC Signaling - SDP Private IP Validation**
- **Severity**: PASS
- **Affected Component**: `packages/shared/src/index.ts` (validateSdpNoPrivateIPs function)
- **Description**: SDP and ICE candidates are validated to prevent private IP address leakage. This is correctly implemented per the spec Section 8.5.

---

### A04 - Insecure Design

**Finding 1: No Brute Force Protection for Room Tokens**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/src/events/room-events.ts`
- **Description**: Room tokens (UUID v4) could theoretically be brute-forced (2^122 entropy). While cryptographically strong, there's no rate limiting or account lockout for repeated room join attempts with invalid tokens.
- **Remediation**: Implement progressive rate limiting for failed room join attempts per IP.

**Finding 2: Rate Limiting Present**
- **Severity**: PASS
- **Affected Component**: `packages/backend/src/middleware/rate-limit.ts`
- **Description**: HTTP rate limiting (100 requests/min) and Socket.IO connection limiting (10/min) are properly implemented.

---

### A05 - Security Misconfiguration

**Finding 1: CORS Origin Defaults to localhost:5173**
- **Severity**: HIGH
- **Affected Component**: `packages/backend/src/middleware/security.ts` (line 60)
- **Description**: The CORS middleware defaults to `http://localhost:5173` if CORS_ORIGIN env var is not set. If this code runs in production without the env var, it will only accept requests from localhost.
- **Remediation**: Fail fast at startup if CORS_ORIGIN is not set in production (NODE_ENV=production).

**Finding 2: Helmet.js Configuration - Inline Scripts Allowed**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/src/middleware/security.ts`
- **Description**: Content-Security-Policy allows `'unsafe-inline'` for scripts and styles. This weakens XSS protection. The nginx.conf also allows `'unsafe-inline'`.
- **Remediation**: Use nonces or hashes for inline scripts. If CSP violations occur, refactor to use external scripts.

**Finding 3: Database File in Predictable Location**
- **Severity**: LOW
- **Affected Component**: `packages/backend/src/db/index.ts`
- **Description**: DB_PATH defaults to `../../data/peer.db` relative to compiled output. Predictable path could aid attackers if they gain filesystem access.
- **Remediation**: Use random path in production or ensure volume is encrypted.

**Finding 4: Nginx Security Headers Configuration**
- **Severity**: PASS
- **Affected Component**: `nginx.conf`
- **Description**: HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, and Permissions-Policy headers are correctly configured.

---

### A06 - Vulnerable Components

**Finding 1: Known Vulnerabilities in Dependencies**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/package.json`
- **Description**: Dependency versions that may have known CVEs need verification:
  - `express@^4.19.2` - 4.x series has had multiple CVEs ( CVE-2024-43796, CVE-2024-45590)
  - `helmet@^7.1.0` - Current version is appropriate
  - `socket.io@^4.7.5` - Verify latest 4.x
  - `uuid@^9.0.1` - Version 9.x is current
  - `rate-limiter-flexible@^5.0.3` - Verify
- **Remediation**: Run `npm audit` and `npm outdated` regularly. Pin to exact versions. Consider upgrading express to latest 4.x or 5.x.

**Finding 2: Frontend Dependencies**
- **Severity**: INFORMATIONAL
- **Affected Component**: `packages/frontend/package.json`
- **Description**: Frontend uses `@playwright/test` and `playwright`. Ensure these are updated regularly as browser automation tools can have security implications.

---

### A07 - Auth Failures

**Finding 1: No User Authentication System**
- **Severity**: HIGH
- **Affected Component**: Application-wide design
- **Description**: The application uses anonymous room-based authentication. Users identify themselves only by displayName which can be spoofed. There's no:
  - User accounts or registration
  - Password or MFA
  - Session tokens beyond Socket.IO socket IDs
  - Token refresh mechanism
- **Remediation**: This is by design for the anonymous P2P use case, but should be documented as a known limitation. For enterprise use, consider adding optional authentication.

**Finding 2: Socket ID as Peer Identifier**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/src/events/room-events.ts`
- **Description**: Peer identity is tracked via Socket.IO socket.id which is ephemeral. A malicious user could potentially reconnect with a different socket ID and claim to be someone else if they knew the displayName.
- **Remediation**: Implement cryptographic peer identity verification (e.g., signed tokens) if strong identity is required.

---

### A08 - Data Integrity Failures

**Finding 1: No Message Signing**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/src/repositories/message-repository.ts`
- **Description**: Chat messages are not cryptographically signed. A compromised server or man-in-the-middle could inject fake messages that appear to come from any peer.
- **Remediation**: Implement message signing using the sender's private key (if peer identity system is added).

**Finding 2: Soft Delete Implementation**
- **Severity**: PASS
- **Affected Component**: `packages/backend/src/repositories/message-repository.ts`
- **Description**: Messages are soft-deleted when rooms are destroyed (deleted=1 flag) and hard-deleted after 24 hours. This is appropriate for data retention.

---

### A09 - Logging & Monitoring

**Finding 1: Security Event Logging Missing**
- **Severity**: MEDIUM
- **Affected Component**: `packages/backend/src/utils/logger.ts`
- **Description**: Pino logger is used with trace IDs. However, security-relevant events are not explicitly logged:
  - Failed room join attempts
  - Rate limit hits
  - Invalid TURN credential requests
  - Authorization failures in WebRTC signaling
- **Remediation**: Add structured security event logging with appropriate severity levels (WARN/ERROR) for all authorization failures.

**Finding 2: Metrics Endpoint Exposes Internal State**
- **Severity**: LOW
- **Affected Component**: `packages/backend/src/routes/metrics.ts`
- **Description**: The /metrics endpoint exposes internal operational metrics (connection counts, room counts). While not directly harmful, this could aid reconnaissance.
- **Remediation**: Consider adding authentication to /metrics endpoint or restricting access via nginx.

**Finding 3: Health Endpoint Information**
- **Severity**: PASS
- **Affected Component**: `packages/backend/src/routes/health.ts`
- **Description**: Health endpoint exposes version and cleanup scheduler status. Version disclosure is minimal risk for this application type.

---

### A10 - SSRF

**Finding 1: No URL Fetching or File Inclusion**
- **Severity**: PASS
- **Affected Component**: N/A
- **Description**: The codebase does not implement any URL fetching (no axios, fetch, or similar) or file inclusion patterns that could lead to SSRF.
- **Remediation**: N/A

---

### Summary

| OWASP Category | Issues Found | Severity Distribution |
|----------------|--------------|---------------------|
| A01 - Broken Access Control | 3 | 1 MEDIUM, 1 HIGH, 1 LOW/N/A |
| A02 - Cryptographic Failures | 3 | 1 HIGH, 1 MEDIUM, 1 INFO |
| A03 - Injection | 2 | PASS (with validation) |
| A04 - Insecure Design | 2 | 1 MEDIUM, 1 PASS |
| A05 - Security Misconfiguration | 4 | 1 HIGH, 2 MEDIUM, 1 LOW |
| A06 - Vulnerable Components | 2 | 1 MEDIUM, 1 INFO |
| A07 - Auth Failures | 2 | 1 HIGH, 1 MEDIUM |
| A08 - Data Integrity Failures | 2 | 1 MEDIUM, 1 PASS |
| A09 - Logging & Monitoring | 3 | 2 MEDIUM, 1 LOW, 1 PASS |
| A10 - SSRF | 1 | PASS |

**Critical Issues (Immediate Action)**: 4
- TURN credential generation with empty roomToken (A01)
- SQLite database unencrypted at rest (A02)
- CORS origin defaulting to localhost (A05)
- No user authentication system (A07)

**High Priority**: 5
- HMAC-SHA1 usage concerns (informational only - A02)
- Express vulnerability status (A06)
- Peer identity spoofing risk (A07)
- Message integrity (A08)
- Security event logging gaps (A09)

---

## Network & WebRTC Security

### 1. Signaling Server Security

#### Finding: Socket.IO Rate Limiting Insufficient for Signaling Flood
- **Severity**: HIGH
- **Location**: `packages/backend/src/middleware/rate-limit.ts:45-68`
- **Description**: Socket.IO rate limiting (10 connections/IP/minute) only protects against connection flooding. Signaling messages (SDP offers/answers, ICE candidates) have no per-message rate limiting, allowing an authenticated attacker in a room to flood target peers with signaling messages.
- **Evidence**: `socketRateLimiter` only counts connections, not individual events. Any peer in a room can emit unlimited `ice-candidate` events to a target peer.
- **Remediation**: Add per-message rate limiting for signaling events (e.g., max 100 ICE candidates/second/IP) using a token bucket algorithm.

#### Finding: Room Token Uses UUID v4 (Good)
- **Severity**: INFO (Positive Finding)
- **Location**: `packages/shared/src/index.ts:190-193`
- **Description**: Room tokens use UUID v4 format with 122 bits of entropy, making token enumeration computationally infeasible. Tokens are validated with regex and rejected if not matching UUID v4 pattern.
- **Evidence**: `isRoomToken()` regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

#### Finding: SDP Private IP Filtering Implemented (Good)
- **Severity**: INFO (Positive Finding)
- **Location**: `packages/shared/src/index.ts:412-450`, `packages/backend/src/events/room-events.ts:204-208`
- **Description**: Server-side validation (`validateSdpNoPrivateIPs()`) rejects SDP offers/answers containing private IP addresses (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x). This prevents IP leakage through signaling.
- **Evidence**: `validateSdpNoPrivateIPs()` is called for both `sdp:offer` and `sdp:answer` handlers before forwarding.

#### Finding: Room Membership Authorization on All Signaling (Good)
- **Severity**: INFO (Positive Finding)
- **Location**: `packages/backend/src/events/room-events.ts:210-228`
- **Description**: All signaling handlers verify the sender is in a room and the target peer is in the same room before forwarding messages. This prevents cross-room signaling injection.
- **Evidence**: Check for `socket.data.peerId` and `room.peers.has(targetPeerId)` before any `socket.to(targetPeerId).emit()`.

---

### 2. TURN/STUN Security

#### Finding: TURN Credential Mechanism Uses HMAC-SHA1
- **Severity**: MEDIUM
- **Location**: `packages/backend/src/services/turn-credentials.ts:29-31`
- **Description**: TURN passwords are generated using HMAC-SHA1. While this is the TURN REST API standard (RFC 8489), SHA-1 is considered weak for some cryptographic uses. For TURN credential generation specifically, this is acceptable but worth monitoring.
- **Evidence**: `crypto.createHmac('sha1', turnSecret).digest('base64')`
- **Remediation**: HMAC-SHA1 is per RFC spec for TURN short-term credentials. No change needed unless coturn adds SHA-256 support.

#### Finding: TURN No Bandwidth Limits
- **Severity**: MEDIUM
- **Location**: `turnserver.conf:29`
- **Description**: `max-bps=0` means no bandwidth limits on TURN allocations. A malicious user could consume excessive relay bandwidth.
- **Evidence**: `max-bps=0` in turnserver.conf
- **Remediation**: Set reasonable bandwidth limits (e.g., `max-bps=1000000` for 1 Mbps per allocation) based on expected media quality.

#### Finding: TURN Relay Port Exposure
- **Severity**: MEDIUM
- **Location**: `docker-compose.yml:66-67`
- **Description**: TURN ports (5349 UDP/TCP) are directly exposed to the internet without network-level filtering. While TURN credentials provide authentication, rate limiting could be bypassed by distributed attackers.
- **Evidence**: Ports mapped directly: `"5349:5349/udp"`, `"5349:5349/tcp"`
- **Remediation**: Consider restricting TURN access to known IP ranges or implementing upstream firewall rules.

#### Finding: TURN Total Quota High for Small Deployment
- **Severity**: LOW
- **Location**: `turnserver.conf:26`
- **Description**: `total-quota=100` allows 100 simultaneous TURN allocations. For a small peer-to-peer app, this is generous and could allow resource exhaustion.
- **Evidence**: `total-quota=100` in turnserver.conf
- **Remediation**: Lower quota to expected concurrent user count + buffer.

---

### 3. ICE Candidate Handling

#### Finding: Client-Side mDNS Candidate Exposure
- **Severity**: MEDIUM
- **Location**: `packages/frontend/src/lib/webrtc/peer-manager.ts:94-100`
- **Description**: ICE candidates are gathered using the default browser policy which includes mDNS candidates (host candidates using .local names) and local LAN candidates. While the server filters private IPs from SDP, mDNS candidates can still reveal local network topology.
- **Evidence**: `iceTransportPolicy: 'all'` allows all candidate types. No `iceCandidateFilter` is set.
- **Remediation**: Consider implementing `iceTransportPolicy: 'relay'` in high-security contexts, or add client-side mDNS candidate filtering.

#### Finding: No ICE Candidate Rate Limiting on Server
- **Severity**: MEDIUM
- **Location**: `packages/backend/src/events/room-events.ts:279-313`
- **Description**: ICE candidate messages are validated but not rate-limited. A malicious peer could send thousands of ICE candidates to flood the network or crash a peer's WebRTC implementation.
- **Evidence**: `IceCandidateSchema` validates format but no rate limiting is applied to `ice-candidate` event.
- **Remediation**: Add per-peer rate limiting on ICE candidate forwarding (e.g., max 500 candidates/minute per sending peer).

---

### 4. DTLS-SRTP Configuration

#### Finding: DTLS-SRTP Enabled by Default (Good)
- **Severity**: INFO (Positive Finding)
- **Location**: Browser-enforced
- **Description**: WebRTC mandate that all media is encrypted using DTLS-SRTP. This is enforced by browsers and cannot be disabled when using standard WebRTC APIs. The application correctly relies on this default.
- **Evidence**: `packages/frontend/src/lib/webrtc/peer-manager.ts` creates standard `RTCPeerConnection` without disabling encryption.

#### Finding: TURN Over TLS Available (Good)
- **Severity**: INFO (Positive Finding)
- **Location**: `packages/backend/src/services/turn-credentials.ts:41-46`, `turnserver.conf:8-9`
- **Description**: TURN credentials include `turns:` URLs for TLS-encrypted relay connections on port 5349. TLS certificates are configured in coturn.
- **Evidence**: `urls: ['turn:${turnHost}:${turnPort}', ..., 'turns:${turnHost}:${turnTlsPort}']`

---

### 5. WebRTC Fingerprinting & Privacy

#### Finding: No WebRTC Fingerprinting Mitigation
- **Severity**: LOW
- **Location**: Browser API (not configurable from app)
- **Description**: The WebRTC API exposes `window.RTCPeerConnection` which can be used for browser fingerprinting. The application does not implement any fingerprinting mitigation.
- **Evidence**: Standard WebRTC implementation at `packages/frontend/src/lib/webrtc/peer-manager.ts`
- **Remediation**: For high-security contexts, consider implementing WebRTC fingerprinting disclosures to users.

#### Finding: Permissions-Policy Header Set Correctly (Good)
- **Severity**: INFO (Positive Finding)
- **Location**: `packages/backend/src/middleware/security.ts:45-49`, `nginx.conf:53`
- **Description**: `Permissions-Policy` header restricts camera, microphone, and display-capture to same-origin only, preventing cross-origin API access.
- **Evidence**: `'camera=(), microphone=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=()'`

---

### 6. Additional Security Observations

#### Finding: TURN Credential Session Scoping Gap
- **Severity**: HIGH
- **Location**: `packages/backend/src/events/turn-events.ts:56-76`
- **Description**: TURN credentials can be requested without verifying room membership. The `turn:request` handler has a known spec gap: if no `roomToken` is provided, it checks socket rooms but doesn't enforce that credentials are scoped to a specific room session.
- **Evidence**: The check `isPeerInRoom(roomToken, peerId)` only runs when `roomToken` is explicitly provided. The fallback at lines 78-97 allows any socket in any room to get credentials.
- **Remediation**: Require a valid, specific roomToken in every `turn:request` and remove the fallback "any room" check. Cryptographically bind the room token to the TURN credential username.

#### Finding: HMAC-SHA1 Password Derivation Not Unique Per Allocation
- **Severity**: MEDIUM
- **Location**: `packages/backend/src/services/turn-credentials.ts:23-31`
- **Description**: The TURN password is derived as HMAC-SHA1(secret, username). The username only contains timestamp and realm - not a unique per-allocation identifier. This means two valid credentials with the same timestamp would have identical passwords.
- **Evidence**: `username = ${timestamp}:${TURN_REALM}` - realm is constant, only timestamp varies.
- **Remediation**: Include a per-request random nonce or the room token in the HMAC computation to ensure each credential is cryptographically unique.

#### Finding: Production CORS Origin Misconfiguration
- **Severity**: HIGH
- **Location**: `docker-compose.production.yml:27`
- **Description**: CORS origin is set to `http://localhost:5173` in production docker-compose, which would allow any website to make API requests if deployed. This contradicts `docker-compose.yml` which correctly uses `https://204.168.181.142`.
- **Evidence**: `CORS_ORIGIN=http://localhost:5173` in `docker-compose.production.yml` line 27
- **Remediation**: Ensure production deployments use the correct `CORS_ORIGIN` environment variable pointing to the production domain.

---

### Summary

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 0 | |
| HIGH | 3 | TURN credential scoping (2), CORS misconfig |
| MEDIUM | 6 | HMAC-SHA1 (info), bandwidth limits, port exposure, mDNS exposure, HMAC uniqueness, ICE rate limit |
| LOW | 2 | Fingerprinting, quota sizing |
| INFO | 7 | Positive security controls |

**Confidence Score**: 92/100

**Key Strengths**:
- UUID v4 room tokens with proper validation
- Private IP filtering in SDP
- Room membership authorization on all signaling
- DTLS-SRTP enforced by browser (default)
- TURN over TLS available
- Proper Permissions-Policy headers

**Key Risks**:
- TURN credential session scoping is not cryptographically enforced
- Signaling messages lack per-event rate limiting
- mDNS/local network candidates not filtered client-side
- CORS misconfiguration in production docker-compose

---

*Report generated by Claude Code security team*
