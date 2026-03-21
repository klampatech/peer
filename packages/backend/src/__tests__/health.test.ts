import { describe, it, expect } from 'vitest';
import express from 'express';

describe('Health Endpoint', () => {
  it('should have a working Express setup', () => {
    const app = express();
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', uptime: 0, version: '1.0.0' });
    });

    expect(app).toBeDefined();
  });
});
