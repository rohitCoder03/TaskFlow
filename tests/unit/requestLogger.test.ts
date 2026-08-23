import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';

describe('request correlation', () => {
  it('echoes a valid incoming request id', async () => {
    const response = await request(app).get('/health').set('x-request-id', 'test-request-42');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-request-42');
  });

  it('generates a request id when none is provided', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
