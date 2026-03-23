import { Router, type Request, type Response } from 'express';

const router: Router = Router();

// Simple in-memory metrics storage
interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram';
  help: string;
  buckets?: number[];
  // For histogram: track individual observations and count
  observations?: number[];
  count?: number;
}

const metrics: Map<string, Metric> = new Map();

// Initialize metrics
function initMetrics(): void {
  // HTTP request metrics
  metrics.set('http_requests_total', {
    name: 'http_requests_total',
    value: 0,
    type: 'counter',
    help: 'Total number of HTTP requests',
  });

  metrics.set('http_request_duration_seconds', {
    name: 'http_request_duration_seconds',
    value: 0,
    type: 'histogram',
    help: 'HTTP request duration in seconds',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  });

  metrics.set('http_errors_total', {
    name: 'http_errors_total',
    value: 0,
    type: 'counter',
    help: 'Total number of HTTP errors (5xx)',
  });

  metrics.set('http_requests_in_flight', {
    name: 'http_requests_in_flight',
    value: 0,
    type: 'gauge',
    help: 'Number of HTTP requests currently being processed',
  });

  // Socket.IO metrics
  metrics.set('socketio_connections_total', {
    name: 'socketio_connections_total',
    value: 0,
    type: 'counter',
    help: 'Total number of Socket.IO connections',
  });

  metrics.set('socketio_disconnections_total', {
    name: 'socketio_disconnections_total',
    value: 0,
    type: 'counter',
    help: 'Total number of Socket.IO disconnections',
  });

  metrics.set('socketio_rooms_active', {
    name: 'socketio_rooms_active',
    value: 0,
    type: 'gauge',
    help: 'Number of currently active rooms',
  });

  metrics.set('socketio_peers_connected', {
    name: 'socketio_peers_connected',
    value: 0,
    type: 'gauge',
    help: 'Number of currently connected peers',
  });

  // Chat metrics
  metrics.set('chat_messages_total', {
    name: 'chat_messages_total',
    value: 0,
    type: 'counter',
    help: 'Total number of chat messages sent',
  });

  // Start time for uptime calculation
  metrics.set('process_start_time_seconds', {
    name: 'process_start_time_seconds',
    value: Date.now() / 1000,
    type: 'gauge',
    help: 'Process start time in seconds since epoch',
  });
}

initMetrics();

// Export functions to update metrics
export function incrementHttpRequests(): void {
  const metric = metrics.get('http_requests_total');
  if (metric) metric.value++;
}

export function incrementHttpErrors(): void {
  const metric = metrics.get('http_errors_total');
  if (metric) metric.value++;
}

export function updateRequestDuration(durationMs: number): void {
  // Store as histogram - track individual observations for proper bucket counting
  const metric = metrics.get('http_request_duration_seconds');
  if (metric) {
    const durationSeconds = durationMs / 1000;
    metric.value += durationSeconds; // Keep sum for calculating averages
    metric.observations = metric.observations || [];
    metric.observations.push(durationSeconds);
    // Keep only last 1000 observations to prevent unbounded memory growth
    if (metric.observations.length > 1000) {
      metric.observations.shift();
    }
    metric.count = (metric.count || 0) + 1;
  }
}

export function incrementRequestsInFlight(delta: number): void {
  const metric = metrics.get('http_requests_in_flight');
  if (metric) metric.value += delta;
}

export function incrementSocketConnections(): void {
  const metric = metrics.get('socketio_connections_total');
  if (metric) metric.value++;
}

export function incrementSocketDisconnections(): void {
  const metric = metrics.get('socketio_disconnections_total');
  if (metric) metric.value++;
}

export function updateActiveRooms(count: number): void {
  const metric = metrics.get('socketio_rooms_active');
  if (metric) metric.value = count;
}

export function updateConnectedPeers(count: number): void {
  const metric = metrics.get('socketio_peers_connected');
  if (metric) metric.value = count;
}

export function incrementChatMessages(): void {
  const metric = metrics.get('chat_messages_total');
  if (metric) metric.value++;
}

// Generate Prometheus format output
function formatPrometheusMetrics(): string {
  const lines: string[] = [];

  for (const metric of metrics.values()) {
    // Add help text as comment
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);

    if (metric.type === 'histogram') {
      const buckets: number[] = metric.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
      const observations = metric.observations || [];

      // Count observations in each bucket
      const bucketCounts = new Array(buckets.length + 1).fill(0);
      const maxBucket = buckets[buckets.length - 1] ?? 0;
      for (const obs of observations) {
        for (let i = 0; i < buckets.length; i++) {
          const bucketValue = buckets[i];
          if (bucketValue !== undefined && obs <= bucketValue) {
            bucketCounts[i]++;
            break;
          }
        }
        // If > max bucket, count in +Inf bucket
        if (obs > maxBucket) {
          bucketCounts[buckets.length]++;
        }
      }

      // Output bucket lines
      for (let i = 0; i < buckets.length; i++) {
        const bucketValue = buckets[i];
        const le = bucketValue !== undefined ? String(bucketValue) : '0';
        lines.push(`${metric.name}_bucket{le="${le}"} ${bucketCounts[i]}`);
      }
      // +Inf bucket
      lines.push(`${metric.name}_bucket{le="+Inf"} ${bucketCounts[buckets.length]}`);

      // Output sum and count
      lines.push(`${metric.name}_sum ${metric.value.toFixed(6)}`);
      lines.push(`${metric.name}_count ${metric.count || 0}`);
    } else {
      lines.push(`${metric.name} ${metric.value}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Metrics endpoint
 * Returns service metrics in Prometheus format
 */
router.get('/', (_req: Request, res: Response) => {
  // Update process uptime
  const uptimeMetric = metrics.get('process_start_time_seconds');
  if (uptimeMetric) {
    uptimeMetric.value = Date.now() / 1000;
  }

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(formatPrometheusMetrics());
});

// Middleware to track HTTP metrics
export function metricsMiddleware(_req: Request, res: Response, next: () => void): void {
  incrementHttpRequests();
  incrementRequestsInFlight(1);

  const startTime = Date.now();

  res.on('finish', () => {
    incrementRequestsInFlight(-1);
    const duration = Date.now() - startTime;
    updateRequestDuration(duration);

    if (res.statusCode >= 500) {
      incrementHttpErrors();
    }
  });

  next();
}

export default router;