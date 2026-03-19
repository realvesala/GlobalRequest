"use strict";
// Feature: lab-measurement-request-system, Property 2: Request Submission Validation
/**
 * Validates: Requirements 3.1, 3.3
 *
 * Property 2: Request Submission Validation
 * For any submission with missing fields, the 400 response identifies each missing field
 * in the errors object.
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
// ── Helpers ───────────────────────────────────────────────────────────────────
function createTestDb() {
    const db = new better_sqlite3_1.default(':memory:');
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
function seedRequestor(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Requestor', 'EMEA', ?, ?)`).run(id, `requestor-${id}`, `requestor-${id}@test.local`, 'Test Requestor', now, now);
    return id;
}
// All required fields for POST /requests
const REQUIRED_FIELDS = ['method_id', 'material_description', 'purpose_description', 'desired_completion'];
// A valid complete body (all fields present)
const VALID_BODY = {
    method_id: 'some-method-id',
    material_description: 'Sample material',
    purpose_description: 'Sample purpose',
    desired_completion: '2025-12-31',
};
// ── Test suite ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Property 2: Request Submission Validation', () => {
    let db;
    let requestorId;
    (0, vitest_1.beforeEach)(() => {
        db = createTestDb();
        requestorId = seedRequestor(db);
    });
    (0, vitest_1.it)('missing fields are each identified in the errors object (≥100 iterations)', async () => {
        const app = (0, createApp_1.createApp)(db);
        // Generate a non-empty subset of required fields to omit
        const missingFieldsArb = fc
            .subarray(REQUIRED_FIELDS, { minLength: 1 })
            .map(arr => new Set(arr));
        await fc.assert(fc.asyncProperty(missingFieldsArb, async (missingFields) => {
            // Build body with the missing fields omitted
            const body = {};
            for (const field of REQUIRED_FIELDS) {
                if (!missingFields.has(field)) {
                    body[field] = VALID_BODY[field];
                }
            }
            const res = await (0, supertest_1.default)(app)
                .post('/requests')
                .set('X-Mock-User-Id', requestorId)
                .send(body);
            // Must return 400
            (0, vitest_2.expect)(res.status).toBe(400);
            // errors object must exist
            (0, vitest_2.expect)(res.body).toHaveProperty('errors');
            const errors = res.body.errors;
            // Each missing field must appear as a key in errors
            for (const field of missingFields) {
                (0, vitest_2.expect)(errors).toHaveProperty(field);
            }
        }), { numRuns: 100 });
    }, 30000 // 30s timeout for 100 iterations
    );
    (0, vitest_1.it)('all fields present but method inactive returns 422, not 400', async () => {
        const app = (0, createApp_1.createApp)(db);
        const res = await (0, supertest_1.default)(app)
            .post('/requests')
            .set('X-Mock-User-Id', requestorId)
            .send(VALID_BODY);
        // method_id 'some-method-id' doesn't exist → 422 (not a validation error)
        (0, vitest_2.expect)(res.status).toBe(422);
    });
    (0, vitest_1.it)('empty body returns 400 with all four fields in errors', async () => {
        const app = (0, createApp_1.createApp)(db);
        const res = await (0, supertest_1.default)(app)
            .post('/requests')
            .set('X-Mock-User-Id', requestorId)
            .send({});
        (0, vitest_2.expect)(res.status).toBe(400);
        (0, vitest_2.expect)(res.body.errors).toHaveProperty('method_id');
        (0, vitest_2.expect)(res.body.errors).toHaveProperty('material_description');
        (0, vitest_2.expect)(res.body.errors).toHaveProperty('purpose_description');
        (0, vitest_2.expect)(res.body.errors).toHaveProperty('desired_completion');
    });
});
