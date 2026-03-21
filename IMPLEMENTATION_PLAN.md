# Peer P2P VoIP Application - Implementation Plan

## Gap Analysis Summary

**Specification:** `specs/Peer_System_Design.md`
**Current Codebase:** Empty `src/` directory - no implementation exists

### What Needs to Be Built

The complete Peer P2P VoIP application including:
- React 19.x frontend with Vite 5.x
- Node.js 22.x backend with Socket.IO signalling server
- WebRTC mesh for voice/video/screen sharing
- SQLite persistence for text chat
- Docker Compose infrastructure
- Full test suite

---

## Prioritized Task List

### Phase 1: Foundation (Critical Path)

#### Task 1.1: Project Scaffold
- Initialize monorepo with pnpm workspaces (`packages/frontend`, `packages/backend`)
- Set up TypeScript 5.4.x with strict mode for both packages
- Configure ESLint + Prettier
- Create shared TypeScript types package

**Files to create:**
- `package.json` (root with pnpm workspaces)
- `pnpm-workspace.yaml`
- `packages/backend/package.json`
- `packages/frontend/package.json`
- `tsconfig.json` (root and per-package)
- `.eslintrc.cjs`, `.prettierrc`

#### Task 1.2: Backend - Signalling Server
- Create Express 4.19.x server with Socket.IO 4.7.x
- Implement room management (create, join, leave, destroy)
- Add UUID v4 room token generation
- Create health check endpoint (`/health`)
- Configure helmet.js for security headers
- Implement rate limiting

**Files to create:**
- `packages/backend/src/index.ts` - Entry point
- `packages/backend/src/server.ts` - Express + Socket.IO setup
- `packages/backend/src/rooms.ts` - Room management logic
- `packages/backend/src/events/room-events.ts` - Socket.IO room events
- `packages/backend/src/middleware/rate-limit.ts` - Rate limiting
- `packages/backend/src/middleware/security.ts` - Helmet config
- `packages/backend/src/routes/health.ts` - Health check route

#### Task 1.3: Docker Compose Setup
- Create docker-compose.yml with services
- Configure Nginx for reverse proxy
- Set up coturn placeholder for Sprint 3
- Create .env.example

**Files to create:**
- `docker-compose.yml`
- `nginx.conf`
- `.env.example`

#### Task 1.4: Backend Unit Tests
- Write unit tests for room state machine
- Write unit tests for UUID generation

**Files to create:**
- `packages/backend/src/__tests__/rooms.test.ts`
- `packages/backend/src/__tests__/uuid.test.ts`

**Exit Criteria:** Peers can join a room via Socket.IO. No media yet.

---

### Phase 2: WebRTC Mesh (Voice & Video)

#### Task 2.1: Frontend Scaffold
- Set up React 19.x with Vite 5.x
- Configure TailwindCSS 3.4.x with dark theme
- Set up React Router 6.x with room route (`/room/:token`)
- Create Zustand 4.x store for client state

**Files to create:**
- `packages/frontend/vite.config.ts`
- `packages/frontend/tailwind.config.js`
- `packages/frontend/src/main.tsx`
- `packages/frontend/src/App.tsx`
- `packages/frontend/src/router.tsx`
- `packages/frontend/src/stores/room-store.ts`
- `packages/frontend/index.html`

#### Task 2.2: WebRTC Integration
- Integrate simple-peer 9.11.x
- Implement SDP offer/answer relay through signalling server
- Implement ICE candidate exchange
- Configure STUN servers

**Files to create:**
- `packages/frontend/src/lib/webrtc/peer-manager.ts` - Peer connection management
- `packages/frontend/src/lib/webrtc/media.ts` - getUserMedia helpers
- `packages/frontend/src/lib/signalling.ts` - Socket.IO client wrapper
- `packages/frontend/src/hooks/use-webrtc.ts` - React hook for WebRTC

#### Task 2.3: Media Controls
- Implement mute/unmute toggle
- Implement camera on/off toggle
- Implement speaking indicator via Web Audio API

**Files to create:**
- `packages/frontend/src/components/VideoTile.tsx`
- `packages/frontend/src/components/ControlBar.tsx`
- `packages/frontend/src/hooks/use-audio-level.ts` - Speaking indicator

#### Task 2.4: Mesh Topology
- Implement full mesh connection logic for N peers
- Handle peer connection/disconnection dynamically

**Dependencies:** Tasks 2.1, 2.2

**Exit Criteria:** Two+ peers can have a live voice/video call.

---

### Phase 3: Screen Sharing & TURN

#### Task 3.1: Screen Sharing
- Implement getDisplayMedia() for screen capture
- Handle screen share track replacement in peer connections
- Implement screen share on/off toggle
- Handle browser stop button for screen share
- Implement UI: main view for screen share, smaller tiles for peers

**Files to create:**
- `packages/frontend/src/lib/webrtc/screen-share.ts`
- Update `packages/frontend/src/components/VideoGrid.tsx`

#### Task 3.2: TURN Infrastructure
- Configure coturn Docker service
- Implement server-side TURN credential generation (HMAC, 1-hour TTL)
- Create Socket.IO event to fetch TURN credentials
- Implement ICE fallback logic

**Files to create:**
- `packages/backend/src/services/turn-credentials.ts`
- `packages/backend/src/events/turn-events.ts`
- Update `packages/backend/src/server.ts`
- Update `docker-compose.yml` (coturn configuration)

**Exit Criteria:** Screen share works. NAT traversal is robust.

---

### Phase 4: Text Chat & Persistence

#### Task 4.1: Chat Backend
- Set up SQLite 3.45.x with better-sqlite3
- Create messages table schema
- Implement chat message Socket.IO events

**Files to create:**
- `packages/backend/src/db/index.ts` - SQLite connection
- `packages/backend/src/db/schema.ts` - Table creation
- `packages/backend/src/repositories/message-repository.ts`
- `packages/backend/src/events/chat-events.ts`

#### Task 4.2: Chat Frontend
- Create chat UI panel
- Implement message display with sender name and timestamp
- Implement message input with 2000 character limit
- Add HTML escaping for messages

**Files to create:**
- `packages/frontend/src/components/ChatPanel.tsx`
- `packages/frontend/src/components/MessageList.tsx`
- `packages/frontend/src/components/MessageInput.tsx`

#### Task 4.3: Persistence
- Load message history on room join
- Store display name in sessionStorage
- Handle message scope by room token

#### Task 4.4: Chat Cleanup
- Implement 24-hour chat cleanup cron job
- Soft-delete messages on room destroy
- Hard-delete after 24 hours

**Files to create:**
- `packages/backend/src/services/cleanup.ts` - Cron job

**Exit Criteria:** Chat works and survives refresh.

---

### Phase 5: UI Polish & UX

#### Task 5.1: Layout & Theme
- Implement dark-mode-first theme
- Create left sidebar: room info + controls
- Implement main video grid area (CSS Grid auto-reflow)
- Create right panel for chat
- Add light mode respecting prefers-color-scheme

**Files to create:**
- `packages/frontend/src/components/Layout.tsx`
- `packages/frontend/src/components/Sidebar.tsx`
- `packages/frontend/src/components/VideoGrid.tsx`
- Update Tailwind config for theming

#### Task 5.2: Components
- Create video tile component with avatar/name placeholder
- Create control bar: mute, camera, screen share, leave
- Create invite link copy button
- Add permission error handling UI

**Files to update:**
- `packages/frontend/src/components/ControlBar.tsx`
- `packages/frontend/src/components/VideoTile.tsx`

#### Task 5.3: Responsive & Mobile
- Implement mobile-responsive layout
- Optimize for iOS Safari and Android Chrome
- Handle iOS screen share restriction gracefully

#### Task 5.4: Typography & Icons
- Self-host Inter font
- Integrate Lucide React icons

**Files to create:**
- `packages/frontend/src/styles/globals.css` (font imports)

#### Task 5.5: Accessibility
- Add keyboard navigation
- Add ARIA labels to all controls
- Verify WCAG 2.1 AA color contrast

**Exit Criteria:** Production-quality UI. Usable by non-technical users.

---

### Phase 6: Testing, Hardening & Deploy

#### Task 6.1: Testing - Unit & Integration
- Achieve ≥70% line coverage on signalling server
- Write Vitest tests for: room state, TURN credentials, chat sanitization
- Write integration tests for Socket.IO events
- Write integration tests for REST endpoints

#### Task 6.2: Testing - E2E
- Set up Playwright 1.44.x
- Write E2E tests: create room, join, call, chat, screen share
- Write E2E tests: permission denial, invalid token, disconnect
- Run cross-browser tests

**Files to create:**
- `e2e/rooms.spec.ts`
- `e2e/call.spec.ts`
- `e2e/chat.spec.ts`
- `playwright.config.ts`

#### Task 6.3: Load & Security Testing
- Run load tests (k6): 100 concurrent rooms, 500 socket connections
- Run OWASP ZAP security scan
- Verify HTTP security headers

#### Task 6.4: DevOps
- Configure final Docker Compose production config
- Set up Let's Encrypt auto-renewal
- Complete GitHub Actions CI/CD pipeline

**Files to create:**
- `.github/workflows/ci.yml`
- `docker-compose.production.yml`

#### Task 6.5: Documentation
- Write README: how to run locally, how to test, environment variables
- Document architecture decisions

**Files to create:**
- `README.md`

**Exit Criteria:** Production-ready. All acceptance criteria verified.

---

## Dependency Graph

```
Phase 1 (Foundation)
├── Task 1.1: Project Scaffold
├── Task 1.2: Backend Signalling ← Task 1.1
├── Task 1.3: Docker Compose ← Task 1.1, Task 1.2
└── Task 1.4: Backend Tests ← Task 1.2

Phase 2 (WebRTC)
├── Task 2.1: Frontend Scaffold ← Task 1.1
├── Task 2.2: WebRTC Integration ← Task 1.2, Task 2.1
├── Task 2.3: Media Controls ← Task 2.2
└── Task 2.4: Mesh Topology ← Task 2.2

Phase 3 (Screen Share + TURN)
├── Task 3.1: Screen Sharing ← Task 2.2
└── Task 3.2: TURN ← Task 1.2

Phase 4 (Chat)
├── Task 4.1: Chat Backend ← Task 1.2
├── Task 4.2: Chat UI ← Task 2.1, Task 4.1
├── Task 4.3: Persistence ← Task 4.1
└── Task 4.4: Cleanup ← Task 4.1

Phase 5 (UI Polish)
├── Task 5.1: Layout ← Task 2.3
├── Task 5.2: Components ← Task 5.1
├── Task 5.3: Mobile ← Task 5.2
├── Task 5.4: Typography ← Task 5.1
└── Task 5.5: Accessibility ← Task 5.2

Phase 6 (Testing + Deploy)
├── Task 6.1: Unit Tests ← All Phase 1-4
├── Task 6.2: E2E Tests ← Phase 2-5
├── Task 6.3: Load/Security ← All
├── Task 6.4: DevOps ← Task 1.3, Task 6.1
└── Task 6.5: Documentation ← All
```

---

## Quick Start Priority

If minimizing time to first call, prioritize in this order:

1. **Task 1.1** + **Task 1.2** - Project setup + signalling server
2. **Task 2.1** + **Task 2.2** - Frontend + WebRTC basic voice
3. **Task 5.1** - Simple video grid layout

Full feature parity (chat, screen share, TURN) can be added after first call works.
