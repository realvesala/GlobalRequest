// Feature: lab-measurement-request-system, Property 6: Edit Permissions by Status
/**
 * Validates: Requirements 4.3, 4.4
 *
 * Property 6: Edit Permissions by Status
 * For any request, edit permission matches status (allowed at Submitted, denied at Assigned+).
 */

import { describe, it } from 'vitest';
import { expect } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../createApp';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function seedUser(
  db: Database.Database,
  role: 'Requestor' | 'Lab_Manager',
  region = 'EMEA'
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, `${role}-${id}`, `${role}-${id}@test.local`, role, role, region, now, now);
  return id;
}

function seedMethod(db: Database.Database): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
     VALUES (?, 'Method', NULL, NULL, 1, ?, ?)`
  ).run(id, now, now);
  return id;
}

function seedLab(db: Database.Database, methodId: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO labs (id, name, region, contact_info, is_active, created_at, updated_at)
     VALUES (?, 'Lab', 'EMEA', NULL, 1, ?, ?)`
  ).run(id, now, now);
  db.prepare('INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)').run(id, methodId);
  return id;
}

describe('Property 6: Edit Permissions by Status', () => {
  it(
    'owning requestor may edit at Submitted, but not once Assigned (>=100 iterations)',
    async () => {
      const bodyArb = fc.record({
        material_description: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
        purpose_description: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
      });

      await fc.assert(
        fc.asyncProperty(bodyArb, async (patch) => {
          const db = createTestDb();
          const app = createApp(db);

          const ownerId = seedUser(db, 'Requestor');
          const managerId = seedUser(db, 'Lab_Manager');
          const methodId = seedMethod(db);
          const labId = seedLab(db, methodId);

          const createRes = await request(app)
            .post('/requests')
            .set('X-Mock-User-Id', ownerId)
            .send({
              method_id: methodId,
              material_description: 'initial',
              purpose_description: 'initial',
              desired_completion: '2026-12-31',
            });
          expect(createRes.status).toBe(201);
          const requestId = createRes.body.id as string;

          // Submitted: owner can edit.
          const editSubmitted = await request(app)
            .put(`/requests/${requestId}`)
            .set('X-Mock-User-Id', ownerId)
            .send(patch);
          expect(editSubmitted.status).toBe(200);
          expect(editSubmitted.body.material_description).toBe(patch.material_description);
          expect(editSubmitted.body.purpose_description).toBe(patch.purpose_description);

          // Move to Assigned.
          const assignRes = await request(app)
            .post(`/requests/${requestId}/assign`)
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: labId });
          expect(assignRes.status).toBe(200);

          // Assigned+: owner edit must be denied.
          const editAssigned = await request(app)
            .put(`/requests/${requestId}`)
            .set('X-Mock-User-Id', ownerId)
            .send({ material_description: 'forbidden' });
          expect(editAssigned.status).toBe(403);
        }),
        { numRuns: 100 }
      );
    },
    90_000
  );

  it('non-owner requestor is denied edit even while Submitted', async () => {
    const db = createTestDb();
    const app = createApp(db);

    const ownerId = seedUser(db, 'Requestor');
    const otherRequestorId = seedUser(db, 'Requestor');
    const methodId = seedMethod(db);

    const createRes = await request(app)
      .post('/requests')
      .set('X-Mock-User-Id', ownerId)
      .send({
        method_id: methodId,
        material_description: 'initial',
        purpose_description: 'initial',
        desired_completion: '2026-12-31',
      });
    expect(createRes.status).toBe(201);

    const editRes = await request(app)
      .put(`/requests/${createRes.body.id}`)
      .set('X-Mock-User-Id', otherRequestorId)
      .send({ material_description: 'nope' });

    expect(editRes.status).toBe(403);
  });
});
