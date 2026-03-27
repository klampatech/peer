/* eslint-disable no-console */
import { signallingClient, type TurnCredentials } from '../signalling';
import { useRoomStore } from '../../stores/room-store';

// STUN servers for NAT traversal
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Will be updated when TURN credentials are received
let iceServers: RTCIceServer[] = [...STUN_SERVERS];

// Track TURN availability for fallback decisions
let turnAvailable: boolean = false;

// ICE transport policy - 'relay' requires TURN, 'all' allows STUN fallback
let iceTransportPolicy: RTCIceTransportPolicy = 'all';

export interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  remoteStream?: MediaStream;
}

type PeerConnectionCallback = (peerId: string, stream: MediaStream) => void;
type PeerDisconnectedCallback = (peerId: string) => void;

/**
 * Manages WebRTC peer connections for all peers in the room
 */
class PeerManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private onPeerConnected: PeerConnectionCallback | null = null;
  private onPeerDisconnected: PeerDisconnectedCallback | null = null;
  private signalingReady: boolean = false;
  // Track peers waiting for localStream to become available
  private pendingPeers: Set<string> = new Set();
  // Store bound handlers for proper cleanup
  private boundSdpOfferHandler: (event: Event) => Promise<void>;
  private boundSdpAnswerHandler: (event: Event) => Promise<void>;
  private boundIceCandidateHandler: (event: Event) => Promise<void>;

  constructor() {
    // Pre-bind handlers once in constructor for proper cleanup
    this.boundSdpOfferHandler = this.handleSdpOffer.bind(this);
    this.boundSdpAnswerHandler = this.handleSdpAnswer.bind(this);
    this.boundIceCandidateHandler = this.handleIceCandidate.bind(this);
  }

  /**
   * Initialize the peer manager with local stream
   * @param localStream - Local media stream (can be null if media unavailable)
   */
  initialize(
    localStream: MediaStream | null,
    onPeerConnected?: PeerConnectionCallback,
    onPeerDisconnected?: PeerDisconnectedCallback
  ): void {
    this.localStream = localStream;
    this.onPeerConnected = onPeerConnected || null;
    this.onPeerDisconnected = onPeerDisconnected || null;
    this.setupSignalingListeners();
    this.signalingReady = true;

    // If localStream is now available, retry any pending peer connections
    if (this.localStream && this.pendingPeers.size > 0) {
      console.log('Retrying pending peer connections:', [...this.pendingPeers]);
      this.pendingPeers.forEach((peerId) => {
        this.connectToPeer(peerId);
      });
      this.pendingPeers.clear();
    }
  }

  /**
   * Set up Socket.IO event listeners for WebRTC signaling
   */
  private setupSignalingListeners(): void {
    // Handle incoming SDP offers
    window.addEventListener('sdp:offer', this.boundSdpOfferHandler as EventListener);

    // Handle incoming SDP answers
    window.addEventListener('sdp:answer', this.boundSdpAnswerHandler as EventListener);

    // Handle incoming ICE candidates
    window.addEventListener('ice-candidate', this.boundIceCandidateHandler as EventListener);
  }

  /**
   * Clean up all peer connections
   */
  cleanup(): void {
    this.peers.forEach(({ connection }) => {
      connection.close();
    });
    this.peers.clear();
    this.localStream = null;
    this.signalingReady = false;
    this.pendingPeers.clear();

    // Remove event listeners using the same bound handlers
    window.removeEventListener('sdp:offer', this.boundSdpOfferHandler as EventListener);
    window.removeEventListener('sdp:answer', this.boundSdpAnswerHandler as EventListener);
    window.removeEventListener('ice-candidate', this.boundIceCandidateHandler as EventListener);
  }

  /**
   * Update the local stream (e.g., when user enables camera/mic after joining)
   * This triggers retry of any pending peer connections
   */
  setLocalStream(stream: MediaStream | null): void {
    const wasNull = !this.localStream;
    this.localStream = stream;

    // If localStream just became available, retry pending peers
    if (wasNull && this.localStream && this.pendingPeers.size > 0) {
      console.log('Local stream now available, retrying pending peer connections:', [...this.pendingPeers]);
      this.pendingPeers.forEach((peerId) => {
        this.connectToPeer(peerId);
      });
      this.pendingPeers.clear();
    }
  }

  /**
   * Create a new peer connection to a remote peer
   *
   * Security: DTLS cipher hardening is implicitly handled by the browser's WebRTC
   * implementation. Modern browsers use only secure cipher suites (AEAD/GCM) by default.
   * The connection uses:
   * - iceTransportPolicy - Configurable, defaults to 'all' (STUN + TURN if available)
   * - Default certificates with ECDSA key exchange
   * - No legacy DTLS 1.0 or weak ciphers (browser enforced)
   */
  private createPeerConnection(peerId: string): RTCPeerConnection {
    const connection = new RTCPeerConnection({
      iceServers,
      // Use configurable policy - defaults to 'all' for graceful fallback
      // If TURN credentials are set and available, can upgrade to 'relay'
      iceTransportPolicy,
    });

    // Add local tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        connection.addTrack(track, this.localStream!);
      });
    }

    // Handle incoming remote tracks
    connection.ontrack = (event) => {
      console.log('Received remote track from:', peerId);
      const remoteStream = event.streams[0];

      if (!remoteStream) return;

      const peer = this.peers.get(peerId);
      if (peer) {
        peer.remoteStream = remoteStream;
        useRoomStore.getState().updatePeer(peerId, { stream: remoteStream });
      } else {
        // New peer connection
        this.peers.set(peerId, {
          peerId,
          connection,
          remoteStream,
        });
        useRoomStore.getState().updatePeer(peerId, { stream: remoteStream });
      }

      this.onPeerConnected?.(peerId, remoteStream);
    };

    // Handle ICE candidates
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        signallingClient.sendIceCandidate(peerId, event.candidate.toJSON());
      }
    };

    // Handle connection state changes
    connection.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, connection.connectionState);

      if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed') {
        this.handlePeerDisconnected(peerId);
      }
    };

    return connection;
  }

  /**
   * Initiate connection to a peer (as caller)
   */
  async connectToPeer(peerId: string): Promise<void> {
    // Prevent duplicate connections to the same peer
    if (this.peers.has(peerId)) {
      console.log('Already connected to peer, skipping:', peerId);
      return;
    }

    // Check if already pending - avoid duplicate pending entries
    if (this.pendingPeers.has(peerId)) {
      console.log('Already pending connection to peer, skipping:', peerId);
      return;
    }

    if (!this.signalingReady) {
      console.warn('Signaling not ready, queuing connection to:', peerId);
      return;
    }

    // If localStream is not available, queue this peer for retry
    if (!this.localStream) {
      console.log('localStream not available, queueing peer for retry:', peerId);
      this.pendingPeers.add(peerId);
      return;
    }

    console.log('Connecting to peer:', peerId);

    // Create new peer connection
    const connection = this.createPeerConnection(peerId);
    this.peers.set(peerId, { peerId, connection });

    // Create and send SDP offer
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    signallingClient.sendSdpOffer(peerId, offer);
  }

  /**
   * Handle incoming SDP offer (as callee)
   */
  private async handleSdpOffer(event: Event): Promise<void> {
    const customEvent = event as CustomEvent<{ peerId: string; sdp: RTCSessionDescriptionInit }>;
    const { peerId, sdp } = customEvent.detail;

    console.log('Received SDP offer from:', peerId);

    let peer = this.peers.get(peerId);
    if (!peer) {
      const connection = this.createPeerConnection(peerId);
      peer = { peerId, connection };
      this.peers.set(peerId, peer);
    }

    // Set remote description
    await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));

    // Create and send SDP answer
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);

    signallingClient.sendSdpAnswer(peerId, answer);
  }

  /**
   * Handle incoming SDP answer (as caller)
   */
  private async handleSdpAnswer(event: Event): Promise<void> {
    const customEvent = event as CustomEvent<{ peerId: string; sdp: RTCSessionDescriptionInit }>;
    const { peerId, sdp } = customEvent.detail;

    console.log('Received SDP answer from:', peerId);

    const peer = this.peers.get(peerId);
    if (peer) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(event: Event): Promise<void> {
    const customEvent = event as CustomEvent<{ peerId: string; candidate: RTCIceCandidateInit }>;
    const { peerId, candidate } = customEvent.detail;

    console.log('Received ICE candidate from:', peerId);

    const peer = this.peers.get(peerId);
    if (peer && candidate) {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerDisconnected(peerId: string): void {
    console.log('Peer disconnected:', peerId);

    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
    }

    useRoomStore.getState().removePeer(peerId);
    this.onPeerDisconnected?.(peerId);
  }

  /**
   * Disconnect from a specific peer
   */
  disconnectFromPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
    }
  }

  /**
   * Get all connected peers
   */
  getPeers(): Map<string, PeerConnection> {
    return this.peers;
  }

  /**
   * Get ICE connection state for a specific peer
   */
  getIceConnectionState(peerId: string): RTCIceConnectionState | null {
    const peer = this.peers.get(peerId);
    return peer?.connection.iceConnectionState ?? null;
  }

  /**
   * Get connection state for a specific peer
   */
  getConnectionState(peerId: string): RTCPeerConnectionState | null {
    const peer = this.peers.get(peerId);
    return peer?.connection.connectionState ?? null;
  }

  /**
   * Replace local video track (for screen sharing)
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    const senders = this.peers.values();
    for (const { connection } of senders) {
      const sender = connection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }
  }

  /**
   * Get connection stats for a peer
   */
  async getStats(peerId: string): Promise<RTCStatsReport | null> {
    const peer = this.peers.get(peerId);
    if (peer) {
      return peer.connection.getStats();
    }
    return null;
  }

  /**
   * Set TURN servers from credentials received from server
   */
  setTurnServers(credentials: TurnCredentials): void {
    if (!credentials.username || !credentials.password || credentials.urls.length === 0) {
      console.warn('Invalid TURN credentials provided');
      return;
    }

    // Build TURN ice servers with credentials
    const turnServers: RTCIceServer[] = credentials.urls.map((url) => ({
      urls: url,
      username: credentials.username,
      credential: credentials.password,
    }));

    // Combine STUN and TURN servers
    // TURN servers are tried after STUN, so list STUN first for faster connection
    iceServers = [...STUN_SERVERS, ...turnServers];

    console.log('TURN servers configured:', turnServers.map((s) => s.urls));

    // Mark TURN as available - can upgrade to relay policy for better privacy
    turnAvailable = true;

    // Update existing peer connections with new ICE servers
    this.updateIceServers();
  }

  /**
   * Set the ICE transport policy
   * Use 'relay' for maximum privacy (all media through TURN)
   * Use 'all' for graceful fallback (STUN first, TURN if needed)
   *
   * @param policy - 'relay' for TURN-only, 'all' for STUN/TURN fallback
   */
  setPolicy(policy: RTCIceTransportPolicy): void {
    iceTransportPolicy = policy;
    console.log('ICE transport policy set to:', policy);
    // Update existing peer connections with new policy
    this.updateIceServers();
  }

  /**
   * Check if TURN servers are available
   * @returns true if TURN credentials have been received
   */
  isTurnAvailable(): boolean {
    return turnAvailable;
  }

  /**
   * Update ICE servers on all existing peer connections
   */
  private updateIceServers(): void {
    this.peers.forEach(({ connection }, peerId) => {
      console.log('Updating ICE servers for peer:', peerId);
      connection.setConfiguration({ iceServers, iceTransportPolicy });
    });
  }
}

// Singleton instance
export const peerManager = new PeerManager();

// Expose for E2E testing
if (typeof window !== 'undefined') {
  (window as Window & { __peerManager?: typeof peerManager }).__peerManager = peerManager;
}
