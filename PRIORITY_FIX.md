# VOIP/WebRTC Priority Fixes

## Priority Issues

### Issue 1: Missing Duplicate Connection Guard
**Severity**: MEDIUM
**File**: packages/frontend/src/lib/webrtc/peer-manager.ts:162
**Line**: `connectToPeer` method

**Description**: `connectToPeer` does not check if a peer connection already exists for the target peerId before creating a new one. If called multiple times for the same peer, duplicate connections could be created.

**Current Code**:
```typescript
async connectToPeer(peerId: string): Promise<void> {
  if (!this.signalingReady) {
    console.warn('Signaling not ready, queuing connection to:', peerId);
    return;
  }
  // ... creates new connection without checking existing
}
```

**Recommended Fix**:
```typescript
async connectToPeer(peerId: string): Promise<void> {
  if (!this.signalingReady) {
    console.warn('Signaling not ready, queuing connection to:', peerId);
    return;
  }
  if (this.peers.has(peerId)) {
    console.warn('Peer connection already exists for:', peerId);
    return;
  }
  // ... create connection
}
```

---

### Issue 2: No Retry When localStream Unavailable During Peer-List
**Severity**: MEDIUM
**File**: packages/frontend/src/lib/signalling.ts:100-117
**Also**: packages/frontend/src/hooks/use-webrtc.ts:88-109

**Description**: When `peer-list` is received and processed, if `localStream` is not yet available, `connectToPeer` is skipped. If `localStream` becomes available later (e.g., user enables camera/mic), there is no mechanism to retry connecting to peers from the peer-list.

**Current Flow**:
1. User joins room → receives `peer-list` with existing peers
2. If `localStream` is null, `connectToPeer` is skipped for all peers
3. User enables camera/mic → localStream becomes available
4. **BUG**: User remains disconnected from peers

**Recommended Fix**:
In `signalling.ts` peer-list handler, store pending peers:
```typescript
this.socket.on('peer-list', async (peers: Array<{ id: string; displayName: string }>) => {
  const { localStream, isConnected } = useRoomStore.getState();
  for (const peer of peers) {
    useRoomStore.getState().addPeer({...});
    if (localStream && isConnected) {
      await peerManager.connectToPeer(peer.id);
    } else {
      // Store for later connection when localStream becomes available
      useRoomStore.getState().addPendingPeer(peer.id);
    }
  }
});
```

Or in `use-webrtc.ts`, trigger reconnection when localStream changes:
```typescript
useEffect(() => {
  if (isConnected && localStream) {
    peerManager.initialize(...);
    // Check for any peers that need connection
    peers.forEach((peer) => {
      if (!peerManager.getPeers().has(peer.id)) {
        peerManager.connectToPeer(peer.id);
      }
    });
  }
}, [isConnected, localStream, peers]);
```

---

### Issue 3: TURN-Only Policy With No Fallback
**Severity**: LOW
**File**: packages/frontend/src/lib/webrtc/peer-manager.ts:106

**Description**: `iceTransportPolicy: 'relay'` requires TURN server to be available. If TURN server is unavailable or misconfigured, all peer connections will fail. No fallback to STUN-only or mixed policy.

**Current Code**:
```typescript
const connection = new RTCPeerConnection({
  iceServers,
  iceTransportPolicy: 'relay',  // Forces TURN only
});
```

**Recommended Fix**:
Option A - Document the TURN dependency prominently in README and setup docs.

Option B - Add graceful fallback:
```typescript
private createPeerConnection(peerId: string): RTCPeerConnection {
  const hasTurnServers = iceServers.some(server =>
    server.urls.some(url => url.startsWith('turn'))
  );

  const connection = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: hasTurnServers ? 'relay' : 'all',
  });
  // ...
}
```

---

## Verified Working

- Double-offer collision prevention: CORRECT - joiner initiates via peer-list, existing peers wait for offers
- Private IP filtering in SDP: IMPLEMENTED - `validateSdpNoPrivateIPs` called in all SDP handlers
- Room-based authorization: IMPLEMENTED - all signaling handlers verify same-room membership
- TURN credential generation: SECURE - HMAC-SHA1 with timestamp, room membership verification
- ICE candidate handling: CORRECT - proper JSON serialization/deserialization
- Disconnect handling: PROPER - rooms cleaned up on disconnect

---

## Test Coverage Gaps

| Area | Coverage |
|------|----------|
| Signaling flow (full integration) | MISSING |
| Peer connection retry logic | MISSING |
| TURN fallback behavior | MISSING |
| Duplicate connection handling | MISSING |

**Recommendation**: Add integration tests for signaling flow with mock Socket.IO server.
