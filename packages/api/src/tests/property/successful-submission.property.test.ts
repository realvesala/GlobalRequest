// Feature: lab-measurement-request-system, Property 3: Successful Submission State
/**
 * Validates: Requirements 3.2, 3.4
 *
 * Property 3: Successful Submission State
 * For any valid submission (all required fields present, active method), the response
 * has a unique ID, a recorded timestamp, the requestor's identity, and status "Submitted".
 */

import { describe, it, beforeEach } from 'vitest';
import { expect } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../createApp';
import { runMigrationsOn } from '../../migrate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
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

function seedActiveMethod(db: Database.Database): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO methods (id, name, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(id, `Method-${id}`, 'Test method', now, now);
  return id;
}

/** Non-empty printable ASCII string */
const printableString = (minLength = 1, maxLength = 80) =>
  fc.string({ minLength, maxLength, unit: 'grapheme-ascii' }).filter(s => s.trim().length > 0);

/** ISO date string in YYYY-MM-DD format */
const isoDateString = fc
  .integer({ min: new Date('2025-01-01').getTime(), max: new Date('2030-12-31').getTime() })
  .map(ms => new Date(ms).toISOString().slice(0, 10));

// UUID v4 regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 3: Successful Submission State', () => {
  let db: Database.Database;
  let requestorId: string;
  let methodId: string;

  beforeEach(() => {
    db = createTestDb();
    runMigrationsOn(db);
    requestorId = seedRequestor(db);
    methodId = seedActiveMethod(db);
  });

  it(
    'valid submission returns 201 with unique ID, timestamp, requestor, and status Submitted (≥100 iterations)',
    async () => {
      const app = createApp(db);
      const seenIds = new Set<string>();

      await fc.assert(
        fc.asyncProperty(
          printableString(1, 120),
          printableString(1, 120),
          isoDateString,
          async (materialDesc, purposeDesc, desiredCompletion) => {
            const res = await request(app)
              .post('/requests')
              .set('X-Mock-User-Id', requestorId)
              .send({
                method_id: methodId,
                material_description: materialDesc,
                purpose_description: purposeDesc,
                desired_completion: desiredCompletion,
              });

            // Must return 201
            expect(res.status).toBe(201);

            const body = res.body;

            // Must have a UUID v4 id
            expect(body).toHaveProperty('id');
            expect(typeof body.id).toBe('string');
            expect(body.id).toMatch(UUID_RE);

            // ID must be unique across all submissions
            expect(seenIds.has(body.id)).toBe(false);
            seenIds.add(body.id);

            // Must have a submitted_at timestamp (ISO string)
            expect(body).toHaveProperty('submitted_at');
            expect(typeof body.submitted_at).toBe('string');
            const ts = new Date(body.submitted_at);
            expect(isNaN(ts.getTime())).toBe(false);

            // Must record the requestor's identity
            expect(body).toHaveProperty('requestor_id');
            expect(body.requestor_id).toBe(requestorId);

            // Status must be "Submitted"
            expect(body).toHaveProperty('status');
            expect(body.status).toBe('Submitted');
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000 // 60s timeout for 100 iterations
  );

  it('each successful submission gets a distinct UUID', async () => {
    const app = createApp(db);
    const ids: string[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/requests')
        .set('X-Mock-User-Id', requestorId)
        .send({
          method_id: methodId,
          material_description: `Material ${i}`,
          purpose_description: `Purpose ${i}`,
          desired_completion: '2026-06-01',
        });

      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }

    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('submitted_at is recorded close to the time of submission', async () => {
    const app = createApp(db);
    const before = Date.now();

    const res = await request(app)
      .post('/requests')
      .set('X-Mock-User-Id', requestorId)
      .send({
        method_id: methodId,
        material_description: 'Test material',
        purpose_description: 'Test purpose',
        desired_completion: '2026-01-01',
      });

    const after = Date.now();

    expect(res.status).toBe(201);
    const submittedAt = new Date(res.body.submitted_at).getTime();
    expect(submittedAt).toBeGreaterThanOrEqual(before);
    expect(submittedAt).toBeLessThanOrEqual(after + 1000); // 1s tolerance
  });
});
