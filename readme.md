# Peer — Real-Time P2P VoIP Application

A production-ready peer-to-peer voice and video calling application featuring WebRTC-based mesh topology, persistent text chat, screen sharing, and NAT traversal support. Built with React 19, Express, Socket.IO, and TypeScript.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| **Voice & Video Calls** | WebRTC-based P2P communication with adaptive quality |
| **Multi-party Mesh** | Support for multiple peers via full mesh topology |
| **Screen Sharing** | Share your screen with all room participants |
| **Text Chat** | Persistent chat messages per room (SQLite-backed) |
| **TURN Support** | NAT traversal via coturn for firewall/NAT scenarios |
| **Mobile Responsive** | Works on desktop and mobile browsers |
| **End-to-End Encryption Ready** | Media streams are P2P encrypted |

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │    React     │  │   Zustand    │  │   simple-peer (WebRTC) │  │
│  │    19 UI     │  │    Store     │  │    P2P Connections     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│         │                 │                     │                 │
│         └─────────────────┼─────────────────────┘                 │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │ Socket.IO   │                              │
│                    │   Client    │                              │
│                    └──────┬──────┘                              │
└───────────────────────────┼─────────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────┼─────────────────────────────────────┐
│                    ┌──────▼──────┐      ┌─────────────────────┐  │
│                    │  Express +  │      │   SQLite (sql.js)   │  │
│                    │ Socket.IO   │◄────►│   Chat Persistence │  │
│                    │   Server    │      └─────────────────────┘  │
│                    └──────┬──────┘                              │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │   coturn    │                              │
│                    │  (TURN/     │                              │
│                    │   STUN)     │                              │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### WebRTC Mesh Topology

Each peer connects directly to every other peer in the room:

```
     Peer A
    /     \
   /       \
  Peer B───Peer C
```

- **Signaling**: All peer discovery and SDP exchange goes through the Socket.IO server
- **Media**: Peer-to-peer via WebRTC, encrypted by default
- **TURN Fallback**: When direct connection fails, coturn relays traffic

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 5, TypeScript 5 |
| **State Management** | Zustand 4 |
| **WebRTC** | simple-peer 9 |
| **Backend** | Express 4, Socket.IO 4 |
| **Database** | SQLite (sql.js 1) |
| **Validation** | Zod 3 |
| **Styling** | Tailwind CSS 3 |
| **Testing** | Vitest, Playwright |
| **Containerization** | Docker, Docker Compose |

---

## Getting Started

### Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 22.0.0 | LTS recommended |
| pnpm | ≥ 9.0.0 | Fast, disk-efficient package manager |
| Docker | ≥ 26.0.0 | For containerized deployment |
| Docker Compose | ≥ 2.0 | Included with Docker Desktop |

### Quick Start

```bash
# 1. Clone and install
git clone <repository-url>
cd peer
pnpm install

# 2. Start development servers
pnpm dev

# 3. Open in browser
open http://localhost:5173
```

The frontend proxies API requests to the backend, so you only need one command for local development.

---

## Project Structure

```
peer/
├── packages/
│   ├── backend/                 # Express + Socket.IO server
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point, port 3000
│   │   │   ├── server.ts       # Express + Socket.IO setup
│   │   │   ├── rooms.ts        # Room state (Map<token, Room>)
│   │   │   ├── db/             # SQLite database setup
│   │   │   │   ├── index.ts
│   │   │   │   └── schema.ts
│   │   │   ├── events/         # Socket.IO event handlers
│   │   │   │   ├── room-events.ts    # room:create, room:join, room:leave
│   │   │   │   ├── chat-events.ts    # chat:message, chat:history
│   │   │   │   └── turn-events.ts    # turn:request, turn:credentials
│   │   │   ├── middleware/     # Express middleware
│   │   │   │   ├── rate-limit.ts
│   │   │   │   └── security.ts
│   │   │   ├── routes/         # HTTP routes
│   │   │   │   └── health.ts
│   │   │   ├── services/       # Business logic
│   │   │   │   ├── turn-credentials.ts
│   │   │   │   └── cleanup.ts
│   │   │   ├── repositories/   # Data access layer
│   │   │   │   └── message-repository.ts
│   │   │   └── __tests__/      # Vitest unit tests
│   │   └── package.json
│   │
│   ├── frontend/               # React + Vite application
│   │   ├── src/
│   │   │   ├── main.tsx        # React entry point
│   │   │   ├── App.tsx         # Root component + routing
│   │   │   ├── components/     # UI components
│   │   │   │   ├── Layout.tsx       # App shell
│   │   │   │   ├── VideoGrid.tsx    # Video tile container
│   │   │   │   ├── VideoTile.tsx    # Individual video display
│   │   │   │   ├── ControlBar.tsx   # Call controls (mute, video, share)
│   │   │   │   ├── ChatPanel.tsx    # Chat sidebar
│   │   │   │   ├── Sidebar.tsx      # Room sidebar
│   │   │   │   ├── MessageList.tsx  # Chat message list
│   │   │   │   └── MessageInput.tsx # Chat input field
│   │   │   ├── lib/            # Core libraries
│   │   │   │   ├── signalling.ts   # Socket.IO client wrapper
│   │   │   │   └── webrtc/
│   │   │   │       ├── peer-manager.ts  # WebRTC connection manager
│   │   │   │       ├── media.ts         # getUserMedia, device management
│   │   │   │       └── screen-share.ts  # Screen sharing logic
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   │   ├── use-webrtc.ts     # Main WebRTC hook
│   │   │   │   └── use-audio-level.ts
│   │   │   ├── stores/         # Zustand stores
│   │   │   │   └── room-store.ts
│   │   │   ├── pages/          # Route pages
│   │   │   │   ├── HomePage.tsx
│   │   │   │   └── RoomPage.tsx
│   │   │   └── __tests__/      # Vitest unit tests
│   │   └── package.json
│   │
│   └── shared/                 # Shared TypeScript types
│       ├── src/
│       │   └── index.ts        # RoomToken, Room, Socket events, etc.
│       └── package.json
│
├── e2e/                        # Playwright E2E tests
│   ├── rooms.spec.ts
│   ├── call.spec.ts
│   └── chat.spec.ts
│
├── specs/                      # Specification documents
│   └── Peer_System_Design.md
│
├── tests/                      # Shared test utilities
│
├── docker-compose.yml          # Docker services (backend, nginx, coturn)
├── Dockerfile.backend
├── Dockerfile.frontend
├── playwright.config.ts        # E2E test configuration
├── tsconfig.json               # Root TypeScript configuration
├── pnpm-workspace.yaml
├── .env.example
├── AGENTS.md                   # Agent behavior guidelines
├── IMPLEMENTATION_PLAN.md      # TDD implementation plan
└── readme.md
```

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Backend server port |
| `CORS_ORIGIN` | Yes* | — | Allowed CORS origin for production |
| `TURN_SECRET` | Yes* | — | Secret for TURN credential generation |
| `COTURN_PORT` | No | `3478` | coturn server port |
| `LOG_LEVEL` | No | `info` | Logging level (debug, info, warn, error) |
| `ROOM_MAX_PARTICIPANTS` | No | `10` | Maximum peers per room |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window |

*Required for production with TURN support.

---

## Development

### Available Scripts

```bash
# Install all dependencies
pnpm install

# Start all development servers
pnpm dev

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Build all packages for production
pnpm build

# Run all tests (unit + integration)
pnpm test

# Run E2E tests
pnpm test:e2e
```

### Running Services Individually

```bash
# Terminal 1: Backend (http://localhost:3000)
cd packages/backend && pnpm dev

# Terminal 2: Frontend (http://localhost:5173)
cd packages/frontend && pnpm dev
```

### Key Ports

| Service | Port | Notes |
|---------|------|-------|
| Frontend (Vite) | 5173 | Dev server with API proxy |
| Backend (Express) | 3000 | REST + Socket.IO |
| Nginx | 80/443 | Production reverse proxy |
| coturn | 3478 | STUN/TURN server |

---

## Testing

### Test Structure

```
tests/
├── unit/           # Vitest unit tests
├── integration/    # API integration tests
└── e2e/           # Playwright end-to-end tests
```

### Running Tests

```bash
# All tests
pnpm test

# Backend tests only
cd packages/backend && pnpm test

# Frontend tests only
cd packages/frontend && pnpm test

# E2E tests only
pnpm test:e2e
```

### E2E Test Commands

```bash
# Run all E2E tests
pnpm exec playwright test

# Run specific test file
pnpm exec playwright test e2e/rooms.spec.ts

# Run with Playwright UI
pnpm exec playwright test --ui

# Run in headed mode (visible browser)
pnpm exec playwright test --headed

# Debug specific test
pnpm exec playwright test e2e/call.spec.ts --debug
```

### Browser Matrix

E2E tests run against:

| Browser | Platform |
|---------|----------|
| Chromium | Desktop |
| Firefox | Desktop |
| WebKit | Desktop |
| Microsoft Edge | Desktop |
| Chrome | Mobile |
| Safari | Mobile |

---

## Deployment

### Docker Compose (Recommended)

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Services

| Service | Description | Port |
|---------|-------------|------|
| `backend` | Express + Socket.IO server | 3000 |
| `nginx` | Reverse proxy with SSL termination | 80/443 |
| `coturn` | TURN/STUN server for NAT traversal | 3478 |

### Manual Production Build

```bash
# 1. Build all packages
pnpm build

# 2. Configure environment
cp .env.example .env
# Edit .env with production values

# 3. Start services
cd packages/backend && node dist/index.js
```

---

## API Reference

### REST Endpoints

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345,
  "rooms": 5,
  "peers": 12
}
```

### Socket.IO Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ roomName: string }` | Create a new room |
| `room:join` | `{ roomToken: string }` | Join existing room |
| `room:leave` | `{ roomToken: string }` | Leave current room |
| `chat:message` | `{ roomToken: string, content: string }` | Send chat message |
| `turn:request` | `{}` | Request TURN credentials |
| `sdp:offer` | `{ targetPeerId: string, sdp: RTCSessionDescription }` | Send SDP offer |
| `sdp:answer` | `{ targetPeerId: string, sdp: RTCSessionDescription }` | Send SDP answer |
| `ice-candidate` | `{ targetPeerId: string, candidate: RTCIceCandidate }` | Send ICE candidate |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room:created` | `{ roomToken: string, roomName: string }` | Room created confirmation |
| `room:joined` | `{ room: Room, peers: RoomPeer[] }` | Joined room with existing peers |
| `peer-joined` | `{ peer: RoomPeer }` | New peer joined room |
| `peer-left` | `{ peerId: string }` | Peer left room |
| `chat:message` | `{ message: ChatMessage }` | New chat message |
| `chat:history` | `{ messages: ChatMessage[] }` | Message history on join |
| `turn:credentials` | `{ username: string, credential: string, ttl: number }` | TURN credentials |
| `sdp:offer` | `{ peerId: string, sdp: RTCSessionDescription }` | SDP offer from peer |
| `sdp:answer` | `{ peerId: string, sdp: RTCSessionDescription }` | SDP answer from peer |
| `ice-candidate` | `{ peerId: string, candidate: RTCIceCandidate }` | ICE candidate from peer |
| `error` | `{ code: string, message: string }` | Error notification |

---

## Troubleshooting

### WebRTC Connection Issues

**Symptom:** Peers cannot connect directly.

**Solutions:**
1. Ensure TURN server is configured and accessible
2. Check firewall rules for UDP/TCP 3478
3. Verify `TURN_SECRET` is set correctly

### Camera/Microphone Not Working

**Symptom:** Cannot get local media stream.

**Solutions:**
1. Check browser permissions for camera/microphone
2. Ensure no other application is using the devices
3. Try disconnecting and reconnecting devices

### Chat Messages Not Persisting

**Symptom:** Messages disappear after server restart.

**Solutions:**
1. In production, mount a volume for SQLite persistence
2. Check `docker-compose.yml` volume configuration

### Rate Limiting Triggered

**Symptom:** Getting rate limit errors.

**Solutions:**
1. Adjust `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`
2. Check for misbehaving clients or excessive reconnection attempts

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit changes: `git commit -m 'feat(scope): add your feature'`
4. Push to branch: `git push origin feat/your-feature`
5. Open a Pull Request

### Code Standards

- TypeScript strict mode enabled
- Run `pnpm typecheck` and `pnpm lint` before committing
- Write tests for new features
- Follow existing code patterns

---

## License

MIT
