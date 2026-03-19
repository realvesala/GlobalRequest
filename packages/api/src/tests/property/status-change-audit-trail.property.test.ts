// Feature: lab-measurement-request-system, Property 5: Status Change Audit Trail
/**
 * Validates: Requirements 4.2
 *
 * Property 5: Status Change Audit Trail
 * For any status change, history entry contains all four required fields.
 */

import { describe, it } from 'vitest';
import { expect } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { runMigrationsOn } from '../../migrate';
import { transitionStatus } from '../../helpers/transitionStatus';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrationsOn(db);
  return db;
}

function seedUser(db: Database.Database, role: 'Requestor' | 'Lab_Manager'): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, `${role}-${id}`, `${role}-${id}@test.local`, role, role, 'EMEA', now, now);
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

function seedRequest(db: Database.Database, requestorId: string, methodId: string): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO requests
      (id, requestor_id, method_id, material_description, purpose_description, desired_completion, status, submitted_at, updated_at)
     VALUES (?, ?, ?, 'm', 'p', '2026-12-31', 'Submitted', ?, ?)`
  ).run(id, requestorId, methodId, now, now);
  return id;
}

describe('Property 5: Status Change Audit Trail', () => {
  it(
    'every successful status transition writes previous/new status, actor and timestamp (>=100 iterations)',
    async () => {
      const transitionArb = fc.constantFrom(
        { from: 'Submitted', to: 'Assigned' },
        { from: 'Submitted', to: 'Unroutable' },
        { from: 'Assigned', to: 'In_Progress' },
        { from: 'In_Progress', to: 'Results_Ready' },
        { from: 'Results_Ready', to: 'Closed' }
      );

      await fc.assert(
        fc.asyncProperty(transitionArb, async ({ from, to }) => {
          const db = createTestDb();
          const requestorId = seedUser(db, 'Requestor');
          const managerId = seedUser(db, 'Lab_Manager');
          const methodId = seedMethod(db);
          const requestId = seedRequest(db, requestorId, methodId);

          // Move request to desired "from" status.
          if (from === 'Assigned') {
            const r = transitionStatus({ db, requestId, actorId: managerId, toStatus: 'Assigned' });
            expect(r.ok).toBe(true);
          } else if (from === 'In_Progress') {
            expect(transitionStatus({ db, requestId, actorId: managerId, toStatus: 'Assigned' }).ok).toBe(true);
            expect(transitionStatus({ db, requestId, actorId: managerId, toStatus: 'In_Progress' }).ok).toBe(true);
          } else if (from === 'Results_Ready') {
            expect(transitionStatus({ db, requestId, actorId: managerId, toStatus: 'Assigned' }).ok).toBe(true);
            expect(transitionStatus({ db, requestId, actorId: managerId, toStatus: 'In_Progress' }).ok).toBe(true);
            expect(transitionStatus({ db, requestId, actorId: managerId, toStatus: 'Results_Ready' }).ok).toBe(true);
          }

          const result = transitionStatus({ db, requestId, actorId: managerId, toStatus: to });
          expect(result.ok).toBe(true);

          const latestHistory = db
            .prepare(
              `SELECT previous_status, new_status, changed_by, changed_at
               FROM request_status_history
               WHERE request_id = ?
               ORDER BY rowid DESC
               LIMIT 1`
            )
            .get(requestId) as
            | { previous_status: string | null; new_status: string; changed_by: string; changed_at: string }
            | undefined;

          expect(latestHistory).toBeDefined();
          expect(latestHistory?.previous_status ?? null).toBe(from);
          expect(latestHistory?.new_status).toBe(to);
          expect(latestHistory?.changed_by).toBe(managerId);
          expect(typeof latestHistory?.changed_at).toBe('string');
          expect((latestHistory?.changed_at ?? '').length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
