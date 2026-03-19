// Feature: lab-measurement-request-system, Property 12: Result Required for Completion
/**
 * Validates: Requirements 6.3
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

function seedUser(db: Database.Database, role: 'Requestor' | 'Lab_Manager' | 'Lab_Technician'): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'EMEA', ?, ?)`
  ).run(id, `${role}-${id}`, `${role}-${id}@test.local`, role, role, now, now);
  return id;
}

function seedMethod(db: Database.Database): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
     VALUES (?, 'M', NULL, NULL, 1, ?, ?)`
  ).run(id, now, now);
  return id;
}

function seedLabAndLink(db: Database.Database, methodId: string): string {
  const labId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO labs (id, name, region, contact_info, is_active, created_at, updated_at)
     VALUES (?, 'Lab', 'EMEA', NULL, 1, ?, ?)`
  ).run(labId, now, now);
  db.prepare('INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)').run(labId, methodId);
  return labId;
}

describe('Property 12: Result Required for Completion', () => {
  it(
    'completion attempt without attached result file is rejected (>=100 iterations)',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 30 }), async (purpose) => {
          const db = createTestDb();
          const app = createApp(db);

          const requestorId = seedUser(db, 'Requestor');
          const managerId = seedUser(db, 'Lab_Manager');
          const technicianId = seedUser(db, 'Lab_Technician');
          const methodId = seedMethod(db);
          const labId = seedLabAndLink(db, methodId);

          const created = await request(app)
            .post('/requests')
            .set('X-Mock-User-Id', requestorId)
            .send({
              method_id: methodId,
              material_description: 'm',
              purpose_description: purpose,
              desired_completion: '2026-12-31',
            });
          const requestId = created.body.id as string;

          await request(app)
            .post(`/requests/${requestId}/assign`)
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: labId });
          await request(app)
            .post(`/requests/${requestId}/assign-technician`)
            .set('X-Mock-User-Id', managerId)
            .send({ technician_id: technicianId });

          const noFile = await request(app)
            .post(`/requests/${requestId}/results`)
            .set('X-Mock-User-Id', technicianId)
            .field('note', 'no file attached');

          expect(noFile.status).toBe(422);
          expect(noFile.body.error).toContain('At least one result file is required');

          const detail = await request(app)
            .get(`/requests/${requestId}`)
            .set('X-Mock-User-Id', requestorId);
          expect(detail.status).toBe(200);
          expect(detail.body.request.status).toBe('In_Progress');
        }),
        { numRuns: 100 }
      );
    },
    90_000
  );
});
