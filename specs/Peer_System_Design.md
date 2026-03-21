# Peer
## Peer-to-Peer VoIP Web Application
### System Design & Implementation Document
*Version 1.0 · 2026*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Overall Design Scheme](#3-overall-design-scheme)
4. [System Requirements](#4-system-requirements)
5. [Software Requirements](#5-software-requirements)
6. [Implementation Plan](#6-implementation-plan)
7. [Testing Strategy](#7-testing-strategy)
8. [Security Strategy](#8-security-strategy)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Appendix — Recommended Upgrade Paths](#10-appendix--recommended-upgrade-paths)

---

## 1. Executive Summary

Peer is a lightweight, browser-based peer-to-peer communication platform supporting voice, video, screen sharing, and text chat — without social media features, persistent accounts, or server-side media relay. Rooms are ephemeral and invite-driven. The architecture minimises operational cost by routing media directly between peers (WebRTC mesh), while a thin Node.js signalling server handles peer discovery, room state, and NAT traversal coordination.

| Attribute | Value |
|---|---|
| Project Name | Peer |
| Type | WebRTC P2P VoIP Web Application |
| Auth Model | No accounts — shareable invite links (UUID tokens) |
| Room Model | Ephemeral — rooms auto-destroy when last peer leaves |
| Max Concurrent Users / Room | 2–8 (mesh); architecture supports burst to 20 via SFU upgrade path |
| Deployment | Docker Compose — self-hosted or any cloud VPS |
| Recording | Out of scope for v1 |
| Compliance | None mandated for v1; GDPR-ready by design (no PII stored) |

---

## 2. Technology Stack

All versions below have been selected for mutual compatibility and long-term support status as of 2026.

### 2.1 Frontend

| Package | Version | Role | Notes |
|---|---|---|---|
| React | 19.x | UI framework | Concurrent rendering, stable hooks API |
| TypeScript | 5.4.x | Type safety | Strict mode; full IDE support |
| Vite | 5.x | Build tool / dev server | Fast HMR; ESM-native |
| TailwindCSS | 3.4.x | Styling | Dark-mode-first via class strategy |
| Zustand | 4.x | Client state | Lightweight; no boilerplate |
| Socket.IO-client | 4.7.x | Signalling transport | Matches server version exactly |
| simple-peer | 9.11.x | WebRTC abstraction | Wraps RTCPeerConnection; node-compatible |
| React Router | 6.x | Client routing | Room URL `/room/:token` |

### 2.2 Backend — Signalling Server

| Package | Version | Role | Notes |
|---|---|---|---|
| Node.js | 22.x LTS | Runtime | Active LTS; matches Vite dev server toolchain |
| TypeScript | 5.4.x | Language | ts-node / tsc build |
| Express | 4.19.x | HTTP server | Serves static build + REST health check |
| Socket.IO | 4.7.x | WebSocket layer | Rooms, namespaces, reconnect |
| uuid | 9.x | Token generation | v4 tokens for room IDs and invite links |
| dotenv | 16.x | Config | Environment-based secrets |
| helmet | 7.x | HTTP security headers | CSP, HSTS, X-Frame-Options etc. |
| rate-limiter-flexible | 3.x | Rate limiting | Protects signalling endpoints |

### 2.3 TURN / STUN Infrastructure

| Component | Version | Role | Notes |
|---|---|---|---|
| coturn | 4.6.x | TURN + STUN server | Open-source; Docker image available |
| Google STUN | Public | STUN fallback | stun.l.google.com:19302 — discovery only |

> **Note:** STUN is used first (free, no relay). If both peers are behind symmetric NAT, traffic automatically falls back to your self-hosted coturn TURN relay. TURN bandwidth cost is only incurred when direct P2P fails.

### 2.4 Persistence — Text Chat

| Package | Version | Role | Notes |
|---|---|---|---|
| SQLite | 3.45.x | Embedded database | No separate DB process; zero ops overhead |
| better-sqlite3 | 9.x | Node.js driver | Synchronous API; best perf for SQLite |

> **Note:** SQLite is the right choice at this scale. A single file on disk is sufficient for ephemeral room chat history (2–20 users, short-lived rooms). PostgreSQL is the recommended upgrade path if you later add persistent user accounts or audit logs.

### 2.5 DevOps & Tooling

| Tool | Version | Role | Notes |
|---|---|---|---|
| Docker | 26.x | Containerisation | Reproducible builds |
| Docker Compose | 2.x | Orchestration | Signalling + coturn as one stack |
| Nginx | 1.26.x | Reverse proxy / TLS | Terminates HTTPS; proxies to Node |
| Let's Encrypt / Certbot | Latest | TLS certificates | Auto-renew; free |
| Vitest | 1.x | Unit testing | Vite-native; TypeScript out of box |
| Playwright | 1.44.x | E2E testing | Browser automation; multi-tab P2P tests |
| ESLint + Prettier | Latest | Linting / formatting | Enforce consistent code style |
| GitHub Actions | — | CI/CD | Test → build → Docker push pipeline |

---

## 3. Overall Design Scheme

### 3.1 Architecture Overview

Peer uses a thin-server / fat-client design. The server is responsible only for signalling (room state, peer discovery, ICE candidate exchange). Once two peers have exchanged SDP offers/answers via the signalling server, media flows directly peer-to-peer through encrypted WebRTC DataChannels and MediaStreams — the server never sees audio, video, or screen share data.

| Component | Technology | Responsibility |
|---|---|---|
| Browser (Peer A) | React SPA | WebRTC mesh participant |
| Browser (Peer B–H) | React SPA | WebRTC mesh participant |
| Signalling Server | Node.js + Socket.IO | Room state, SDP relay, ICE candidates |
| STUN Server | Google Public / coturn | NAT discovery (no data relay) |
| TURN Server | Self-hosted coturn | Relay fallback for symmetric NAT only |
| Nginx | Reverse proxy | TLS termination, static asset serving |
| SQLite | Embedded file DB | Chat message persistence per room |

### 3.2 WebRTC Mesh Strategy

For 2–8 participants, a full mesh (every peer connects to every other peer) is used. This eliminates the need for a media server and keeps infrastructure cost near zero.

| Room Size | Mesh Connections & Notes |
|---|---|
| 2 peers | 1 peer connection — optimal |
| 4 peers | 6 peer connections — comfortable |
| 8 peers | 28 peer connections — manageable on modern hardware |
| 10+ peers | Recommend muting non-speakers; SFU upgrade path documented |
| SFU path | mediasoup (self-hosted) — drop-in upgrade if scale requirements change |

### 3.3 Room Lifecycle

Rooms are ephemeral. The signalling server tracks room state in memory. When the last peer disconnects, the room record is purged from memory. Chat messages for that room are soft-deleted from SQLite (retained for 24 hours then hard-deleted by a scheduled cleanup job, allowing a grace period for accidental disconnect/rejoin).

| Event | Behaviour |
|---|---|
| Room Created | First peer hits `/room/:token` — room entry created in memory |
| Peer Joins | Socket.IO `join` event; server broadcasts `peer-joined` to existing peers |
| Media Handshake | Offer/Answer SDP and ICE candidates exchanged via signalling server |
| Peer Leaves | Socket.IO disconnect; server broadcasts `peer-left`; mesh tears down that connection |
| Room Destroyed | Last peer disconnects; memory entry removed; DB messages flagged for cleanup |
| 24h GC | Cron job hard-deletes SQLite rows for destroyed rooms older than 24h |

### 3.4 UI Design Language

| Aspect | Decision |
|---|---|
| Theme | Dark-mode first; optional light mode respecting `prefers-color-scheme` |
| Primary colour | `#1A73E8` — accessible on dark backgrounds |
| Background | `#0D1117` (near-black) / `#161B22` (surface) |
| Typography | Inter (variable font, self-hosted) — clean, professional, legible at small sizes |
| Layout | Left sidebar: room list + controls. Main area: video grid. Right panel: chat |
| Video grid | CSS Grid; auto-reflows as peers join/leave (1→2→4→6 tile layout) |
| Icons | Lucide React — consistent, MIT licensed |
| Accessibility | WCAG 2.1 AA — keyboard nav, ARIA labels, sufficient colour contrast |

---

## 4. System Requirements

### 4.1 Server Requirements (Minimum — self-hosted VPS)

| Resource | Requirement |
|---|---|
| CPU | 2 vCPUs (signalling is lightweight; coturn adds ~5% per active TURN relay) |
| RAM | 1 GB (Node.js signalling + coturn). 2 GB recommended for headroom |
| Storage | 10 GB SSD (OS + Docker images + SQLite DB; DB stays small for ephemeral rooms) |
| Bandwidth | 50 Mbps uplink minimum. TURN relay worst-case: ~2 Mbps per relayed peer pair |
| OS | Ubuntu 24.04 LTS (recommended) or any Linux with Docker 26+ |
| Ports | 80/443 (HTTPS), 3478/UDP+TCP (STUN/TURN), 5349/TLS (TURN over TLS), 49152–65535/UDP (TURN relay range) |
| TLS | Valid certificate required (Let's Encrypt). WebRTC `getUserMedia` requires HTTPS |

### 4.2 Client Requirements (End User Browser)

| Requirement | Detail |
|---|---|
| Browser | Chrome 120+, Firefox 121+, Edge 120+, Safari 17.2+ (all support WebRTC + getDisplayMedia) |
| WebRTC | Required — no fallback. All modern browsers listed above support it natively |
| Camera | Optional — app works voice-only or screen-only |
| Microphone | Required for voice. Browser will prompt for permission |
| Network | Minimum 1 Mbps up/down per active video stream. 500 Kbps for voice-only |
| CPU | Encoding VP8/VP9 is hardware-accelerated in modern browsers; 2-core minimum recommended |
| Mobile | Supported via responsive layout; screen share not available on iOS (platform restriction) |

---

## 5. Software Requirements

### 5.1 Functional Requirements

#### 5.1.1 Room Management

- User can create a room and receive a shareable invite URL (format: `https://host/room/<uuid-v4>`)
- User can join a room via invite URL with no login required
- Room auto-destroys when all participants disconnect
- Room token is unguessable (UUID v4; 122 bits of entropy)
- User sets a display name on first join (stored in `sessionStorage` only)

#### 5.1.2 Voice (VoIP)

- Full-duplex audio between all room participants via WebRTC mesh
- Per-peer mute/unmute (local mic mute — no server involvement)
- Visual speaking indicator (audio level detection via Web Audio API)
- Codec: Opus (native WebRTC default — 6–510 Kbps, excellent voice quality)

#### 5.1.3 Video

- Camera video stream shared to all peers via WebRTC mesh
- Per-peer camera on/off toggle
- Video grid auto-reflows layout as peers join or leave
- Codec: VP8 (baseline) with VP9 preferred where supported

#### 5.1.4 Screen Sharing

- Any participant can share their screen, application window, or browser tab
- Screen share uses `getDisplayMedia()` API — browser prompts user to select source
- Only one screen share active per peer at a time (can share screen OR camera OR both)
- Screen share displayed in main view area; other peers shown in smaller tiles
- Stopping screen share (browser stop button or app button) reverts to camera/no-video

#### 5.1.5 Text Chat

- Real-time text chat within each room via Socket.IO (server-relayed, not P2P)
- Messages persist for the room session in SQLite — survive page refresh
- Messages are scoped to room token — inaccessible from other rooms
- On room rejoin (same token, same display name), previous messages are loaded
- No message editing or deletion in v1
- Maximum message length: 2,000 characters

#### 5.1.6 NAT Traversal

- ICE candidate gathering uses STUN first (`stun.l.google.com:19302`)
- If direct P2P fails (symmetric NAT), connection falls back to self-hosted coturn TURN relay
- TURN credentials are time-limited (TTL: 1 hour), generated server-side per session
- TURN credentials are never exposed in client source — fetched via authenticated Socket.IO event

### 5.2 Non-Functional Requirements

| Category | Attribute | Target |
|---|---|---|
| Performance | Call setup time | < 3 seconds peer-to-peer connection on same network |
| Performance | Audio latency | < 150 ms end-to-end (LAN); < 400 ms (WAN via TURN) |
| Performance | UI responsiveness | < 100 ms interaction response (mute, cam toggle) |
| Reliability | ICE restart | Automatic ICE restart on transient network failure |
| Reliability | Socket reconnect | Socket.IO auto-reconnect with exponential backoff |
| Scalability | Concurrent rooms | Limited only by server RAM (each room ~2 KB in memory) |
| Scalability | Peers per room | Hard cap of 20; soft recommendation of 8 for call quality |
| Usability | Time to first call | < 60 seconds from opening URL to being in a live call |
| Usability | Browser support | All modern evergreen browsers (no IE, no legacy Edge) |
| Maintainability | Code coverage | ≥ 70% unit test coverage on signalling server logic |

---

## 6. Implementation Plan

Six sprints of approximately two weeks each. Total estimated duration: **12 weeks solo** or **6–8 weeks with a small team**.

### Sprint 1 — Project Scaffold & Signalling Core
**Key Tasks:** Mono-repo setup (pnpm workspaces), Node.js + Socket.IO signalling server, room create/join/leave events, unit tests for room state machine, Docker Compose skeleton, Nginx + Let's Encrypt setup.

**Exit Criteria:** Peers can join a room via Socket.IO. No media yet.

---

### Sprint 2 — WebRTC Mesh: Voice & Video
**Key Tasks:** Integrate simple-peer on frontend, SDP offer/answer relay through signalling server, ICE candidate exchange, STUN configuration, audio/video stream capture, mute/cam-off toggles, speaking indicator via Web Audio API.

**Exit Criteria:** Two+ peers can have a live voice/video call.

---

### Sprint 3 — Screen Sharing & TURN
**Key Tasks:** `getDisplayMedia()` integration, screen share track replacement in existing peer connections, coturn Docker service, server-side time-limited TURN credential generation, ICE fallback testing on restricted networks.

**Exit Criteria:** Screen share works. NAT traversal is robust.

---

### Sprint 4 — Text Chat & Persistence
**Key Tasks:** Socket.IO chat events, SQLite schema + better-sqlite3 integration, message history on room rejoin, display name via `sessionStorage`, 24-hour chat cleanup cron, message length validation.

**Exit Criteria:** Chat works and survives refresh.

---

### Sprint 5 — UI Polish & UX
**Key Tasks:** Full React UI with TailwindCSS dark theme, responsive video grid (CSS Grid), sidebar room controls, chat panel, invite link copy button, permission error handling (mic/cam denied), mobile responsive layout, accessibility audit.

**Exit Criteria:** Production-quality UI. Usable by non-technical users.

---

### Sprint 6 — Testing, Hardening & Deploy
**Key Tasks:** Playwright E2E tests (multi-tab call simulation), Vitest unit test coverage to ≥ 70%, security audit (CSP headers, TURN credential rotation, rate limiting, input sanitisation), load test signalling server, final Docker Compose production config, CI/CD GitHub Actions pipeline.

**Exit Criteria:** Production-ready. All acceptance criteria verified.

---

## 7. Testing Strategy

### 7.1 Testing Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit Tests | Vitest | Signalling server room state machine, TURN credential generation, chat message sanitisation, UUID generation, rate limiter logic |
| Integration Tests | Vitest + supertest | Socket.IO event flows (join, leave, SDP relay), REST endpoints (`/health`, `/turn-credentials`), SQLite read/write |
| E2E Tests | Playwright | Multi-tab: create room, join from second tab, establish call, send chat, screen share, disconnect — automated browser test |
| Manual / Exploratory | Human tester | Cross-browser (Chrome, Firefox, Safari, Edge), mobile layout, NAT traversal on real networks, accessibility keyboard nav |
| Load Test | k6 | Signalling server: 100 concurrent rooms, 500 concurrent socket connections — verify no memory leak or event loop lag |
| Security Test | OWASP ZAP / manual | HTTP headers audit, TURN credential theft attempt, room token brute-force test, WebSocket message fuzzing |

### 7.2 Key Test Scenarios

- Two peers on same LAN establish voice call in < 3 seconds
- Two peers behind different NAT establish call via TURN relay
- Peer disconnects unexpectedly — remaining peer sees disconnected state within 5 seconds
- Room with 8 simultaneous video streams remains stable for 10 minutes
- Chat messages from 10 minutes ago load correctly on page refresh
- Invite link opens correctly in Chrome, Firefox, Safari, and Edge
- Invalid / expired room token shows graceful error page
- Microphone permission denied shows clear user guidance
- Screen share stop (via browser button) correctly reverts local stream
- 100 concurrent rooms on signalling server — no degradation in join latency

### 7.3 Coverage Targets

| Area | Target |
|---|---|
| Signalling server unit tests | ≥ 70% line coverage |
| REST + Socket.IO integration | 100% of documented events covered |
| E2E happy path | Full call lifecycle automated in CI |
| E2E sad path | NAT failure, permission denial, bad token |
| Cross-browser | Chrome, Firefox, Edge, Safari — all pass E2E suite |

---

## 8. Security Strategy

### 8.1 Transport Security

- All HTTP traffic redirected to HTTPS via Nginx (301 redirect)
- TLS 1.2 minimum; TLS 1.3 preferred. Nginx configured with modern cipher suites only
- HSTS header with `max-age=31536000` and `includeSubDomains`
- WebRTC media streams encrypted with DTLS-SRTP (mandatory; enforced by browser)
- TURN relay traffic encrypted with TLS (port 5349) — plain UDP TURN disabled in production

### 8.2 Room & Invite Security

- Room tokens are UUID v4 (122 bits of entropy) — computationally infeasible to brute-force
- No room enumeration endpoint — knowledge of token is the only access control
- Room tokens are never logged server-side (privacy by design)
- Invite links are single-factor — treat them like passwords; share via secure channel
- Rate limiting on Socket.IO join events: 10 joins per IP per minute (rate-limiter-flexible)

### 8.3 TURN Credential Security

- TURN credentials are generated server-side with time-limited HMAC tokens (RFC 8489 short-term)
- Credentials have 1-hour TTL — leaked credentials expire quickly
- Credentials are fetched via a Socket.IO event (not a public REST endpoint) — requires active room session
- coturn configured with a secret key in environment variable — never in source code

### 8.4 HTTP Security Headers

| Header | Configuration |
|---|---|
| Content-Security-Policy | Strict CSP: restricts scripts to self + Vite hashes; blocks inline scripts |
| X-Frame-Options | `DENY` — prevents clickjacking |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), display-capture=()` — scoped to app origin only |
| HSTS | `max-age=31536000; includeSubDomains` |

### 8.5 Input Validation & Injection Prevention

- All Socket.IO message payloads validated with Zod schemas on the server
- Chat messages HTML-escaped before storage and before broadcast to clients
- Display names limited to 50 characters, alphanumeric + common punctuation only
- SQLite queries use parameterised statements via better-sqlite3 — no string concatenation
- Room token format validated on server before any lookup (UUID v4 regex)

### 8.6 Operational Security

- Node.js process runs as non-root user inside Docker container
- Docker Compose network isolates signalling server from coturn internal network
- SQLite database file mounted as a named volume — not accessible from Nginx container
- Environment variables for all secrets (TURN secret, any future API keys) via `.env` file
- Dependabot / `npm audit` in CI pipeline — alerts on known CVEs in dependencies
- No PII collected or stored — display names in `sessionStorage` only, never sent to server for persistence

---

## 9. Acceptance Criteria

All criteria below must pass before v1.0 is considered shippable.

### 9.1 Core Functionality

| ID | Feature | Precondition / Action | Expected Result |
|---|---|---|---|
| AC-01 | Room Creation | User opens app and clicks 'Create Room' | Unique invite URL generated and displayed; user enters room |
| AC-02 | Room Join | Second user opens invite URL | Joins room with no login; sees existing participant |
| AC-03 | Voice Call | Both users unmuted in same room | Full-duplex audio; latency < 400 ms WAN |
| AC-04 | Video Call | Both users enable camera | Video tiles appear; auto-layout reflows correctly |
| AC-05 | Mute Toggle | User clicks mute button | Mic muted locally; speaking indicator goes dark; remote peers hear nothing |
| AC-06 | Camera Toggle | User clicks cam-off button | Video tile replaced with avatar/name placeholder |
| AC-07 | Screen Share | User clicks screen share | Browser prompts source picker; selected stream appears for all peers |
| AC-08 | Screen Share Stop | User clicks stop sharing | Stream reverts to camera (or blank); no errors |
| AC-09 | Text Chat | User types message and sends | Message appears for all room members in < 500 ms |
| AC-10 | Chat Persistence | User refreshes page and rejoins with same name | Previous chat messages reload correctly |
| AC-11 | Ephemeral Room | Last user leaves room | Room no longer joinable; new user gets 'room not found' error |
| AC-12 | NAT Traversal | Two peers on different restricted networks | Call established via TURN relay within 10 seconds |

### 9.2 Non-Functional Acceptance

| ID | Category | Test Action | Expected Result |
|---|---|---|---|
| AC-13 | Performance | 8-peer video call runs for 10 minutes | No crash, no memory leak; CPU < 80% on reference hardware |
| AC-14 | Security | OWASP ZAP baseline scan | Zero high-severity findings |
| AC-15 | Security | HTTP security headers check (securityheaders.com) | Grade A or higher |
| AC-16 | Browser Compat | Run E2E suite on Chrome, Firefox, Edge, Safari | All tests pass on all four browsers |
| AC-17 | Mobile | Open app on iOS Safari and Android Chrome | Layout usable; voice call functional; screen share absent on iOS (expected) |
| AC-18 | Load | 100 concurrent rooms on signalling server | Avg join latency < 200 ms; no socket drops |
| AC-19 | Accessibility | Keyboard-only navigation audit | All controls reachable and operable via keyboard; ARIA labels present |
| AC-20 | Error UX | User denies microphone permission | Clear, actionable error message; app does not crash |

---

## 10. Appendix — Recommended Upgrade Paths

These items are intentionally out of scope for v1 but the architecture has been designed to accommodate them without major refactoring.

| Feature | Migration Path |
|---|---|
| SFU (mediasoup) | Replace mesh with mediasoup SFU when rooms regularly exceed 8 peers. Signalling server already owns the room abstraction — add mediasoup Router per room. |
| Recording | Add a headless Puppeteer/Playwright recorder peer that joins the room and captures MediaStream to disk. No server-side decryption needed. |
| User accounts | Add Passport.js + PostgreSQL. Invite tokens become associated with accounts. Display names become profile names. |
| End-to-end encryption | Layer Insertable Streams (WebRTC E2EE API) on top of existing DTLS-SRTP. Requires Chrome 86+ / Firefox 117+. |
| Mobile apps | React Native + react-native-webrtc reuses most business logic. Signalling client is identical. |
| Persistent rooms | Add a 'pin room' option that stores token + name in SQLite. One config flag change. |

---

*Peer System Design Document — v1.0 · 2026*
