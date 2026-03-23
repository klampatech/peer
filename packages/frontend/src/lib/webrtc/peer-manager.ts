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

    // Remove event listeners using the same bound handlers
    window.removeEventListener('sdp:offer', this.boundSdpOfferHandler as EventListener);
    window.removeEventListener('sdp:answer', this.boundSdpAnswerHandler as EventListener);
    window.removeEventListener('ice-candidate', this.boundIceCandidateHandler as EventListener);
  }

  /**
   * Create a new peer connection to a remote peer
   */
  private createPeerConnection(peerId: string): RTCPeerConnection {
    const connection = new RTCPeerConnection({
      iceServers,
      // Use 'relay' policy to only use TURN candidates - prevents private IP leakage
      // This ensures all media goes through the TURN server for security
      iceTransportPolicy: 'relay',
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
    if (!this.signalingReady) {
      console.warn('Signaling not ready, queuing connection to:', peerId);
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

    // Update existing peer connections with new ICE servers
    this.updateIceServers();
  }

  /**
   * Update ICE servers on all existing peer connections
   */
  private updateIceServers(): void {
    this.peers.forEach(({ connection }, peerId) => {
      console.log('Updating ICE servers for peer:', peerId);
      connection.setConfiguration({ iceServers });
    });
  }
}

// Singleton instance
export const peerManager = new PeerManager();
