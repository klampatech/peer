# VOIP/WebRTC Evaluation

## Signaling Code Review
**pass** - 2 issues found

### Backend Signaling (packages/backend/src/events/room-events.ts)
- SDP offer handler (lines 195-235): Proper validation with Zod schema, private IP filtering via `validateSdpNoPrivateIPs`, authorization checks verifying sender is in room and target peer is in same room
- SDP answer handler (lines 238-278): Same validation and authorization pattern
- ICE candidate handler (lines 281-314): Proper validation, authorization, room-based targeting
- Uses Socket.IO rooms correctly for targeted messaging

### Frontend Signaling (packages/frontend/src/lib/signalling.ts)
- Socket.IO connection with proper reconnection handling (lines 41-47)
- Peer-list handler (lines 100-117): Initiates WebRTC connections to existing peers via `peerManager.connectToPeer`
- Peer-joined handler (lines 78-89): Correctly does NOT call connectToPeer to prevent double-offer collision
- SDP offer/answer handlers dispatch to window CustomEvents for peer-manager consumption

### Peer Manager (packages/frontend/src/lib/webrtc/peer-manager.ts)
- Proper offer/answer creation and local/remote description setting
- ICE candidate handling with proper JSON serialization
- Cleanup handlers properly remove event listeners

**Issues Found:**
1. **MEDIUM**: `connectToPeer` in peer-manager.ts:162 does not check if a connection already exists for the peer before creating a new one. If called twice for the same peer, duplicate peer connections could be created.
2. **LOW**: No guard in `connectToPeer` to prevent multiple simultaneous connection attempts to the same peer.

---

## TURN/STUN Configuration
**configured** - 1 issue found

### STUN Configuration
- Uses Google public STUN servers: `stun:stun.l.google.com:19302` and `stun:stun1.l.google.com:19302`
- Properly defined in peer-manager.ts:6-9

### TURN Configuration
- TURN credentials generated via HMAC-SHA1 in turn-credentials.ts:23-62
- Uses environment variables: `TURN_SECRET` (required), `TURN_HOST`, `COTURN_PORT`, `COTURN_TLS_PORT`, `TURN_REALM`
- Credentials endpoint at turn-events.ts:30-143 with proper room membership verification
- coturn server defined in docker-compose.yml

### ICE Transport Policy
- Uses `iceTransportPolicy: 'relay'` (peer-manager.ts:106) - a deliberate security choice
- Forces all media through TURN server to prevent private IP leakage
- Requires TURN server to be available for connections to work

**Issues Found:**
1. **LOW**: If TURN server is unavailable or misconfigured, `iceTransportPolicy: 'relay'` will cause connection failures with no fallback. This is an architectural decision but could be documented better.

---

## Peer Connection Flow
**works** - 1 issue found

### Connection Establishment Flow
1. User creates/joins room via `room:create` or `room:join` events
2. Server responds with room token and peer-list (existing peers)
3. Joining peer calls `connectToPeer` for each peer in peer-list → creates offer, sends via `sdp:offer`
4. Existing peers receive `sdp:offer` → create answer, send via `sdp:answer`
5. ICE candidates exchanged via `ice-candidate` events
6. Connection established

### Double-Offer Collision Prevention
- Correctly implemented: joiner initiates via peer-list (line 86-89 of signalling.ts has explicit comment explaining why)
- Existing peers do NOT call connectToPeer on `peer-joined`

### New Peer After Initial Connection
- When new peer joins after initial connection: they receive peer-list, initiate connections
- Existing peers receive `peer-joined` but do NOT initiate (correct for collision prevention)

**Issues Found:**
1. **MEDIUM**: In use-webrtc.ts:88-109, when `peer-list` is received and processed, if `localStream` is null at that moment, `connectToPeer` is skipped. If `localStream` becomes available later (e.g., user enables camera), there is no mechanism to retry connecting to peers from the peer-list.

---

## Issues Found

1. **[MEDIUM]** Missing duplicate connection guard in `connectToPeer`
   - Location: packages/frontend/src/lib/webrtc/peer-manager.ts:162
   - Description: `connectToPeer` does not check if a peer connection already exists for the target peerId before creating a new one
   - Impact: If called multiple times for same peer, could create duplicate connections
   - Recommended fix: Check `if (this.peers.has(peerId)) return;` at start of method

2. **[MEDIUM]** No retry mechanism when localStream is unavailable during peer-list
   - Location: packages/frontend/src/lib/signalling.ts:100-117 and use-webrtc.ts:88-109
   - Description: When peer-list is received, if localStream is not yet available, connectToPeer is skipped. No retry occurs when localStream becomes available.
   - Impact: User may join room without media, then enable camera/mic, but remain disconnected from peers
   - Recommended fix: Store pending peer connections and retry when localStream becomes available, or trigger re-connection when localStream changes

3. **[LOW]** TURN-only policy with no fallback
   - Location: packages/frontend/src/lib/webrtc/peer-manager.ts:106
   - Description: `iceTransportPolicy: 'relay'` requires TURN server availability. No fallback if TURN unavailable.
   - Impact: Connection failures if TURN server is down or misconfigured
   - Recommended fix: Document TURN server dependency clearly, or add fallback to 'all' policy with STUN-only behavior

4. **[INFO]** Limited signaling flow tests
   - Location: packages/frontend/src/__tests__/signalling.test.ts
   - Description: Tests only verify method existence, not actual signaling flow
   - Impact: No regression protection for signaling edge cases
   - Recommended fix: Add integration tests for signaling flow with mock Socket.IO

---

## Summary

| Area | Status | Issue Count |
|------|--------|-------------|
| Signaling Code | pass | 2 medium |
| TURN/STUN Config | configured | 1 low |
| Peer Connection Flow | works | 1 medium |

**Overall Assessment**: The WebRTC implementation is structurally sound with proper security measures (private IP blocking, room-based authorization, TURN enforcement). The double-offer collision prevention is correctly implemented. The main concerns are around handling edge cases where localStream is unavailable and lack of duplicate connection guards.

**Confidence Score**: 85/100

Root causes identified for issues 1-3 above. No blocking issues found - the basic signaling flow will work correctly for typical use cases.
