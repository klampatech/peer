# Peer - P2P VoIP Application

A real-time peer-to-peer voice and video calling application with text chat, screen sharing, and mesh topology for multi-party calls.

## Features

- **Voice & Video Calls** - WebRTC-based P2P communication
- **Screen Sharing** - Share your screen with other participants
- **Multi-party Mesh** - Support for multiple peers in a call
- **Text Chat** - Persistent chat messages per room
- **TURN Support** - NAT traversal via coturn
- **Mobile Responsive** - Works on desktop and mobile browsers

## Prerequisites

- Node.js 22.x LTS
- pnpm 9.x
- Docker 26.x + Docker Compose 2.x
- Git

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Start development servers (backend + frontend)
pnpm dev
```

Open http://localhost:5173 in your browser.

### Docker (Production-like)

```bash
docker compose up -d
```

Open https://localhost (or configured domain).

## Project Structure

```
packages/
├── backend/           # Express + Socket.IO server
│   └── src/
│       ├── server.ts           # Express + Socket.IO setup
│       ├── rooms.ts            # Room state management
│       ├── events/             # Socket.IO event handlers
│       │   ├── room-events.ts
│       │   ├── chat-events.ts
│       │   └── turn-events.ts
│       ├── services/           # Business logic
│       │   ├── turn-credentials.ts
│       │   └── cleanup.ts
│       └── repositories/      # Data access
│           └── message-repository.ts
│
└── frontend/          # React + Vite frontend
    └── src/
        ├── components/         # UI components
        │   ├── Layout.tsx
        │   ├── VideoGrid.tsx
        │   ├── VideoTile.tsx
        │   ├── ControlBar.tsx
        │   └── ChatPanel.tsx
        ├── lib/webrtc/         # WebRTC logic
        │   ├── peer-manager.ts
        │   └── media.ts
        └── hooks/              # React hooks
            └── use-webrtc.ts
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for production
TURN_SECRET=<your-secret>
COTURN_PORT=3478

# Optional
PORT=3000
LOG_LEVEL=info
```

## Testing

```bash
# Run all tests (unit + integration)
pnpm test

# Run backend tests
cd packages/backend && pnpm test

# Run frontend tests
cd packages/frontend && pnpm test

# Run E2E tests
pnpm exec playwright test
```

### E2E Test Commands

```bash
# Run specific test file
pnpm exec playwright test e2e/rooms.spec.ts

# Run with UI
pnpm exec playwright test --ui

# Run in headed mode (see browser)
pnpm exec playwright test --headed
```

## Running the Application

### Development

```bash
# Terminal 1: Backend
cd packages/backend && pnpm dev

# Terminal 2: Frontend
cd packages/frontend && pnpm dev

# Open http://localhost:5173
```

### Production Build

```bash
# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Build for production
pnpm build
```

## Key Ports

| Service | Port |
|---------|------|
| Frontend (Vite dev) | 5173 |
| Backend (Express) | 3000 |
| Nginx (prod) | 80/443 |
| coturn (STUN/TURN) | 3478 |

## Socket.IO Events

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
- `chat:history` - Message history on join
- `turn:credentials` - TURN credential response
- `sdp:offer` / `sdp:answer` - WebRTC signaling
- `ice-candidate` - ICE candidate exchange

## Architecture

- **Backend**: Express.js + Socket.IO for signaling
- **Frontend**: React 19 + Zustand for state management
- **WebRTC**: simple-peer for peer connections
- **Database**: SQLite (sql.js) for chat persistence
- **Real-time**: Socket.IO for signaling and chat

## License

MIT
