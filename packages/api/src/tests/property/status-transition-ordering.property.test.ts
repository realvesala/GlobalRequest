// Feature: lab-measurement-request-system, Property 4: Status Transition Ordering
/**
 * Validates: Requirements 4.1
 *
 * Property 4: Status Transition Ordering
 * For any sequence of status transitions, only allowed orderings are accepted.
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

const allStatuses = ['Submitted', 'Assigned', 'In_Progress', 'Results_Ready', 'Closed', 'Unroutable'] as const;
type Status = (typeof allStatuses)[number];

function isAllowed(from: Status, to: Status): boolean {
  const allowed: Record<Status, Status[]> = {
    Submitted: ['Assigned', 'Unroutable'],
    Assigned: ['In_Progress'],
    In_Progress: ['Results_Ready'],
    Results_Ready: ['Closed'],
    Closed: [],
    Unroutable: [],
  };
  return allowed[from].includes(to);
}

describe('Property 4: Status Transition Ordering', () => {
  it(
    'accepts exactly the allowed ordering and rejects all other transitions (>=100 iterations)',
    async () => {
      const transitionArb = fc.record({
        toStatus: fc.constantFrom<Status>(...allStatuses),
        chooseFromValidCurrent: fc.boolean(),
      });

      await fc.assert(
        fc.asyncProperty(transitionArb, async ({ toStatus, chooseFromValidCurrent }) => {
          const db = createTestDb();
          const requestorId = seedUser(db, 'Requestor');
          const managerId = seedUser(db, 'Lab_Manager');
          const methodId = seedMethod(db);
          const requestId = seedRequest(db, requestorId, methodId);

          // Move request to a chosen current state by valid transitions only.
          const progression: Status[] = ['Submitted', 'Assigned', 'In_Progress', 'Results_Ready', 'Closed'];
          const current: Status = chooseFromValidCurrent
            ? progression[Math.floor(Math.random() * progression.length)]
            : 'Unroutable';

          let active: Status = 'Submitted';
          if (current === 'Unroutable') {
            const r = transitionStatus({ db, requestId, actorId: managerId, toStatus: 'Unroutable' });
            expect(r.ok).toBe(true);
            active = 'Unroutable';
          } else {
            for (let i = 1; i <= progression.indexOf(current); i += 1) {
              const next = progression[i];
              const r = transitionStatus({ db, requestId, actorId: managerId, toStatus: next });
              expect(r.ok).toBe(true);
              active = next;
            }
          }

          const result = transitionStatus({ db, requestId, actorId: managerId, toStatus });
          const shouldBeAllowed = isAllowed(active, toStatus);

          if (shouldBeAllowed) {
            expect(result.ok).toBe(true);
          } else {
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.type).toBe('conflict');
              if (result.type === 'conflict') {
                expect(result.currentStatus).toBe(active);
              }
            }
          }
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
