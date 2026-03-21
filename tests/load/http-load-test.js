/**
 * k6 HTTP Load Test for Peer P2P VoIP Application
 *
 * Tests HTTP endpoints to ensure server handles load:
 * - Health endpoint
 * - Room operations (simulated via HTTP)
 *
 * Usage:
 *   k6 run tests/load/http-load-test.js
 *
 *   # With custom settings
 *   VUS=100 DURATION=5m k6 run tests/load/http-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const httpReqDuration = new Trend('http_req_duration');
const roomsCreated = new Counter('rooms_created');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || '100');
const DURATION = __ENV.DURATION || '5m';
const RAMP_UP = __ENV.RAMP_UP || '30s';
const RAMP_DOWN = __ENV.RAMP_DOWN || '30s';

// Thresholds
export const options = {
  scenarios: {
    // Gradual ramp up for realistic load testing
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: VUS }, // Ramp up
        { duration: DURATION, target: VUS }, // Stay at peak
        { duration: RAMP_DOWN, target: 0 }, // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'errors': ['rate<0.01'], // Less than 1% error rate
    'http_reqs': ['rate>100'], // At least 100 req/s
  },
};

export default function() {
  // Test 1: Health endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  httpReqDuration.add(healthRes.timings.duration);

  const healthCheck = check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response is valid JSON': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok';
      } catch (e) {
        return false;
      }
    },
  });

  if (!healthCheck) {
    errorRate.add(1);
  }

  // Test 2: Concurrent connections (simulate room creation requests)
  // Note: Room creation happens via Socket.IO, but we can test connection overhead
  const roomRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'room_health' },
  });
  httpReqDuration.add(roomRes.timings.duration);

  // Test 3: Connection keep-alive
  const keepAliveRes = http.get(`${BASE_URL}/health`, {
    headers: {
      'Connection': 'keep-alive',
    },
    tags: { name: 'keep_alive' },
  });
  httpReqDuration.add(keepAliveRes.timings.duration);

  // Random delay between requests (simulate real user behavior)
  sleep(0.1 + Math.random() * 0.5);
}

/**
 * Summary function - runs at end of test
 */
export function handleSummary(data) {
  const summary = {
    'tests/load/http-summary.json': JSON.stringify({
      metrics: {
        http_reqs: data.metrics.http_reqs?.values,
        http_req_duration: data.metrics.http_req_duration?.values,
        errors: data.metrics.errors?.values,
      },
      thresholds: data.thresholds,
    }, null, 2),
  };

  console.log('=== HTTP Load Test Summary ===');
  console.log(`Total requests: ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`Request rate: ${data.metrics.http_reqs?.values?.rate || 0}/s`);
  console.log(`Avg response time: ${data.metrics.http_req_duration?.values?.avg || 0}ms`);
  console.log(`P95 response time: ${data.metrics.http_req_duration?.values?.['p(95)'] || 0}ms`);
  console.log(`P99 response time: ${data.metrics.http_req_duration?.values?.['p(99)'] || 0}ms`);
  console.log(`Error rate: ${(data.metrics.errors?.values?.rate || 0) * 100}%`);

  return summary;
}
