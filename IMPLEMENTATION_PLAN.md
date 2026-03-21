# Implementation Plan

## Overview
Peer is a browser-based P2P VoIP application with voice, video, screen sharing, and text chat. The implementation follows a 6-sprint plan with dependencies between phases.

---

## Sprint 1: Project Scaffold & Signalling Core

### 1.1 Project Setup
- [ ] Initialize monorepo with pnpm workspaces (frontend + backend)
- [ ] Set up TypeScript 5.4.x with strict mode for both frontend and backend
- [ ] Configure ESLint + Prettier for consistent code style
- [ ] Set up GitHub Actions CI pipeline structure

### 1.2 Backend - Signalling Server
- [ ] Create Node.js 22.x backend with Express 4.19.x
- [ ] Implement Socket.IO 4.7.x server with room namespace
- [ ] Create room management: create, join, leave, destroy events
- [ ] Implement UUID v4 room token generation
- [ ] Add health check endpoint (`/health`)
- [ ] Configure helmet.js for security headers
- [ ] Implement rate limiting (rate-limiter-flexible)

### 1.3 Docker Compose Setup
- [ ] Create docker-compose.yml with signalling server service
- [ ] Set up Nginx service for reverse proxy and TLS termination
- [ ] Configure coturn service (placeholder for Sprint 3)
- [ ] Create .env.example with all required environment variables

### 1.4 Testing
- [ ] Write unit tests for room state machine
- [ ] Write unit tests for UUID generation

**Exit Criteria:** Peers can join a room via Socket.IO. No media yet.

---

## Sprint 2: WebRTC Mesh: Voice & Video

### 2.1 Frontend Scaffold
- [ ] Set up React 19.x with Vite 5.x
- [ ] Configure TailwindCSS 3.4.x with dark theme
- [ ] Set up React Router 6.x with room route (`/room/:token`)
- [ ] Create Zustand 4.x store for client state

### 2.2 WebRTC Integration
- [ ] Integrate simple-peer 9.11.x
- [ ] Implement SDP offer/answer relay through signalling server
- [ ] Implement ICE candidate exchange
- [ ] Configure STUN servers (Google public + coturn)

### 2.3 Media Capture
- [ ] Implement getUserMedia for audio capture
- [ ] Implement getUserMedia for video capture
- [ ] Create audio/video stream management

### 2.4 Media Controls
- [ ] Implement mute/unmute toggle (local only)
- [ ] Implement camera on/off toggle
- [ ] Implement speaking indicator via Web Audio API

### 2.5 Mesh Topology
- [ ] Implement full mesh connection logic for N peers
- [ ] Handle peer connection/disconnection dynamically

**Exit Criteria:** Two+ peers can have a live voice/video call.

---

## Sprint 3: Screen Sharing & TURN

### 3.1 Screen Sharing
- [ ] Implement getDisplayMedia() for screen capture
- [ ] Handle screen share track replacement in peer connections
- [ ] Implement screen share on/off toggle
- [ ] Handle browser stop button for screen share
- [ ] Implement UI: main view for screen share, smaller tiles for peers

### 3.2 TURN Infrastructure
- [ ] Configure coturn Docker service with proper credentials
- [ ] Implement server-side TURN credential generation (HMAC, 1-hour TTL)
- [ ] Create Socket.IO event to fetch TURN credentials (authenticated)
- [ ] Implement ICE fallback logic

### 3.3 NAT Traversal Testing
- [ ] Test STUN-only connections
- [ ] Test TURN relay fallback
- [ ] Verify connections behind symmetric NAT

**Exit Criteria:** Screen share works. NAT traversal is robust.

---

## Sprint 4: Text Chat & Persistence

### 4.1 Chat Backend
- [ ] Set up SQLite 3.45.x with better-sqlite3
- [ ] Create messages table schema (id, room_token, sender, content, timestamp)
- [ ] Implement chat message Socket.IO events (send, receive)

### 4.2 Chat Frontend
- [ ] Create chat UI panel (right sidebar)
- [ ] Implement message display with sender name and timestamp
- [ ] Implement message input with 2000 character limit
- [ ] Add HTML escaping for messages

### 4.3 Persistence
- [ ] Load message history on room join
- [ ] Store display name in sessionStorage
- [ ] Handle message scope by room token

### 4.4 Cleanup
- [ ] Implement 24-hour chat cleanup cron job
- [ ] Soft-delete messages on room destroy
- [ ] Hard-delete after 24 hours

**Exit Criteria:** Chat works and survives refresh.

---

## Sprint 5: UI Polish & UX

### 5.1 Layout & Theme
- [ ] Implement dark-mode-first theme (#0D1117 background)
- [ ] Create left sidebar: room info + controls
- [ ] Implement main video grid area (CSS Grid auto-reflow)
- [ ] Create right panel for chat
- [ ] Add light mode respecting prefers-color-scheme

### 5.2 Components
- [ ] Create video tile component with avatar/name placeholder
- [ ] Create control bar: mute, camera, screen share, leave
- [ ] Create invite link copy button
- [ ] Add permission error handling UI

### 5.3 Responsive & Mobile
- [ ] Implement mobile-responsive layout
- [ ] Optimize for iOS Safari and Android Chrome
- [ ] Handle iOS screen share restriction gracefully

### 5.4 Typography & Icons
- [ ] Self-host Inter font
- [ ] Integrate Lucide React icons

### 5.5 Accessibility
- [ ] Add keyboard navigation
- [ ] Add ARIA labels to all controls
- [ ] Verify WCAG 2.1 AA color contrast

**Exit Criteria:** Production-quality UI. Usable by non-technical users.

---

## Sprint 6: Testing, Hardening & Deploy

### 6.1 Testing - Unit & Integration
- [ ] Achieve ≥70% line coverage on signalling server
- [ ] Write Vitest tests for: room state, TURN credentials, chat sanitization
- [ ] Write integration tests for Socket.IO events
- [ ] Write integration tests for REST endpoints

### 6.2 Testing - E2E
- [ ] Set up Playwright 1.44.x
- [ ] Write E2E tests: create room, join, call, chat, screen share
- [ ] Write E2E tests: permission denial, invalid token, disconnect
- [ ] Run cross-browser tests (Chrome, Firefox, Edge, Safari)

### 6.3 Load & Security Testing
- [ ] Run load tests (k6): 100 concurrent rooms, 500 socket connections
- [ ] Run OWASP ZAP security scan
- [ ] Verify HTTP security headers (securityheaders.com)

### 6.4 DevOps
- [ ] Configure final Docker Compose production config
- [ ] Set up Let's Encrypt auto-renewal
- [ ] Complete GitHub Actions CI/CD pipeline

### 6.5 Documentation
- [ ] Write README: how to run locally, how to test, environment variables
- [ ] Document architecture decisions

**Exit Criteria:** Production-ready. All acceptance criteria verified.

---

## Dependencies & Priority

### Phase 1 (Critical Path - Sprint 1)
Sprint 1 is the foundation. Everything depends on:
- Signalling server with room management
- Docker Compose skeleton
- Basic Socket.IO events

### Phase 2 (Sprint 2)
Depends on Sprint 1:
- Frontend scaffold
- WebRTC mesh integration
- Media controls

### Phase 3 (Sprint 3)
Depends on Sprint 2:
- Screen sharing
- TURN infrastructure

### Phase 4 (Sprint 4)
Independent of media (can parallel with Sprint 2-3):
- Chat backend
- SQLite persistence

### Phase 5 (Sprint 5)
Depends on all previous sprints:
- Full UI implementation
- Polish and accessibility

### Phase 6 (Sprint 6)
Final integration:
- All testing
- Security hardening
- Deployment

---

## Quick Start Tasks (Get to First Call)

If you want to minimize time to first call, prioritize in this order:

1. Sprint 1: Project setup + signalling server
2. Sprint 2: Frontend + WebRTC basic voice
3. Sprint 5: Simple video grid layout

Full feature parity (chat, screen share, TURN) can be added after first call works.

---

## Notes

- Technology versions are locked per spec (Section 2)
- Acceptance criteria in spec (Section 9) should be verified at each sprint exit
- No social features, persistent accounts, or server-side media relay per spec
- Max 20 peers per room (8 recommended for quality)
