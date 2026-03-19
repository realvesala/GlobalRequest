// Feature: lab-measurement-request-system, Property 20: Deactivated Method Rejection
/**
 * Validates: Requirements 9.4
 *
 * Property 20: Deactivated Method Rejection
 * For any deactivated method, submission referencing it is rejected.
 *
 * This test verifies:
 * - After deactivating a method via DELETE /admin/methods/:id, the method is marked inactive
 * - GET /admin/methods reflects the deactivated state (is_active = 0)
 * - POST /requests referencing a deactivated method returns 422
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

function seedAdmin(db: Database.Database): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Admin', 'EMEA', ?, ?)`
  ).run(id, `admin-${id}`, `admin-${id}@test.local`, 'Test Admin', now, now);
  return id;
}

function seedRequestor(db: Database.Database): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Requestor', 'EMEA', ?, ?)`
  ).run(id, `requestor-${id}`, `requestor-${id}@test.local`, 'Test Requestor', now, now);
  return id;
}

/** Generates a non-empty printable ASCII string (no control chars) */
const printableString = (minLength = 1, maxLength = 80) =>
  fc.string({ minLength, maxLength, unit: 'grapheme-ascii' }).filter(s => s.trim().length > 0);

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 20: Deactivated Method Rejection', () => {
  let db: Database.Database;
  let adminId: string;
  let requestorId: string;

  beforeEach(() => {
    // Fresh in-memory DB per test to avoid state bleed across fc.assert iterations
    db = createTestDb();
    adminId = seedAdmin(db);
    requestorId = seedRequestor(db);
  });

  it(
    'deactivated method is marked inactive in the system (≥100 iterations)',
    async () => {
      const app = createApp(db);

      await fc.assert(
        fc.asyncProperty(
          printableString(1, 60),
          fc.option(printableString(0, 120), { nil: undefined }),
          async (name, description) => {
            // 1. Create a method
            const createRes = await request(app)
              .post('/admin/methods')
              .set('X-Mock-User-Id', adminId)
              .send({ name, description });

            expect(createRes.status).toBe(201);
            const methodId: string = createRes.body.id;
            expect(methodId).toBeTruthy();
            expect(createRes.body.is_active).toBe(1);

            // 2. Deactivate the method
            const deactivateRes = await request(app)
              .delete(`/admin/methods/${methodId}`)
              .set('X-Mock-User-Id', adminId);

            expect(deactivateRes.status).toBe(200);
            expect(deactivateRes.body.deactivated).toBe(true);

            // 3. Verify the method is now inactive via GET /admin/methods
            const listRes = await request(app)
              .get('/admin/methods')
              .set('X-Mock-User-Id', adminId);

            expect(listRes.status).toBe(200);
            const methods: any[] = listRes.body.methods;
            const found = methods.find((m: any) => m.id === methodId);
            expect(found).toBeDefined();
            expect(found.is_active).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000 // 60s timeout for 100 iterations
  );

  it('active method remains active until explicitly deactivated', async () => {
    const app = createApp(db);

    const createRes = await request(app)
      .post('/admin/methods')
      .set('X-Mock-User-Id', adminId)
      .send({ name: 'Active Method', description: 'Should stay active' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.is_active).toBe(1);

    const listRes = await request(app)
      .get('/admin/methods')
      .set('X-Mock-User-Id', adminId);

    expect(listRes.status).toBe(200);
    const found = listRes.body.methods.find((m: any) => m.id === createRes.body.id);
    expect(found).toBeDefined();
    expect(found.is_active).toBe(1);
  });

  it('deactivating a non-existent method returns 404', async () => {
    const app = createApp(db);

    const res = await request(app)
      .delete('/admin/methods/non-existent-id')
      .set('X-Mock-User-Id', adminId);

    expect(res.status).toBe(404);
  });

  it(
    'POST /requests referencing a deactivated method returns 422 (≥50 iterations)',
    async () => {
      const app = createApp(db);

      await fc.assert(
        fc.asyncProperty(
          printableString(1, 60),
          printableString(1, 120),
          printableString(1, 120),
          async (methodName, materialDesc, purposeDesc) => {
            // 1. Create a method
            const createRes = await request(app)
              .post('/admin/methods')
              .set('X-Mock-User-Id', adminId)
              .send({ name: methodName });

            expect(createRes.status).toBe(201);
            const methodId: string = createRes.body.id;

            // 2. Deactivate the method
            const deactivateRes = await request(app)
              .delete(`/admin/methods/${methodId}`)
              .set('X-Mock-User-Id', adminId);

            expect(deactivateRes.status).toBe(200);

            // 3. Attempt to submit a request referencing the deactivated method
            const submitRes = await request(app)
              .post('/requests')
              .set('X-Mock-User-Id', requestorId)
              .send({
                method_id: methodId,
                material_description: materialDesc,
                purpose_description: purposeDesc,
                desired_completion: '2025-12-31',
              });

            // Must be rejected with 422
            expect(submitRes.status).toBe(422);
          }
        ),
        { numRuns: 50 }
      );
    },
    60_000
  );
});
