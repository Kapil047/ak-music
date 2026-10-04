import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';

describe('YouTube OAuth & Health API Endpoints', () => {
  it('GET /api/v1/auth/youtube/status should return unauthenticated status when no session exists', async () => {
    const res = await request(app)
      .get('/api/v1/auth/youtube/status')
      .set('x-api-key', env.API_SECRET_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('authenticated');
  });

  it('GET /api/v1/health should expose oauth and cookies health stats', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('x-api-key', env.API_SECRET_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('oauth');
    expect(res.body.data).toHaveProperty('cookies');
    expect(res.body.data.cookies).toHaveProperty('exists');
  });
});
