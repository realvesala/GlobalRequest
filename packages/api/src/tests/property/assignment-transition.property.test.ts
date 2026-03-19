// Feature: lab-measurement-request-system, Property 9: Assignment State Transition
/**
 * Validates: Requirements 5.3
 *
 * Property 9: Assignment State Transition
 * For any accepted request, status becomes Assigned and lab ID is recorded.
 *
 * This test verifies:
 * - POST /requests/:id/assign with a valid lab sets status to 'Assigned'
 * - The assigned_lab_id on the returned request matches the provided lab_id
 * - This holds across arbitrary combinations of method names, lab names, and regions
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

function seedLab(
  db: Database.Database,
  name: string,
  region: string
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO labs (id, name, region, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(id, name, region, now, now);
  return id;
}

function linkLabMethod(db: Database.Database, labId: string, methodId: string): void {
  db.prepare(`INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)`).run(labId, methodId);
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

const assignmentScenarioArb = fc.record({
  methodName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length > 0),
  labName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length > 0),
  labRegion: regionArb,
  requestorRegion: regionArb,
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 9: Assignment State Transition', () => {
  it(
    'status becomes Assigned and lab ID is recorded for any valid assignment (≥100 iterations)',
    async () => {
      await fc.assert(
        fc.asyncProperty(assignmentScenarioArb, async (scenario) => {
          // Fresh DB per iteration to avoid state accumulation
          const db = createTestDb();
          const app = createApp(db);

          // Seed users
          const requestorId = seedUser(db, 'Requestor', scenario.requestorRegion);
          const managerId = seedUser(db, 'Lab_Manager', scenario.labRegion);

          // Seed method and lab
          const methodId = seedMethod(db, scenario.methodName);
          const labId = seedLab(db, scenario.labName, scenario.labRegion);
          linkLabMethod(db, labId, methodId);

          // Seed a Submitted request
          const requestId = seedRequest(db, requestorId, methodId);

          // POST /requests/:id/assign
          const res = await request(app)
            .post(`/requests/${requestId}/assign`)
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: labId });

          expect(res.status).toBe(200);

          // Property: status must be 'Assigned'
          expect(res.body.status).toBe('Assigned');

          // Property: assigned_lab_id must equal the provided lab_id
          expect(res.body.assigned_lab_id).toBe(labId);
        }),
        { numRuns: 100 }
      );
    },
    60_000 // 60s timeout for 100 iterations
  );

  it('returns 409 when request is not in Submitted status', async () => {
    const db = createTestDb();
    const app = createApp(db);

    const requestorId = seedUser(db, 'Requestor', 'EMEA');
    const managerId = seedUser(db, 'Lab_Manager', 'EMEA');
    const methodId = seedMethod(db, 'Some Method');
    const labId = seedLab(db, 'Some Lab', 'EMEA');
    linkLabMethod(db, labId, methodId);
    const requestId = seedRequest(db, requestorId, methodId);

    // First assignment — succeeds
    await request(app)
      .post(`/requests/${requestId}/assign`)
      .set('X-Mock-User-Id', managerId)
      .send({ lab_id: labId });

    // Second assignment — should fail with 409 (already Assigned)
    const res = await request(app)
      .post(`/requests/${requestId}/assign`)
      .set('X-Mock-User-Id', managerId)
      .send({ lab_id: labId });

    expect(res.status).toBe(409);
  });

  it('returns 404 for a non-existent request', async () => {
    const db = createTestDb();
    const app = createApp(db);

    const managerId = seedUser(db, 'Lab_Manager', 'EMEA');

    const res = await request(app)
      .post('/requests/non-existent-id/assign')
      .set('X-Mock-User-Id', managerId)
      .send({ lab_id: 'some-lab-id' });

    expect(res.status).toBe(404);
  });
});
