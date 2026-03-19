// Feature: lab-measurement-request-system, Property 10: Routing Override Audit
/**
 * Validates: Requirements 5.5
 *
 * Property 10: Routing Override Audit
 * For any routing override, the override reason and the Lab_Manager's identity
 * are persisted on the request record.
 *
 * This test verifies:
 * - POST /requests/:id/override-route persists routing_override_reason = reason
 * - POST /requests/:id/override-route persists routing_override_by = managerId
 * - This holds across arbitrary reason strings and lab assignments
 */

import { describe, it } from 'vitest';
import { expect } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../createApp';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function seedUser(
  db: Database.Database,
  role: 'Requestor' | 'Lab_Manager' | 'Admin',
  region = 'EMEA'
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, `${role.toLowerCase()}-${id}`, `${role.toLowerCase()}-${id}@test.local`, `Test ${role}`, role, region, now, now);
  return id;
}

function seedMethod(db: Database.Database, name: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO methods (id, name, is_active, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)`
  ).run(id, name, now, now);
  return id;
}

function seedLab(db: Database.Database, name: string, region: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO labs (id, name, region, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(id, name, region, now, now);
  return id;
}

function seedRequest(
  db: Database.Database,
  requestorId: string,
  methodId: string
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO requests (id, requestor_id, method_id, material_description, purpose_description, desired_completion, status, submitted_at, updated_at)
     VALUES (?, ?, ?, 'test material', 'test purpose', '2025-12-31', 'Submitted', ?, ?)`
  ).run(id, requestorId, methodId, now, now);
  return id;
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

const regionArb = fc.constantFrom('EMEA', 'APAC', 'AMER', 'LATAM');

// Reason strings: non-empty, printable ASCII, trimmed
const reasonArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0);

const overrideScenarioArb = fc.record({
  reason: reasonArb,
  labRegion: regionArb,
  labName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length > 0),
  methodName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length > 0),
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 10: Routing Override Audit', () => {
  it(
    'override reason and manager identity are persisted for any routing override (≥100 iterations)',
    async () => {
      await fc.assert(
        fc.asyncProperty(overrideScenarioArb, async (scenario) => {
          // Fresh DB per iteration to avoid state accumulation
          const db = createTestDb();
          const app = createApp(db);

          // Seed users
          const requestorId = seedUser(db, 'Requestor', 'EMEA');
          const managerId = seedUser(db, 'Lab_Manager', scenario.labRegion);

          // Seed method and lab
          const methodId = seedMethod(db, scenario.methodName);
          const labId = seedLab(db, scenario.labName, scenario.labRegion);

          // Seed a Submitted request
          const requestId = seedRequest(db, requestorId, methodId);

          // POST /requests/:id/override-route
          const res = await request(app)
            .post(`/requests/${requestId}/override-route`)
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: labId, reason: scenario.reason });

          expect(res.status).toBe(200);

          // Property: routing_override_reason must equal the provided reason
          expect(res.body.routing_override_reason).toBe(scenario.reason);

          // Property: routing_override_by must equal the manager's id
          expect(res.body.routing_override_by).toBe(managerId);
        }),
        { numRuns: 100 }
      );
    },
    60_000 // 60s timeout for 100 iterations
  );

  it('returns 400 when reason is missing', async () => {
    const db = createTestDb();
    const app = createApp(db);

    const requestorId = seedUser(db, 'Requestor', 'EMEA');
    const managerId = seedUser(db, 'Lab_Manager', 'EMEA');
    const methodId = seedMethod(db, 'Some Method');
    const labId = seedLab(db, 'Some Lab', 'EMEA');
    const requestId = seedRequest(db, requestorId, methodId);

    const res = await request(app)
      .post(`/requests/${requestId}/override-route`)
      .set('X-Mock-User-Id', managerId)
      .send({ lab_id: labId });

    expect(res.status).toBe(400);
  });

  it('returns 400 when lab_id is missing', async () => {
    const db = createTestDb();
    const app = createApp(db);

    const requestorId = seedUser(db, 'Requestor', 'EMEA');
    const managerId = seedUser(db, 'Lab_Manager', 'EMEA');
    const methodId = seedMethod(db, 'Some Method');
    const requestId = seedRequest(db, requestorId, methodId);

    const res = await request(app)
      .post(`/requests/${requestId}/override-route`)
      .set('X-Mock-User-Id', managerId)
      .send({ reason: 'some reason' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent request', async () => {
    const db = createTestDb();
    const app = createApp(db);

    const managerId = seedUser(db, 'Lab_Manager', 'EMEA');
    const labId = seedLab(db, 'Some Lab', 'EMEA');

    const res = await request(app)
      .post('/requests/non-existent-id/override-route')
      .set('X-Mock-User-Id', managerId)
      .send({ lab_id: labId, reason: 'some reason' });

    expect(res.status).toBe(404);
  });
});
