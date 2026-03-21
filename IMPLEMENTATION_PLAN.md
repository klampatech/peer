# Peer P2P VoIP Application - Implementation Plan

## Gap Analysis Summary

**Specification:** `specs/Peer_System_Design.md`
**Current Codebase:** Core infrastructure complete. WebRTC P2P implementation in progress.

### What Needs to Be Built

The complete Peer P2P VoIP application including:
- React 19.x frontend with Vite 5.x
- Node.js 22.x backend with Socket.IO signalling server
- WebRTC mesh for voice/video/screen sharing
- SQLite persistence for text chat
- Docker Compose infrastructure
- Full test suite (TDD approach)

---

## Test-Driven Development Approach

This implementation plan follows **Test-First Development** (TDD). Tests are written **before** implementation for every feature.

### TDD Workflow Per Task

1. **Write failing test** - Define expected behavior
2. **Run test** - Verify it fails (red)
3. **Write minimal implementation** - Make test pass
4. **Refactor** - Improve code while keeping tests green
5. **Run full test suite** - Ensure no regressions

### Test Types

| Type | Tool | Scope | When |
|------|------|-------|------|
| Unit | Vitest | Backend business logic, utilities | Every task |
| Integration | Vitest + supertest | API endpoints, Socket.IO events | Every task |
| E2E | Playwright | Full user flows, multi-peer scenarios | After feature works in isolation |
| Accessibility | Playwright + axe | WCAG compliance | UI tasks |

### Test Coverage Targets

- Backend unit tests: ≥70% line coverage
- Integration tests: 100% of Socket.IO events
- E2E: All AC (Acceptance Criteria) from spec

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

**TDD Steps:**
1. Write test: `room.test.ts` - Room creation returns valid UUID token
2. Write test: `room.test.ts` - Room join emits `peer-joined` to existing peers
3. Write test: `room.test.ts` - Last peer leaving destroys room
4. Write test: `health.test.ts` - Health endpoint returns 200

**Implementation:**
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

**Test Files (write FIRST):**
- `packages/backend/src/__tests__/rooms.test.ts`
- `packages/backend/src/__tests__/uuid.test.ts`
- `packages/backend/src/__tests__/health.test.ts`

**Exit Criteria:** Peers can join a room via Socket.IO. No media yet.

---

#### Task 1.3: Docker Compose Setup
- Create docker-compose.yml with services
- Configure Nginx for reverse proxy
- Set up coturn placeholder for Sprint 3
- Create .env.example

**Files to create:**
- `docker-compose.yml`
- `nginx.conf`
- `.env.example`

**Exit Criteria:** `docker compose up` starts all services without errors.

---

#### Task 1.4: Backend Unit Tests - TDD Continuation

**Write tests for:**
- Room state machine (create → join → leave → destroy)
- UUID v4 token format validation
- Rate limiting on join events
- Security headers presence

**Files to create:**
- `packages/backend/src/__tests__/rooms.test.ts`
- `packages/backend/src/__tests__/uuid.test.ts`
- `packages/backend/src/__tests__/rate-limit.test.ts`

**Exit Criteria:** All unit tests pass. ≥70% line coverage on signalling logic.

---

### Phase 2: WebRTC Mesh (Voice & Video)

#### Task 2.1: Frontend Scaffold

**TDD Steps:**
1. Write test: Router navigates to `/room/:token`
2. Write test: Zustand store initializes with correct defaults
3. Write test: Media permissions prompt appears

**Implementation:**
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

**Test Files (write FIRST):**
- `packages/frontend/src/__tests__/room-store.test.ts`
- `packages/frontend/src/__tests__/router.test.tsx`

---

#### Task 2.2: WebRTC Integration ✓ COMPLETED

**TDD Steps:**
1. Write test: `peer-manager.test.ts` - Creates peer connection on signal exchange
2. Write test: `peer-manager.test.ts` - Handles ICE candidate exchange
3. Write test: `signalling.test.ts` - Connects to Socket.IO server
4. Write test: E2E - Two browser tabs establish WebRTC connection

**Implementation:**
- Integrate simple-peer 9.11.x
- Implement SDP offer/answer relay through signalling server
- Implement ICE candidate exchange
- Configure STUN servers

**Files created:**
- `packages/frontend/src/lib/webrtc/peer-manager.ts` - Peer connection management
- `packages/frontend/src/lib/webrtc/media.ts` - getUserMedia helpers
- `packages/frontend/src/lib/signalling.ts` - Socket.IO client wrapper (updated)
- `packages/frontend/src/hooks/use-webrtc.ts` - React hook for WebRTC

**Status:** Implementation complete. WebRTC peer connections work.

**Test Files (write FIRST):**
- `packages/frontend/src/__tests__/peer-manager.test.ts`
- `packages/frontend/src/__tests__/signalling.test.ts`

**E2E Tests (write after basic flow works):**
- `e2e/webrtc-basic.spec.ts` - Two peers connect and exchange media

---

#### Task 2.3: Media Controls ✓ COMPLETED

**TDD Steps:**
1. Write test: Mute button toggles local audio track enabled state ✓
2. Write test: Camera button toggles local video track enabled state ✓
3. Write test: Speaking indicator activates on audio input ✓
4. Write test: E2E - Remote peer sees mute/camera state (pending Phase 6)

**Implementation:**
- Implement mute/unmute toggle ✓
- Implement camera on/off toggle ✓
- Implement speaking indicator via Web Audio API ✓

**Files created:**
- `packages/frontend/src/components/VideoTile.tsx` - Video tile with avatar, speaking indicator
- `packages/frontend/src/components/ControlBar.tsx` - Mute, camera, screen share, leave buttons
- `packages/frontend/src/hooks/use-audio-level.ts` - Speaking indicator via Web Audio API
- `packages/frontend/src/__tests__/ControlBar.test.tsx` - 7 tests
- `packages/frontend/src/__tests__/VideoTile.test.tsx` - 17 tests

**Test Files (write FIRST):**
- `packages/frontend/src/__tests__/use-audio-level.test.ts`
- `packages/frontend/src/__tests__/ControlBar.test.tsx`

---

#### Task 2.4: Mesh Topology ✓ COMPLETED

**TDD Steps:**
1. Write test: Third peer joining creates mesh connections to both existing peers ✓
2. Write test: Peer disconnecting removes its connections ✓
3. Write test: E2E - Four peers maintain stable mesh for 30 seconds (pending Phase 6)

**Implementation:**
- Full mesh connection logic implemented via signalling events (peer-joined, peer-list)
- Peer connection/disconnection handled dynamically via Socket.IO events

**Status:** Mesh topology working. Backend sends peer-list to new joiners and peer-joined to existing peers. Frontend initiates WebRTC connections bidirectionally.

**Dependencies:** Tasks 2.1, 2.2

**Exit Criteria:** Two+ peers can have a live voice/video call. ✓

---

### Phase 3: Screen Sharing & TURN

#### Task 3.1: Screen Sharing ✓ COMPLETED

**TDD Steps:**
1. Write test: `screen-share.test.ts` - getDisplayMedia returns stream ✓ (in media.ts)
2. Write test: Screen share track replaces camera track in peer connection ✓
3. Write test: Browser stop button triggers track ended event ✓
4. Write test: E2E - Screen share visible to other peers (pending Phase 6)

**Implementation:**
- Implement getDisplayMedia() for screen capture ✓
- Handle screen share track replacement in peer connections via peerManager.replaceVideoTrack() ✓
- Implement screen share on/off toggle in ControlBar ✓
- Handle browser stop button for screen share ✓
- Fix: ControlBar now properly propagates video tracks to all peers

**Files created/updated:**
- `packages/frontend/src/lib/webrtc/media.ts` - getDisplayMedia() function
- `packages/frontend/src/lib/webrtc/peer-manager.ts` - replaceVideoTrack() method
- `packages/frontend/src/components/ControlBar.tsx` - Fixed screen share toggle
- `packages/frontend/src/hooks/use-webrtc.ts` - startScreenShare/stopScreenShare hooks

**Test Files:**
- `packages/frontend/src/__tests__/ControlBar.test.tsx` - Updated with screen share tests

**E2E Tests:**
- `e2e/screen-share.spec.ts` (pending Phase 6)

---

#### Task 3.2: TURN Infrastructure

**TDD Steps:**
1. Write test: TURN credentials generated with correct TTL
2. Write test: TURN credentials rejected after expiry
3. Write test: Socket.IO event returns credentials to authenticated peer
4. Write test: E2E - Peers behind symmetric NAT connect via TURN

**Implementation:**
- Configure coturn Docker service
- Implement server-side TURN credential generation (HMAC, 1-hour TTL)
- Create Socket.IO event to fetch TURN credentials
- Implement ICE fallback logic

**Files to create:**
- `packages/backend/src/services/turn-credentials.ts`
- `packages/backend/src/events/turn-events.ts`
- Update `packages/backend/src/server.ts`
- Update `docker-compose.yml` (coturn configuration)

**Test Files (write FIRST):**
- `packages/backend/src/__tests__/turn-credentials.test.ts`

**Exit Criteria:** Screen share works. NAT traversal is robust.

---

### Phase 4: Text Chat & Persistence

#### Task 4.1: Chat Backend

**TDD Steps:**
1. Write test: Message saved to SQLite with room token
2. Write test: Messages retrieved by room token
3. Write test: HTML in messages is sanitized before storage
4. Write test: Message over 2000 chars is rejected

**Implementation:**
- Set up SQLite 3.45.x with better-sqlite3
- Create messages table schema
- Implement chat message Socket.IO events

**Files to create:**
- `packages/backend/src/db/index.ts` - SQLite connection
- `packages/backend/src/db/schema.ts` - Table creation
- `packages/backend/src/repositories/message-repository.ts`
- `packages/backend/src/events/chat-events.ts`

**Test Files (write FIRST):**
- `packages/backend/src/__tests__/message-repository.test.ts`
- `packages/backend/src/__tests__/chat-sanitization.test.ts`

---

#### Task 4.2: Chat Frontend

**TDD Steps:**
1. Write test: Message sent via Socket.IO event
2. Write test: Messages displayed with sender name and timestamp
3. Write test: Input rejects text over 2000 characters
4. Write test: E2E - Two peers exchange chat messages

**Implementation:**
- Create chat UI panel
- Implement message display with sender name and timestamp
- Implement message input with 2000 character limit
- Add HTML escaping for messages

**Files to create:**
- `packages/frontend/src/components/ChatPanel.tsx`
- `packages/frontend/src/components/MessageList.tsx`
- `packages/frontend/src/components/MessageInput.tsx`

**Test Files (write FIRST):**
- `packages/frontend/src/__tests__/MessageInput.test.tsx`
- `packages/frontend/src/__tests__/MessageList.test.tsx`

**E2E Tests:**
- `e2e/chat.spec.ts`

---

#### Task 4.3: Persistence

**TDD Steps:**
1. Write test: Messages persist across page refresh
2. Write test: Same user rejoining sees message history
3. Write test: Different room has separate message history

**Implementation:**
- Load message history on room join
- Store display name in sessionStorage
- Handle message scope by room token

**Exit Criteria:** Chat works and survives refresh.

---

#### Task 4.4: Chat Cleanup

**TDD Steps:**
1. Write test: Soft-delete messages on room destroy
2. Write test: Hard-delete removes messages older than 24 hours
3. Write test: Cleanup job runs on schedule

**Implementation:**
- Implement 24-hour chat cleanup cron job
- Soft-delete messages on room destroy
- Hard-delete after 24 hours

**Files to create:**
- `packages/backend/src/services/cleanup.ts` - Cron job

**Test Files (write FIRST):**
- `packages/backend/src/__tests__/cleanup.test.ts`

---

### Phase 5: UI Polish & UX

#### Task 5.1: Layout & Theme

**TDD Steps:**
1. Write test: Video grid reflows when peer count changes
2. Write test: Dark mode applied by default
3. Write test: Light mode activates with prefers-color-scheme

**Implementation:**
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

**Test Files (write FIRST):**
- `packages/frontend/src/__tests__/VideoGrid.test.tsx`
- `packages/frontend/src/__tests__/Layout.test.tsx`

---

#### Task 5.2: Components

**TDD Steps:**
1. Write test: Video tile shows avatar when camera off
2. Write test: Control bar buttons trigger correct actions
3. Write test: Invite link copy button copies to clipboard
4. Write test: Permission denied shows error UI

**Implementation:**
- Create video tile component with avatar/name placeholder
- Create control bar: mute, camera, screen share, leave
- Create invite link copy button
- Add permission error handling UI

**Files to update:**
- `packages/frontend/src/components/ControlBar.tsx`
- `packages/frontend/src/components/VideoTile.tsx`

**Test Files (write FIRST):**
- `packages/frontend/src/__tests__/VideoTile.test.tsx`
- `packages/frontend/src/__tests__/ControlBar.test.tsx`

**E2E Tests:**
- `e2e/permission-denied.spec.ts`

---

#### Task 5.3: Responsive & Mobile

**TDD Steps:**
1. Write test: Mobile layout stacks vertically
2. Write test: iOS screen share restriction handled gracefully

**Implementation:**
- Implement mobile-responsive layout
- Optimize for iOS Safari and Android Chrome
- Handle iOS screen share restriction gracefully

---

#### Task 5.4: Typography & Icons

**Implementation:**
- Self-host Inter font
- Integrate Lucide React icons

**Files to create:**
- `packages/frontend/src/styles/globals.css` (font imports)

---

#### Task 5.5: Accessibility

**TDD Steps:**
1. Write test (Playwright + axe): All interactive elements keyboard accessible
2. Write test: ARIA labels present on all controls
3. Write test: Color contrast meets WCAG AA

**Implementation:**
- Add keyboard navigation
- Add ARIA labels to all controls
- Verify WCAG 2.1 AA color contrast

**E2E Tests:**
- `e2e/accessibility.spec.ts`

**Exit Criteria:** Production-quality UI. Usable by non-technical users.

---

### Phase 6: Testing, Hardening & Deploy

#### Task 6.1: Testing - Unit & Integration Finalization

**TDD Steps:**
1. Run full unit test suite
2. Achieve ≥70% line coverage on signalling server
3. All Socket.IO events covered by integration tests

**Write tests for:**
- Room state edge cases
- TURN credential generation edge cases
- Chat sanitization edge cases
- Rate limiting edge cases

**Exit Criteria:** ≥70% line coverage on signalling server.

---

#### Task 6.2: Testing - E2E Full Suite

**E2E Test Files (all acceptance criteria):**

```typescript
// e2e/rooms.spec.ts
- Room creation generates unique invite URL
- Room join via invite URL works
- Invalid room token shows error
- Room auto-destroys when last peer leaves

// e2e/call.spec.ts
- Voice call establishes between two peers
- Video call shows video tiles
- Mute toggle works
- Camera toggle works
- Screen share works
- Screen share stop works

// e2e/chat.spec.ts
- Chat message sent and received
- Chat persists across page refresh
- Message length validation (2000 chars)
- HTML sanitization works

// e2e/nat-traversal.spec.ts
- Peers on same LAN connect quickly
- Peers behind symmetric NAT use TURN
- ICE restart on transient failure

// e2e/accessibility.spec.ts
- All controls keyboard accessible
- ARIA labels present
- WCAG AA contrast
```

**Cross-Browser Tests:**
```bash
# Run against all browsers
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=firefox
pnpm exec playwright test --project=safari
```

---

#### Task 6.3: Load & Security Testing

**TDD Steps:**
1. Write k6 script: 100 concurrent rooms, 500 socket connections
2. Verify no memory leak after 10 minutes
3. Run OWASP ZAP baseline scan
4. Verify security headers present

**Implementation:**
- Run load tests (k6): 100 concurrent rooms, 500 socket connections
- Run OWASP ZAP security scan
- Verify HTTP security headers

---

#### Task 6.4: DevOps

**Implementation:**
- Configure final Docker Compose production config
- Set up Let's Encrypt auto-renewal
- Complete GitHub Actions CI/CD pipeline

**Files to create:**
- `.github/workflows/ci.yml`
- `docker-compose.production.yml`

**CI Pipeline:**
```yaml
# .github/workflows/ci.yml
stages:
  - lint
  - typecheck
  - test:unit
  - test:e2e
  - build
  - security-scan
```

---

#### Task 6.5: Documentation

**Implementation:**
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
│   └── [TDD] Write tests FIRST for room events
├── Task 1.3: Docker Compose ← Task 1.1, Task 1.2
└── Task 1.4: Backend Tests ← Task 1.2
    └── [TDD] Write tests for all room state machine paths

Phase 2 (WebRTC)
├── Task 2.1: Frontend Scaffold ← Task 1.1
│   └── [TDD] Write tests for router and store
├── Task 2.2: WebRTC Integration ← Task 1.2, Task 2.1
│   └── [TDD] Write tests for peer connection lifecycle
├── Task 2.3: Media Controls ← Task 2.2 ✓ COMPLETED
│   └── [TDD] Write tests for mute/camera toggles ✓
└── Task 2.4: Mesh Topology ← Task 2.2
    └── [TDD] Write E2E tests for N-peer mesh

Phase 3 (Screen Share + TURN)
├── Task 3.1: Screen Sharing ← Task 2.2
│   └── [TDD] Write tests for screen share track handling
└── Task 3.2: TURN ← Task 1.2
    └── [TDD] Write tests for credential generation

Phase 4 (Chat)
├── Task 4.1: Chat Backend ← Task 1.2
│   └── [TDD] Write tests for SQLite operations
├── Task 4.2: Chat UI ← Task 2.1, Task 4.1
│   └── [TDD] Write tests for chat components
├── Task 4.3: Persistence ← Task 4.1
│   └── [TDD] Write tests for message persistence
└── Task 4.4: Cleanup ← Task 4.1
    └── [TDD] Write tests for cleanup job

Phase 5 (UI Polish)
├── Task 5.1: Layout ← Task 2.3
│   └── [TDD] Write tests for grid reflow
├── Task 5.2: Components ← Task 5.1
│   └── [TDD] Write tests for all UI components
├── Task 5.3: Mobile ← Task 5.2
├── Task 5.4: Typography ← Task 5.1
└── Task 5.5: Accessibility ← Task 5.2
    └── [TDD] Write axe tests for WCAG compliance

Phase 6 (Testing + Deploy)
├── Task 6.1: Unit Tests ← All Phase 1-4
│   └── Finalize coverage to ≥70%
├── Task 6.2: E2E Tests ← Phase 2-5
│   └── All acceptance criteria covered
├── Task 6.3: Load/Security ← All
├── Task 6.4: DevOps ← Task 1.3, Task 6.1
└── Task 6.5: Documentation ← All
```

---

## Quick Start Priority

If minimizing time to first call, prioritize in this order:

1. **Task 1.1** + **Task 1.2** - Project setup + signalling server
   - [TDD] Write `rooms.test.ts` first
2. **Task 2.1** + **Task 2.2** - Frontend + WebRTC basic voice
   - [TDD] Write `peer-manager.test.ts` first
3. **Task 5.1** - Simple video grid layout
   - [TDD] Write `VideoGrid.test.tsx` first

Full feature parity (chat, screen share, TURN) can be added after first call works.

---

## Test Commands Reference

```bash
# Backend
cd packages/backend
pnpm test                    # Run all backend tests
pnpm test:watch              # Watch mode
pnpm test:coverage           # Coverage report

# Frontend
cd packages/frontend
pnpm test                    # Run all frontend tests
pnpm test:watch              # Watch mode
pnpm test:coverage           # Coverage report

# E2E
pnpm exec playwright test                    # All E2E tests
pnpm exec playwright test e2e/rooms.spec.ts  # Specific file
pnpm exec playwright test --ui              # Interactive UI
pnpm exec playwright test --headed          # See browser

# Full pipeline
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test
```
