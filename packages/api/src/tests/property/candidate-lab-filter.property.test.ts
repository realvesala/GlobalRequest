// Feature: lab-measurement-request-system, Property 7: Candidate Lab Capability Filter
/**
 * Validates: Requirements 5.1, 9.2
 *
 * Property 7: Candidate Lab Capability Filter
 * For any method, all candidate labs support that method and none are inactive.
 *
 * This test verifies:
 * - GET /requests/:id/candidates only returns labs that are both active AND support the method
 * - Inactive labs are excluded even if they support the method
 * - Labs that don't support the method are excluded even if they are active
 */

import { describe, it, beforeEach } from 'vitest';
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
  region: string,
  isActive: boolean
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO labs (id, name, region, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, region, isActive ? 1 : 0, now, now);
  return id;
}

function linkLabMethod(db: Database.Database, labId: string, methodId: string): void {
  db.prepare(`INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)`).run(labId, methodId);
}

function seedRequest(db: Database.Database, requestorId: string, methodId: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO requests (id, requestor_id, method_id, material_description, purpose_description, desired_completion, status, submitted_at, updated_at)
     VALUES (?, ?, ?, 'test material', 'test purpose', '2025-12-31', 'Submitted', ?, ?)`
  ).run(id, requestorId, methodId, now, now);
  return id;
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

/**
 * Generates a configuration of labs:
 * - activeWithMethod: count of active labs that support the method (should appear in candidates)
 * - activeWithoutMethod: count of active labs that do NOT support the method (should be excluded)
 * - inactiveWithMethod: count of inactive labs that support the method (should be excluded)
 * - inactiveWithoutMethod: count of inactive labs that do NOT support the method (should be excluded)
 */
const labConfigArb = fc.record({
  activeWithMethod: fc.integer({ min: 0, max: 5 }),
  activeWithoutMethod: fc.integer({ min: 0, max: 5 }),
  inactiveWithMethod: fc.integer({ min: 0, max: 5 }),
  inactiveWithoutMethod: fc.integer({ min: 0, max: 5 }),
}).filter(cfg =>
  // Ensure at least one lab exists in total
  cfg.activeWithMethod + cfg.activeWithoutMethod + cfg.inactiveWithMethod + cfg.inactiveWithoutMethod > 0
);

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 7: Candidate Lab Capability Filter', () => {
  let db: Database.Database;
  let requestorId: string;
  let managerId: string;
  let methodId: string;
  let requestId: string;

  beforeEach(() => {
    db = createTestDb();
    // createApp runs migrations, so we just need to seed users/method/request
    const app = createApp(db); // triggers runMigrationsOn

    requestorId = seedUser(db, 'Requestor', 'EMEA');
    managerId = seedUser(db, 'Lab_Manager', 'EMEA');
    methodId = seedMethod(db, 'Test Method');
    requestId = seedRequest(db, requestorId, methodId);
  });

  it(
    'candidates only contain active labs that support the method (≥100 iterations)',
    async () => {
      await fc.assert(
        fc.asyncProperty(labConfigArb, async (cfg) => {
          // Fresh DB per iteration to avoid state accumulation
          const iterDb = createTestDb();
          const iterApp = createApp(iterDb);

          const iterRequestorId = seedUser(iterDb, 'Requestor', 'EMEA');
          const iterManagerId = seedUser(iterDb, 'Lab_Manager', 'EMEA');
          const iterMethodId = seedMethod(iterDb, 'Iter Method');
          const iterRequestId = seedRequest(iterDb, iterRequestorId, iterMethodId);

          // Track which lab IDs should appear in candidates
          const expectedCandidateIds = new Set<string>();

          // Seed active labs that support the method — these SHOULD appear
          for (let i = 0; i < cfg.activeWithMethod; i++) {
            const labId = seedLab(iterDb, `active-with-method-${i}`, 'EMEA', true);
            linkLabMethod(iterDb, labId, iterMethodId);
            expectedCandidateIds.add(labId);
          }

          // Seed active labs that do NOT support the method — should be excluded
          for (let i = 0; i < cfg.activeWithoutMethod; i++) {
            seedLab(iterDb, `active-without-method-${i}`, 'EMEA', true);
            // No lab_methods link
          }

          // Seed inactive labs that support the method — should be excluded
          for (let i = 0; i < cfg.inactiveWithMethod; i++) {
            const labId = seedLab(iterDb, `inactive-with-method-${i}`, 'EMEA', false);
            linkLabMethod(iterDb, labId, iterMethodId);
          }

          // Seed inactive labs that do NOT support the method — should be excluded
          for (let i = 0; i < cfg.inactiveWithoutMethod; i++) {
            seedLab(iterDb, `inactive-without-method-${i}`, 'EMEA', false);
          }

          // Call GET /requests/:id/candidates
          const res = await request(iterApp)
            .get(`/requests/${iterRequestId}/candidates`)
            .set('X-Mock-User-Id', iterManagerId);

          expect(res.status).toBe(200);
          expect(res.body).toHaveProperty('candidates');

          const candidates: Array<{ id: string; is_active: number }> = res.body.candidates;

          // Assert: every returned candidate is active
          for (const candidate of candidates) {
            expect(candidate.is_active).toBe(1);
          }

          // Assert: returned candidate IDs match exactly the expected set
          const returnedIds = new Set(candidates.map(c => c.id));
          expect(returnedIds).toEqual(expectedCandidateIds);
        }),
        { numRuns: 100 }
      );
    },
    60_000 // 60s timeout for 100 iterations
  );

  it('returns empty candidates when no labs support the method', async () => {
    const app = createApp(db);

    // Seed labs that don't support the method
    seedLab(db, 'Active Lab No Method', 'EMEA', true);
    seedLab(db, 'Inactive Lab No Method', 'EMEA', false);

    const res = await request(app)
      .get(`/requests/${requestId}/candidates`)
      .set('X-Mock-User-Id', managerId);

    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(0);
  });

  it('excludes inactive labs even when they support the method', async () => {
    const app = createApp(db);

    const inactiveLabId = seedLab(db, 'Inactive Lab With Method', 'EMEA', false);
    linkLabMethod(db, inactiveLabId, methodId);

    const res = await request(app)
      .get(`/requests/${requestId}/candidates`)
      .set('X-Mock-User-Id', managerId);

    expect(res.status).toBe(200);
    const ids = res.body.candidates.map((c: any) => c.id);
    expect(ids).not.toContain(inactiveLabId);
  });

  it('returns 404 for a non-existent request', async () => {
    const app = createApp(db);

    const res = await request(app)
      .get('/requests/non-existent-id/candidates')
      .set('X-Mock-User-Id', managerId);

    expect(res.status).toBe(404);
  });
});
