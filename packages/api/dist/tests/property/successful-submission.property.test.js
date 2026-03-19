"use strict";
// Feature: lab-measurement-request-system, Property 3: Successful Submission State
/**
 * Validates: Requirements 3.2, 3.4
 *
 * Property 3: Successful Submission State
 * For any valid submission (all required fields present, active method), the response
 * has a unique ID, a recorded timestamp, the requestor's identity, and status "Submitted".
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const vitest_2 = require("vitest");
const fc = __importStar(require("fast-check"));
const supertest_1 = __importDefault(require("supertest"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const uuid_1 = require("uuid");
const createApp_1 = require("../../createApp");
const migrate_1 = require("../../migrate");
// ── Helpers ───────────────────────────────────────────────────────────────────
function createTestDb() {
    const db = new better_sqlite3_1.default(':memory:');
    db.pragma('foreign_keys = ON');
    return db;
}
function seedRequestor(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Requestor', 'EMEA', ?, ?)`).run(id, `requestor-${id}`, `requestor-${id}@test.local`, 'Test Requestor', now, now);
    return id;
}
function seedActiveMethod(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO methods (id, name, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`).run(id, `Method-${id}`, 'Test method', now, now);
    return id;
}
/** Non-empty printable ASCII string */
const printableString = (minLength = 1, maxLength = 80) => fc.string({ minLength, maxLength, unit: 'grapheme-ascii' }).filter(s => s.trim().length > 0);
/** ISO date string in YYYY-MM-DD format */
const isoDateString = fc
    .integer({ min: new Date('2025-01-01').getTime(), max: new Date('2030-12-31').getTime() })
    .map(ms => new Date(ms).toISOString().slice(0, 10));
// UUID v4 regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ── Test suite ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Property 3: Successful Submission State', () => {
    let db;
    let requestorId;
    let methodId;
    (0, vitest_1.beforeEach)(() => {
        db = createTestDb();
        (0, migrate_1.runMigrationsOn)(db);
        requestorId = seedRequestor(db);
        methodId = seedActiveMethod(db);
    });
    (0, vitest_1.it)('valid submission returns 201 with unique ID, timestamp, requestor, and status Submitted (≥100 iterations)', async () => {
        const app = (0, createApp_1.createApp)(db);
        const seenIds = new Set();
        await fc.assert(fc.asyncProperty(printableString(1, 120), printableString(1, 120), isoDateString, async (materialDesc, purposeDesc, desiredCompletion) => {
            const res = await (0, supertest_1.default)(app)
                .post('/requests')
                .set('X-Mock-User-Id', requestorId)
                .send({
                method_id: methodId,
                material_description: materialDesc,
                purpose_description: purposeDesc,
                desired_completion: desiredCompletion,
            });
            // Must return 201
            (0, vitest_2.expect)(res.status).toBe(201);
            const body = res.body;
            // Must have a UUID v4 id
            (0, vitest_2.expect)(body).toHaveProperty('id');
            (0, vitest_2.expect)(typeof body.id).toBe('string');
            (0, vitest_2.expect)(body.id).toMatch(UUID_RE);
            // ID must be unique across all submissions
            (0, vitest_2.expect)(seenIds.has(body.id)).toBe(false);
            seenIds.add(body.id);
            // Must have a submitted_at timestamp (ISO string)
            (0, vitest_2.expect)(body).toHaveProperty('submitted_at');
            (0, vitest_2.expect)(typeof body.submitted_at).toBe('string');
            const ts = new Date(body.submitted_at);
            (0, vitest_2.expect)(isNaN(ts.getTime())).toBe(false);
            // Must record the requestor's identity
            (0, vitest_2.expect)(body).toHaveProperty('requestor_id');
            (0, vitest_2.expect)(body.requestor_id).toBe(requestorId);
            // Status must be "Submitted"
            (0, vitest_2.expect)(body).toHaveProperty('status');
            (0, vitest_2.expect)(body.status).toBe('Submitted');
        }), { numRuns: 100 });
    }, 60000 // 60s timeout for 100 iterations
    );
    (0, vitest_1.it)('each successful submission gets a distinct UUID', async () => {
        const app = (0, createApp_1.createApp)(db);
        const ids = [];
        for (let i = 0; i < 10; i++) {
            const res = await (0, supertest_1.default)(app)
                .post('/requests')
                .set('X-Mock-User-Id', requestorId)
                .send({
                method_id: methodId,
                material_description: `Material ${i}`,
                purpose_description: `Purpose ${i}`,
                desired_completion: '2026-06-01',
            });
            (0, vitest_2.expect)(res.status).toBe(201);
            ids.push(res.body.id);
        }
        const uniqueIds = new Set(ids);
        (0, vitest_2.expect)(uniqueIds.size).toBe(ids.length);
    });
    (0, vitest_1.it)('submitted_at is recorded close to the time of submission', async () => {
        const app = (0, createApp_1.createApp)(db);
        const before = Date.now();
        const res = await (0, supertest_1.default)(app)
            .post('/requests')
            .set('X-Mock-User-Id', requestorId)
            .send({
            method_id: methodId,
            material_description: 'Test material',
            purpose_description: 'Test purpose',
            desired_completion: '2026-01-01',
        });
        const after = Date.now();
        (0, vitest_2.expect)(res.status).toBe(201);
        const submittedAt = new Date(res.body.submitted_at).getTime();
        (0, vitest_2.expect)(submittedAt).toBeGreaterThanOrEqual(before);
        (0, vitest_2.expect)(submittedAt).toBeLessThanOrEqual(after + 1000); // 1s tolerance
    });
});
