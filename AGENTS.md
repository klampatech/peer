## Agent Behavior

### Core Rule: NEVER Ask for User Input

**This is non-negotiable.** Once in a task, the agent operates fully autonomously.

**Prohibited behaviors (never do these):**
- ✗ Do NOT ask multi-choice questions
- ✗ Do NOT ask for feedback
- ✗ Do NOT ask for direction or guidance
- ✗ Do NOT ask for confirmation or approval
- ✗ Do NOT ask clarifying questions about how to proceed
- ✗ Do NOT ask "should I do X?" or "would you like X?"
- ✗ Do NOT present options and ask the user to pick

**Required behaviors (always do these):**
- ✓ Make autonomous decisions and proceed as if the answer is "yes"
- ✓ When encountering issues, fix them automatically and continue
- ✓ Make best-effort recommendations without seeking approval
- ✓ During loops, iterations, or retries: proceed autonomously without prompting
- ✓ When unsure, make the best reasonable choice and document the decision

---

## Build & Run

### Prerequisites
- Node.js 22.x LTS
- pnpm 9.x
- Docker 26.x + Docker Compose 2.x
- Git

### Development Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development servers (backend + frontend)
pnpm dev

# Start full stack with Docker
docker compose up
```

### Production Build

```bash
# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run all tests
pnpm test

# Build for production
pnpm build
```

---

## Validation

Run these after implementing to get immediate feedback:

### Backend Tests (Vitest)
```bash
cd packages/backend
pnpm test          # Run all backend tests
pnpm test:watch   # Run tests in watch mode
pnpm test:coverage # Run with coverage report
```

### Frontend Tests (Vitest)
```bash
cd packages/frontend
pnpm test          # Run all frontend tests
pnpm test:watch   # Run tests in watch mode
pnpm test:coverage # Run with coverage report
```

### E2E Tests (Playwright)
```bash
# Install Playwright browsers (first time)
pnpm exec playwright install

# Run E2E tests (must run from /tmp to avoid Vitest conflict)
cd /tmp && /path/to/peer/node_modules/.bin/playwright test --config=/path/to/peer/playwright.config.ts --project=chromium

# Run E2E tests with UI
pnpm exec playwright test --ui

# Run specific E2E test file
pnpm exec playwright test e2e/rooms.spec.ts

# Run E2E tests in headed mode (see browser)
pnpm exec playwright test --headed

# Generate test report
pnpm exec playwright show-report
```

**Note:** E2E tests must be run from `/tmp` to avoid a conflict between Vitest globals and Playwright. This is a known issue with the test setup.

### Full Validation Pipeline
```bash
# Run all checks before committing
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test
```

---

## Operational Notes

### Running the Application

**Development:**
```bash
# Terminal 1: Backend
cd packages/backend && pnpm dev

# Terminal 2: Frontend
cd packages/frontend && pnpm dev

# Open http://localhost:5173
```

**Docker (Production-like):**
```bash
docker compose up -d
# Open https://localhost (or configured domain)
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for production
TURN_SECRET=<your-secret>
COTURN_PORT=3478

# Optional
PORT=3000
LOG_LEVEL=info
```

### Database

SQLite database is auto-created at `packages/backend/data/peer.db`. No setup required.

### Key Ports

| Service | Port |
|---------|------|
| Frontend (Vite dev) | 5173 |
| Backend (Express) | 3000 |
| Nginx (prod) | 80/443 |
| coturn (STUN/TURN) | 3478 |

---

### Codebase Patterns

#### Backend Structure
```
packages/backend/src/
├── index.ts              # Entry point
├── server.ts             # Express + Socket.IO setup
├── rooms.ts              # Room state management
├── events/               # Socket.IO event handlers
│   ├── room-events.ts
│   ├── chat-events.ts
│   └── turn-events.ts
├── middleware/           # Express middleware
│   ├── rate-limit.ts
│   └── security.ts
├── routes/               # REST endpoints
│   └── health.ts
├── services/             # Business logic
│   ├── turn-credentials.ts
│   └── cleanup.ts
├── db/                   # SQLite persistence
│   ├── index.ts
│   └── schema.ts
└── repositories/        # Data access
    └── message-repository.ts
```

#### Frontend Structure
```
packages/frontend/src/
├── main.tsx             # React entry
├── App.tsx               # Root component
├── router.tsx            # React Router setup
├── stores/               # Zustand state
│   └── room-store.ts
├── lib/
│   ├── webrtc/           # WebRTC logic
│   │   ├── peer-manager.ts
│   │   ├── media.ts
│   │   └── screen-share.ts
│   └── signalling.ts     # Socket.IO client
├── hooks/                # React hooks
│   ├── use-webrtc.ts
│   └── use-audio-level.ts
├── components/           # UI components
│   ├── Layout.tsx
│   ├── Sidebar.tsx
│   ├── VideoGrid.tsx
│   ├── VideoTile.tsx
│   ├── ControlBar.tsx
│   ├── ChatPanel.tsx
│   ├── MessageList.tsx
│   └── MessageInput.tsx
└── styles/
    └── globals.css
```

#### Test Structure
```
packages/backend/src/__tests__/
├── rooms.test.ts
├── uuid.test.ts
├── turn-credentials.test.ts
└── chat-sanitization.test.ts

e2e/
├── playwright.config.ts
├── rooms.spec.ts
├── call.spec.ts
└── chat.spec.ts
```

#### Socket.IO Events

**Client → Server:**
- `room:create` - Create new room
- `room:join` - Join existing room
- `room:leave` - Leave current room
- `chat:message` - Send chat message
- `turn:request` - Request TURN credentials

**Server → Client:**
- `room:created` - Room created confirmation
- `peer-joined` - New peer joined room
- `peer-left` - Peer left room
- `chat:message` - New chat message
- `turn:credentials` - TURN credential response
- `sdp:offer` / `sdp:answer` - WebRTC signaling
- `ice-candidate` - ICE candidate exchange

#### State Management

- **Zustand store** (`room-store.ts`): Local media state, remote peers, chat messages, connection status
- **sessionStorage**: Display name persistence
- **Server memory**: Room state, peer tracking
- **SQLite**: Chat message history (per room)
