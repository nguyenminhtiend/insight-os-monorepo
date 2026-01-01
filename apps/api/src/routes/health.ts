import { Hono } from 'hono';
import { createResponse, type HealthStatus } from '@insight-os/shared';

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  const health: HealthStatus = {
    status: 'healthy',
    version: '0.0.1',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  return c.json(createResponse(health));
});

healthRoutes.get('/ready', (c) => {
  // Future: Check database connections, etc.
  return c.json(createResponse({ ready: true }));
});

healthRoutes.get('/live', (c) => {
  return c.json(createResponse({ live: true }));
});
