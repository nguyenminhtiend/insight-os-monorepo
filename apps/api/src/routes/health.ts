import { Hono } from 'hono';
import { createResponse, type HealthStatus } from '@insight-os/shared';
import { checkDatabaseHealth } from '../db/index.js';
import { checkRedisHealth } from '../lib/redis.js';

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) => {
  const [dbHealthy, redisHealthy] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  const allHealthy = dbHealthy && redisHealthy;

  const health: HealthStatus = {
    status: allHealthy ? 'healthy' : 'degraded',
    version: '0.0.3',
    uptime: Math.floor((Date.now() - startTime) / 1000)
  };

  return c.json(
    createResponse({
      ...health,
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected'
      }
    })
  );
});

healthRoutes.get('/ready', async (c) => {
  const [dbHealthy, redisHealthy] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  if (!dbHealthy || !redisHealthy) {
    return c.json(createResponse({ ready: false }), 503);
  }

  return c.json(createResponse({ ready: true }));
});

healthRoutes.get('/live', (c) => {
  return c.json(createResponse({ live: true }));
});
