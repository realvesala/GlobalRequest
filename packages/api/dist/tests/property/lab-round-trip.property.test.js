"use strict";
// Feature: lab-measurement-request-system, Property 19: Lab Record Round Trip
/**
 * Validates: Requirements 9.1
 *
 * Property 19: Lab Record Round Trip
 * For any created lab record, retrieval returns identical field values.
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
function seedAdmin(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Admin', 'EMEA', ?, ?)`).run(id, `admin-${id}`, `admin-${id}@test.local`, 'Test Admin', now, now);
    return id;
}
// ── Arbitraries ───────────────────────────────────────────────────────────────
/** Generates a non-empty printable ASCII string (no control chars) */
const printableString = (minLength = 1, maxLength = 80) => fc.string({ minLength, maxLength, unit: 'grapheme-ascii' }).filter(s => s.trim().length > 0);
// ── Test suite ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Property 19: Lab Record Round Trip', () => {
    let db;
    let adminId;
    (0, vitest_1.beforeEach)(() => {
        db = createTestDb();
        adminId = seedAdmin(db);
    });
    (0, vitest_1.it)('retrieved lab has identical field values to the created lab (≥100 iterations)', async () => {
        const app = (0, createApp_1.createApp)(db);
        await fc.assert(fc.asyncProperty(printableString(1, 60), // name
        printableString(1, 60), // region
        fc.option(printableString(1, 120), { nil: undefined }), // contact_info
        async (name, region, contact_info) => {
            // 1. Create a lab
            const body = { name, region };
            if (contact_info !== undefined)
                body.contact_info = contact_info;
            const createRes = await (0, supertest_1.default)(app)
                .post('/admin/labs')
                .set('X-Mock-User-Id', adminId)
                .send(body);
            (0, vitest_2.expect)(createRes.status).toBe(201);
            const createdId = createRes.body.id;
            (0, vitest_2.expect)(createdId).toBeTruthy();
            // 2. Retrieve all labs and find the created one
            const listRes = await (0, supertest_1.default)(app)
                .get('/admin/labs')
                .set('X-Mock-User-Id', adminId);
            (0, vitest_2.expect)(listRes.status).toBe(200);
            const labs = listRes.body.labs;
            const found = labs.find((l) => l.id === createdId);
            (0, vitest_2.expect)(found).toBeDefined();
            (0, vitest_2.expect)(found.name).toBe(name);
            (0, vitest_2.expect)(found.region).toBe(region);
            (0, vitest_2.expect)(found.contact_info ?? undefined).toBe(contact_info);
            (0, vitest_2.expect)(found.is_active).toBe(1);
        }), { numRuns: 100 });
    }, 60000 // 60s timeout for 100 iterations
    );
});
