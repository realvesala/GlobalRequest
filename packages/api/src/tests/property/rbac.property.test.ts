// Feature: lab-measurement-request-system, Property 1: Role-Based Access Control Enforcement
/**
 * Validates: Requirements 2.3, 2.4
 *
 * Property 1: Role-Based Access Control Enforcement
 * For any non-Admin role and any admin endpoint, access is denied (403).
 */

import { describe, it, beforeAll } from 'vitest';
import { expect } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../createApp';

// ── In-memory DB setup ────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      sso_subject   TEXT UNIQUE NOT NULL,
      email         TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('Requestor','Lab_Technician','Lab_Manager','Admin')),
      region        TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `);

  return db;
}

type Role = 'Requestor' | 'Lab_Technician' | 'Lab_Manager' | 'Admin';

const NON_ADMIN_ROLES: Role[] = ['Requestor', 'Lab_Technician', 'Lab_Manager'];

const ADMIN_ENDPOINTS: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string }> = [
  { method: 'GET', path: '/admin/labs' },
  { method: 'POST', path: '/admin/labs' },
  { method: 'PUT', path: '/admin/labs/some-id' },
  { method: 'DELETE', path: '/admin/labs/some-id' },
  { method: 'GET', path: '/admin/methods' },
  { method: 'POST', path: '/admin/methods' },
  { method: 'PUT', path: '/admin/methods/some-id' },
  { method: 'DELETE', path: '/admin/methods/some-id' },
  { method: 'GET', path: '/admin/users' },
  { method: 'PUT', path: '/admin/users/some-id/role' },
];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 1: Role-Based Access Control Enforcement', () => {
  let db: Database.Database;
  // Map role → seeded user id
  const userIds: Record<Role, string> = {} as Record<Role, string>;

  beforeAll(() => {
    db = createTestDb();
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
       VALUES (@id, @sso_subject, @email, @display_name, @role, @region, @created_at, @updated_at)`
    );

    const allRoles: Role[] = ['Requestor', 'Lab_Technician', 'Lab_Manager', 'Admin'];
    for (const role of allRoles) {
      const id = uuidv4();
      userIds[role] = id;
      insert.run({
        id,
        sso_subject: `test-${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@test.local`,
        display_name: `Test ${role}`,
        role,
        region: 'EMEA',
        created_at: now,
        updated_at: now,
      });
    }
  });

  it(
    'non-Admin roles receive 403 on all admin endpoints (≥100 iterations)',
    async () => {
      const app = createApp(db);

      // Arbitraries
      const roleArb = fc.constantFrom(...NON_ADMIN_ROLES);
      const endpointArb = fc.constantFrom(...ADMIN_ENDPOINTS);

      await fc.assert(
        fc.asyncProperty(roleArb, endpointArb, async (role, endpoint) => {
          const userId = userIds[role];
          const req = request(app)[endpoint.method.toLowerCase() as Lowercase<typeof endpoint.method>](
            endpoint.path
          ).set('X-Mock-User-Id', userId);

          const response = await req;

          expect(response.status).toBe(403);
        }),
        { numRuns: 100 }
      );
    },
    30_000 // 30s timeout for 100 iterations
  );

  it('Admin role can access admin endpoints (sanity check)', async () => {
    const app = createApp(db);
    const adminId = userIds['Admin'];

    const response = await request(app)
      .get('/admin/labs')
      .set('X-Mock-User-Id', adminId);

    expect(response.status).toBe(200);
  });

  it('missing auth header returns 401 on admin endpoints', async () => {
    const app = createApp(db);

    const response = await request(app).get('/admin/labs');

    expect(response.status).toBe(401);
  });
});
