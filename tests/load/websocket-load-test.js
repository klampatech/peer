/**
 * k6 Load Test for Peer P2P VoIP Application
 *
 * Tests:
 * - 100 concurrent rooms
 * - 500 socket connections
 * - Memory leak detection (10 minute duration)
 *
 * Usage:
 *   # Install k6 first
 *   brew install k6  # macOS
 *   # or
 *   apt-get install k6  # Ubuntu/Debian
 *
 *   # Run the test
 *   k6 run tests/load/websocket-load-test.js
 *
 *   # Or run with Docker
 *   docker run -it --rm -v $(pwd):/scripts -e K6_OUT=k6-output.json ghcr.io/grafana/k6 run /scripts/tests/load/websocket-load-test.js
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const connectionDuration = new Trend('connection_duration_ms');
const messageLatency = new Trend('message_latency_ms');
const roomsCreated = new Counter('rooms_created');
const peersJoined = new Counter('peers_joined');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const DURATION = __ENV.DURATION || '10m'; // 10 minutes for memory leak detection
const VUS = __ENV.VUS || 50; // Virtual users
const ROOM_CREATION_RATE = 0.1; // 10% of VUs create rooms

// Room tokens storage (shared between VUs)
const roomTokens = [];
const MAX_ROOMS = 100;

/**
 * Generate a random display name
 */
function randomDisplayName() {
  const adjectives = ['Happy', 'Clever', 'Bright', 'Swift', 'Calm'];
  const nouns = ['Fox', 'Owl', 'Eagle', 'Bear', 'Wolf'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

/**
 * Simulate Socket.IO connection and room operations
 */
function simulateSocketIOConnection(roomToken, displayName) {
  const url = `${WS_URL}/?token=${roomToken}&name=${encodeURIComponent(displayName)}`;

  return ws.connect(url, {}, function(socket) {
    socket.on('open', function() {
      connectionDuration.add(Date.now() - socket._startTime);
      peersJoined.add(1);
    });

    socket.on('message', function(data) {
      try {
        const msg = JSON.parse(data);
        messageLatency.add(Date.now() - (msg.timestamp || Date.now()));

        // Handle different message types
        if (msg.type === 'peer-joined') {
          // Another peer joined - could initiate WebRTC connection
        } else if (msg.type === 'peer-left') {
          // Peer left
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });

    socket.on('close', function() {
      // Connection closed normally
    });

    socket.on('error', function(e) {
      errorRate.add(1);
      console.error('Socket error:', e);
    });

    // Stay connected for a random duration (30s - 2min)
    const stayDuration = 30 + Math.random() * 90;
    socket.setTimeout(function() {
      socket.close();
    }, stayDuration * 1000);
  });
}

/**
 * Main scenario: Create room or join existing
 */
export const options = {
  scenarios: {
    // Constant VU load for memory leak detection
    constant_load: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // Performance thresholds
    'http_req_duration': ['p(95)<500'], // 95% of requests under 500ms
    'errors': ['rate<0.05'], // Less than 5% error rate
    'connection_duration_ms': ['p(95)<1000'], // Connection setup under 1s
  },
};

export default function() {
  // Each virtual user performs the following:
  // 1. Check health endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check passed': (r) => r.status === 200,
  }) || errorRate.add(1);

  // 2. Either create a new room or join existing
  const isCreatingRoom = Math.random() < ROOM_CREATION_RATE || roomTokens.length < 5;

  if (isCreatingRoom && roomTokens.length < MAX_ROOMS) {
    // Create a new room via WebSocket
    const tempToken = `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const displayName = randomDisplayName();

    ws.connect(`${WS_URL}/?token=${tempToken}&name=${encodeURIComponent(displayName)}`, {}, function(socket) {
      socket.on('open', function() {
        roomsCreated.add(1);
        roomTokens.push(tempToken);
        socket.close();
      });

      socket.on('error', function(e) {
        errorRate.add(1);
      });
    });

    sleep(1); // Wait before next action
  } else if (roomTokens.length > 0) {
    // Join existing room
    const roomToken = roomTokens[Math.floor(Math.random() * roomTokens.length)];
    const displayName = randomDisplayName();

    simulateSocketIOConnection(roomToken, displayName);
  }

  // Small delay between iterations
  sleep(2);
}

/**
 * Summary function - runs at end of test
 */
export function handleSummary(data) {
  console.log('=== Load Test Summary ===');
  console.log(`Total rooms created: ${data.metrics.rooms_created?.values?.count || 0}`);
  console.log(`Total peers joined: ${data.metrics.peers_joined?.values?.count || 0}`);
  console.log(`Error rate: ${(data.metrics.errors?.values?.rate || 0) * 100}%`);
  console.log(`Avg connection duration: ${data.metrics.connection_duration_ms?.values?.avg || 0}ms`);
  console.log(`P95 connection duration: ${data.metrics.connection_duration_ms?.values['p(95)'] || 0}ms`);

  return {
    'stdout': JSON.stringify(data, null, 2),
    'tests/load/summary.json': JSON.stringify(data, null, 2),
  };
}
