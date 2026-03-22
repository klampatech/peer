/* eslint-disable no-console */
import { io, Socket } from 'socket.io-client';
import { useRoomStore } from '../stores/room-store';
import { peerManager } from './webrtc/peer-manager';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface ChatMessage {
  id: string;
  peerId: string;
  displayName: string;
  message: string;
  timestamp: string;
}

export interface TurnCredentials {
  username: string;
  password: string;
  urls: string[];
  ttl: number;
}

class SignallingClient {
  private socket: Socket | null = null;

  connect(token: string, displayName: string): Promise<void> {
    // If already connected, don't reconnect - this handles React StrictMode double-mounting
    // We check both the connection status and the stored socket ID
    if (this.socket?.connected) {
      console.log('Already connected, skipping reconnect');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Set up a timeout to reject if the server is completely unavailable
      const connectionTimeout = setTimeout(() => {
        console.warn('Connection timeout - server may be unavailable');
        reject(new Error('Connection timeout'));
      }, 10000);

      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 2000,
      });

      this.socket.on('connect', () => {
        console.log('Connected to signaling server');
        clearTimeout(connectionTimeout); // Cancel the connection timeout since we connected
        useRoomStore.getState().setPeerId(this.socket?.id || null);

        // Join the room - wait for the callback to complete
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
        clearTimeout(connectionTimeout);
        // Don't reject - resolve anyway to allow offline/local mode
        resolve();
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
      this.socket.on('turn:credentials', (response: { success: boolean; data?: TurnCredentials; error?: { code: string; message: string } }) => {
        console.log('Received TURN credentials');
        if (response.success && response.data) {
          const credentials = response.data;
          if (credentials.username && credentials.password && credentials.urls.length > 0) {
            peerManager.setTurnServers(credentials);
          }
        } else if (response.error) {
          console.error('TURN credentials error:', response.error);
        }
      });

      // Handle incoming chat messages
      this.socket.on('chat:message', (message: ChatMessage) => {
        console.log('Received chat message:', message);
        useRoomStore.getState().addMessage({
          id: message.id,
          peerId: message.peerId,
          displayName: message.displayName,
          message: message.message,
          timestamp: new Date(message.timestamp),
        });
      });

      // Handle chat history response
      this.socket.on('chat:history', (messages: ChatMessage[]) => {
        console.log('Received chat history:', messages);
        // Clear existing messages and add history
        useRoomStore.getState().clearMessages();
        for (const msg of messages) {
          useRoomStore.getState().addMessage({
            id: msg.id,
            peerId: msg.peerId,
            displayName: msg.displayName,
            message: msg.message,
            timestamp: new Date(msg.timestamp),
          });
        }
      });

      // Handle chat errors
      this.socket.on('chat:error', (error: unknown) => {
        console.error('Chat error:', error);
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

  // Send a chat message
  sendChatMessage(message: string): void {
    const { roomToken } = useRoomStore.getState();
    console.log('sendChatMessage called, roomToken:', roomToken, 'socket id:', this.socket?.id);
    if (roomToken) {
      this.socket?.emit('chat:message', { roomToken, message });
    } else {
      console.error('Cannot send chat message: no roomToken in store');
    }
  }

  // Request chat history
  requestChatHistory(): void {
    const { roomToken } = useRoomStore.getState();
    if (roomToken) {
      this.socket?.emit('chat:history', { roomToken });
    }
  }
}

export const signallingClient = new SignallingClient();
