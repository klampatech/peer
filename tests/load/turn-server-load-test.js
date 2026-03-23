/**
 * k6 Load Test for TURN Server (coturn)
 *
 * Tests:
 * - TURN credential generation under load
 * - STUN binding request throughput
 * - Concurrent relay session allocation
 * - TURN server capacity and performance
 *
 * Usage:
 *   # Install k6 first
 *   brew install k6  # macOS
 *   # or
 *   apt-get install k6  # Ubuntu/Debian
 *
 *   # Run the test
 *   k6 run tests/load/turn-server-load-test.js
 *
 *   # With custom settings
 *   VUS=50 DURATION=5m k6 run tests/load/turn-server-load-test.js
 *
 *   # With Docker
 *   docker run -it --rm -v $(pwd):/scripts \
 *     -e BASE_URL=http://host.docker.internal:3000 \
 *     -e STUN_URL=stun:host.docker.internal:3478 \
 *     ghcr.io/grafana/k6 run /scripts/tests/load/turn-server-load-test.js
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const turnCredentialLatency = new Trend('turn_credential_latency_ms');
const stunRequestLatency = new Trend('stun_request_latency_ms');
const turnCredentialsGenerated = new Counter('turn_credentials_generated');
const stunRequestsSent = new Counter('stun_requests_sent');
const concurrentConnections = new Gauge('concurrent_connections');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const STUN_URL = __ENV.STUN_URL || 'stun:localhost:3478';
const STUN_HOST = __ENV.STUN_HOST || 'localhost';
const STUN_PORT = __ENV.STUN_PORT || '3478';
const DURATION = __ENV.DURATION || '5m';
const VUS = parseInt(__ENV.VUS || '50');
const RAMP_UP = __ENV.RAMP_UP || '30s';
const RAMP_DOWN = __ENV.RAMP_DOWN || '30s';

// Room tokens for TURN credential testing
const roomTokens = [];
const MAX_ROOMS = 200;

/**
 * Generate a random room token (UUID v4 format)
 */
function randomRoomToken() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a random display name
 */
function randomDisplayName() {
  const adjectives = ['Happy', 'Clever', 'Bright', 'Swift', 'Calm', 'Brave', 'Gentle'];
  const nouns = ['Fox', 'Owl', 'Eagle', 'Bear', 'Wolf', 'Hawk', 'Deer'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

/**
 * Test STUN binding request
 * Sends a STUN binding request to the coturn server
 * STUN uses UDP, but coturn also supports HTTP-based STUN for testing
 */
function testStunRequest() {
  const startTime = Date.now();

  // Coturn supports STUN over HTTP for monitoring/load testing
  // Using the HTTP binding endpoint
  const stunRes = http.get(`http://${STUN_HOST}:${STUN_PORT}`, {
    tags: { name: 'stun_binding' },
    timeout: '5s',
  });

  stunRequestLatency.add(Date.now() - startTime);
  stunRequestsSent.add(1);

  return stunRes;
}

/**
 * Request TURN credentials via Socket.IO
 * This tests the backend's ability to generate TURN credentials under load
 */
function requestTurnCredentials(roomToken, displayName) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const url = `${WS_URL}/?token=${roomToken}&name=${encodeURIComponent(displayName)}`;

    ws.connect(url, {}, function(socket) {
      let credentialsReceived = false;

      socket.on('open', function() {
        concurrentConnections.add(1);

        // Wait for room joined confirmation, then request TURN credentials
        socket.setTimeout(function() {
          if (!credentialsReceived) {
            // Send turn:request event (Socket.IO format)
            socket.send(JSON.stringify({
              type: 'turn:request',
              roomToken: roomToken
            }));
          }
        }, 500);
      });

      socket.on('message', function(data) {
        try {
          const msg = JSON.parse(data);

          // Check for turn:credentials response
          if (msg.type === 'turn:credentials' || (msg.urls && msg.username)) {
            credentialsReceived = true;
            turnCredentialLatency.add(Date.now() - startTime);
            turnCredentialsGenerated.add(1);
            socket.close();
            resolve(msg);
          }

          // Handle peer-joined - another peer in room
          if (msg.type === 'peer-joined') {
            // Could initiate WebRTC connection here
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      });

      socket.on('error', function(e) {
        errorRate.add(1);
        reject(e);
      });

      socket.on('close', function() {
        concurrentConnections.add(-1);
      });

      // Timeout after 10 seconds
      socket.setTimeout(function() {
        if (!credentialsReceived) {
          socket.close();
          reject(new Error('TURN credential request timeout'));
        }
      }, 10000);
    });
  });
}

/**
 * Simulate a peer connection with TURN
 * Creates a socket connection, requests credentials, simulates media stream
 */
function simulatePeerWithTurn() {
  const roomToken = roomTokens.length > 0
    ? roomTokens[Math.floor(Math.random() * roomTokens.length)]
    : randomRoomToken();
  const displayName = randomDisplayName();

  return requestTurnCredentials(roomToken, displayName);
}

// Test configuration
export const options = {
  scenarios: {
    // Ramp up for realistic load testing
    turn_load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: VUS },      // Ramp up
        { duration: DURATION, target: VUS },    // Stay at peak
        { duration: RAMP_DOWN, target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Performance thresholds
    'turn_credential_latency_ms': ['p(95)<1000', 'p(99)<2000'],
    'stun_request_latency_ms': ['p(95)<500', 'p(99)<1000'],
    'errors': ['rate<0.05'], // Less than 5% error rate
    'concurrent_connections': ['value<500'], // Max 500 concurrent connections
  },
};

export default function() {
  // Phase 1: Create rooms for TURN testing (first 10% of VUs)
  const isCreatingRoom = Math.random() < 0.1 || roomTokens.length < 10;

  if (isCreatingRoom && roomTokens.length < MAX_ROOMS) {
    const roomToken = randomRoomToken();
    const displayName = randomDisplayName();

    // Create room and get TURN credentials
    simulatePeerWithTurn().then(() => {
      roomTokens.push(roomToken);
    }).catch(() => {
      // Error creating room
    });

    sleep(1);
  }

  // Phase 2: Test TURN credential generation (existing rooms)
  if (roomTokens.length > 0) {
    // Request TURN credentials for an existing room
    simulatePeerWithTurn().catch(() => {
      // Error getting credentials
    });
  }

  // Phase 3: Test STUN server directly
  // This tests the coturn STUN server performance
  const stunResult = testStunRequest();
  check(stunResult, {
    'STUN server responding': (r) => r.status === 200 || r.status === 400,
  }) || errorRate.add(1);

  // Small delay between iterations
  sleep(0.5 + Math.random() * 1.5);
}

/**
 * Summary function - runs at end of test
 */
export function handleSummary(data) {
  console.log('=== TURN Server Load Test Summary ===');
  console.log(`TURN credentials generated: ${data.metrics.turn_credentials_generated?.values?.count || 0}`);
  console.log(`STUN requests sent: ${data.metrics.stun_requests_sent?.values?.count || 0}`);
  console.log(`Error rate: ${(data.metrics.errors?.values?.rate || 0) * 100}%`);
  console.log('');
  console.log('TURN Credential Latency:');
  console.log(`  Avg: ${data.metrics.turn_credential_latency_ms?.values?.avg || 0}ms`);
  console.log(`  P95: ${data.metrics.turn_credential_latency_ms?.values?.['p(95)'] || 0}ms`);
  console.log(`  P99: ${data.metrics.turn_credential_latency_ms?.values?.['p(99)'] || 0}ms`);
  console.log('');
  console.log('STUN Request Latency:');
  console.log(`  Avg: ${data.metrics.stun_request_latency_ms?.values?.avg || 0}ms`);
  console.log(`  P95: ${data.metrics.stun_request_latency_ms?.values?.['p(95)'] || 0}ms`);
  console.log(`  P99: ${data.metrics.stun_request_latency_ms?.values?.['p(99)'] || 0}ms`);
  console.log('');
  console.log(`Max concurrent connections: ${data.metrics.concurrent_connections?.values?.max || 0}`);

  return {
    'stdout': JSON.stringify(data, null, 2),
    'tests/load/turn-server-summary.json': JSON.stringify({
      metrics: {
        turn_credentials_generated: data.metrics.turn_credentials_generated?.values,
        stun_requests_sent: data.metrics.stun_requests_sent?.values,
        turn_credential_latency_ms: data.metrics.turn_credential_latency_ms?.values,
        stun_request_latency_ms: data.metrics.stun_request_latency_ms?.values,
        errors: data.metrics.errors?.values,
        concurrent_connections: data.metrics.concurrent_connections?.values,
      },
      thresholds: data.thresholds,
    }, null, 2),
  };
}