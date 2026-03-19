// Feature: lab-measurement-request-system, Property 19: Lab Record Round Trip
/**
 * Validates: Requirements 9.1
 *
 * Property 19: Lab Record Round Trip
 * For any created lab record, retrieval returns identical field values.
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

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Generates a non-empty printable ASCII string (no control chars) */
const printableString = (minLength = 1, maxLength = 80) =>
  fc.string({ minLength, maxLength, unit: 'grapheme-ascii' }).filter(s => s.trim().length > 0);

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Property 19: Lab Record Round Trip', () => {
  let db: Database.Database;
  let adminId: string;

  beforeEach(() => {
    db = createTestDb();
    adminId = seedAdmin(db);
  });

  it(
    'retrieved lab has identical field values to the created lab (≥100 iterations)',
    async () => {
      const app = createApp(db);

      await fc.assert(
        fc.asyncProperty(
          printableString(1, 60),  // name
          printableString(1, 60),  // region
          fc.option(printableString(1, 120), { nil: undefined }), // contact_info
          async (name, region, contact_info) => {
            // 1. Create a lab
            const body: Record<string, string> = { name, region };
            if (contact_info !== undefined) body.contact_info = contact_info;

            const createRes = await request(app)
              .post('/admin/labs')
              .set('X-Mock-User-Id', adminId)
              .send(body);

            expect(createRes.status).toBe(201);
            const createdId: string = createRes.body.id;
            expect(createdId).toBeTruthy();

            // 2. Retrieve all labs and find the created one
            const listRes = await request(app)
              .get('/admin/labs')
              .set('X-Mock-User-Id', adminId);

            expect(listRes.status).toBe(200);
            const labs: any[] = listRes.body.labs;
            const found = labs.find((l: any) => l.id === createdId);

            expect(found).toBeDefined();
            expect(found.name).toBe(name);
            expect(found.region).toBe(region);
            expect(found.contact_info ?? undefined).toBe(contact_info);
            expect(found.is_active).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000 // 60s timeout for 100 iterations
  );
});
