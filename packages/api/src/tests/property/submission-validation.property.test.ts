// Feature: lab-measurement-request-system, Property 2: Request Submission Validation
/**
 * Validates: Requirements 3.1, 3.3
 *
 * Property 2: Request Submission Validation
 * For any submission with missing fields, the 400 response identifies each missing field
 * in the errors object.
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

function seedRequestor(db: Database.Database): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Requestor', 'EMEA', ?, ?)`
  ).run(id, `requestor-${id}`, `requestor-${id}@test.local`, 'Test Requestor', now, now);
  return id;
}

// All required fields for POST /requests
const REQUIRED_FIELDS = ['method_id', 'material_description', 'purpose_description', 'desired_completion'] as const;
type RequiredField = typeof REQUIRED_FIELDS[number];

// A valid complete body (all fields present)
const VALID_BODY: Record<RequiredField, string> = {
  method_id: 'some-method-id',
  material_description: 'Sample material',
  purpose_description: 'Sample purpose',
  desired_completion: '2025-12-31',
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 2: Request Submission Validation', () => {
  let db: Database.Database;
  let requestorId: string;

  beforeEach(() => {
    db = createTestDb();
    requestorId = seedRequestor(db);
  });

  it(
    'missing fields are each identified in the errors object (≥100 iterations)',
    async () => {
      const app = createApp(db);

      // Generate a non-empty subset of required fields to omit
      const missingFieldsArb = fc
        .subarray(REQUIRED_FIELDS as unknown as RequiredField[], { minLength: 1 })
        .map(arr => new Set(arr));

      await fc.assert(
        fc.asyncProperty(missingFieldsArb, async (missingFields) => {
          // Build body with the missing fields omitted
          const body: Partial<Record<RequiredField, string>> = {};
          for (const field of REQUIRED_FIELDS) {
            if (!missingFields.has(field)) {
              body[field] = VALID_BODY[field];
            }
          }

          const res = await request(app)
            .post('/requests')
            .set('X-Mock-User-Id', requestorId)
            .send(body);

          // Must return 400
          expect(res.status).toBe(400);

          // errors object must exist
          expect(res.body).toHaveProperty('errors');
          const errors: Record<string, string> = res.body.errors;

          // Each missing field must appear as a key in errors
          for (const field of missingFields) {
            expect(errors).toHaveProperty(field);
          }
        }),
        { numRuns: 100 }
      );
    },
    30_000 // 30s timeout for 100 iterations
  );

  it('all fields present but method inactive returns 422, not 400', async () => {
    const app = createApp(db);

    const res = await request(app)
      .post('/requests')
      .set('X-Mock-User-Id', requestorId)
      .send(VALID_BODY);

    // method_id 'some-method-id' doesn't exist → 422 (not a validation error)
    expect(res.status).toBe(422);
  });

  it('empty body returns 400 with all four fields in errors', async () => {
    const app = createApp(db);

    const res = await request(app)
      .post('/requests')
      .set('X-Mock-User-Id', requestorId)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty('method_id');
    expect(res.body.errors).toHaveProperty('material_description');
    expect(res.body.errors).toHaveProperty('purpose_description');
    expect(res.body.errors).toHaveProperty('desired_completion');
  });
});
