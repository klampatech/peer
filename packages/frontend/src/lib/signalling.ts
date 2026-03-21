import { io, Socket } from 'socket.io-client';
import { useRoomStore } from '../stores/room-store';
import { peerManager } from './webrtc/peer-manager';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface TurnCredentials {
  username: string;
  password: string;
  urls: string[];
  ttl: number;
}

class SignallingClient {
  private socket: Socket | null = null;

  connect(token: string, displayName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('Connected to signaling server');
        useRoomStore.getState().setPeerId(this.socket?.id || null);

        // Join the room
        this.socket?.emit('room:join', { token, displayName }, (response: { success: boolean; error?: { message?: string } }) => {
          if (response.success) {
            useRoomStore.getState().setConnected(true);
            useRoomStore.getState().setRoomToken(token);
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to join room'));
          }
        });
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from signaling server');
        useRoomStore.getState().setConnected(false);
      });

      // Handle peer joined
      this.socket.on('peer-joined', async (data: { peerId: string; displayName: string }) => {
        console.log('Peer joined:', data);
        useRoomStore.getState().addPeer({
          id: data.peerId,
          displayName: data.displayName,
          audioEnabled: true,
          videoEnabled: true,
        });

        // Initiate WebRTC connection to the new peer
        const { localStream, isConnected } = useRoomStore.getState();
        if (localStream && isConnected) {
          await peerManager.connectToPeer(data.peerId);
        }
      });

      // Handle peer left
      this.socket.on('peer-left', (data: { peerId: string }) => {
        console.log('Peer left:', data);
        // Clean up WebRTC connection
        peerManager.disconnectFromPeer(data.peerId);
        useRoomStore.getState().removePeer(data.peerId);
      });

      // Handle peer list (when joining existing room)
      this.socket.on('peer-list', async (peers: Array<{ id: string; displayName: string }>) => {
        console.log('Peer list:', peers);
        const { localStream, isConnected } = useRoomStore.getState();

        for (const peer of peers) {
          useRoomStore.getState().addPeer({
            id: peer.id,
            displayName: peer.displayName,
            audioEnabled: true,
            videoEnabled: true,
          });

          // Initiate WebRTC connection to each existing peer
          if (localStream && isConnected) {
            await peerManager.connectToPeer(peer.id);
          }
        }
      });

      // Handle WebRTC signaling
      this.socket.on('sdp:offer', (data: { peerId: string; sdp: RTCSessionDescriptionInit }) => {
        console.log('Received SDP offer from:', data.peerId);
        // Handle in peer-manager
        window.dispatchEvent(new CustomEvent('sdp:offer', { detail: data }));
      });

      this.socket.on('sdp:answer', (data: { peerId: string; sdp: RTCSessionDescriptionInit }) => {
        console.log('Received SDP answer from:', data.peerId);
        window.dispatchEvent(new CustomEvent('sdp:answer', { detail: data }));
      });

      this.socket.on('ice-candidate', (data: { peerId: string; candidate: RTCIceCandidateInit }) => {
        console.log('Received ICE candidate from:', data.peerId);
        window.dispatchEvent(new CustomEvent('ice-candidate', { detail: data }));
      });

      // Handle TURN credentials
      this.socket.on('turn:credentials', (credentials: TurnCredentials) => {
        console.log('Received TURN credentials');
        if (credentials.username && credentials.password && credentials.urls.length > 0) {
          peerManager.setTurnServers(credentials);
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    useRoomStore.getState().reset();
  }

  // Send SDP offer to a specific peer
  sendSdpOffer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.socket?.emit('sdp:offer', { targetPeerId, sdp });
  }

  // Send SDP answer to a specific peer
  sendSdpAnswer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.socket?.emit('sdp:answer', { targetPeerId, sdp });
  }

  // Send ICE candidate to a specific peer
  sendIceCandidate(targetPeerId: string, candidate: RTCIceCandidateInit): void {
    this.socket?.emit('ice-candidate', { targetPeerId, candidate });
  }

  // Get socket ID
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // Request TURN credentials from server
  requestTurnCredentials(): void {
    this.socket?.emit('turn:request');
  }
}

export const signallingClient = new SignallingClient();
