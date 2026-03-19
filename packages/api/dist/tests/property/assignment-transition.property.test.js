"use strict";
// Feature: lab-measurement-request-system, Property 9: Assignment State Transition
/**
 * Validates: Requirements 5.3
 *
 * Property 9: Assignment State Transition
 * For any accepted request, status becomes Assigned and lab ID is recorded.
 *
 * This test verifies:
 * - POST /requests/:id/assign with a valid lab sets status to 'Assigned'
 * - The assigned_lab_id on the returned request matches the provided lab_id
 * - This holds across arbitrary combinations of method names, lab names, and regions
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
    return db;
}
function seedUser(db, role, region = 'EMEA') {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, `${role.toLowerCase()}-${id}`, `${role.toLowerCase()}-${id}@test.local`, `Test ${role}`, role, region, now, now);
    return id;
}
function seedMethod(db, name) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO methods (id, name, is_active, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)`).run(id, name, now, now);
    return id;
}
function seedLab(db, name, region) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO labs (id, name, region, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`).run(id, name, region, now, now);
    return id;
}
function linkLabMethod(db, labId, methodId) {
    db.prepare(`INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)`).run(labId, methodId);
}
function seedRequest(db, requestorId, methodId) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO requests (id, requestor_id, method_id, material_description, purpose_description, desired_completion, status, submitted_at, updated_at)
     VALUES (?, ?, ?, 'test material', 'test purpose', '2025-12-31', 'Submitted', ?, ?)`).run(id, requestorId, methodId, now, now);
    return id;
}
// ── Arbitraries ───────────────────────────────────────────────────────────────
const regionArb = fc.constantFrom('EMEA', 'APAC', 'AMER', 'LATAM');
const assignmentScenarioArb = fc.record({
    methodName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length > 0),
    labName: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length > 0),
    labRegion: regionArb,
    requestorRegion: regionArb,
});
// ── Test suite ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Property 9: Assignment State Transition', () => {
    (0, vitest_1.it)('status becomes Assigned and lab ID is recorded for any valid assignment (≥100 iterations)', async () => {
        await fc.assert(fc.asyncProperty(assignmentScenarioArb, async (scenario) => {
            // Fresh DB per iteration to avoid state accumulation
            const db = createTestDb();
            const app = (0, createApp_1.createApp)(db);
            // Seed users
            const requestorId = seedUser(db, 'Requestor', scenario.requestorRegion);
            const managerId = seedUser(db, 'Lab_Manager', scenario.labRegion);
            // Seed method and lab
            const methodId = seedMethod(db, scenario.methodName);
            const labId = seedLab(db, scenario.labName, scenario.labRegion);
            linkLabMethod(db, labId, methodId);
            // Seed a Submitted request
            const requestId = seedRequest(db, requestorId, methodId);
            // POST /requests/:id/assign
            const res = await (0, supertest_1.default)(app)
                .post(`/requests/${requestId}/assign`)
                .set('X-Mock-User-Id', managerId)
                .send({ lab_id: labId });
            (0, vitest_2.expect)(res.status).toBe(200);
            // Property: status must be 'Assigned'
            (0, vitest_2.expect)(res.body.status).toBe('Assigned');
            // Property: assigned_lab_id must equal the provided lab_id
            (0, vitest_2.expect)(res.body.assigned_lab_id).toBe(labId);
        }), { numRuns: 100 });
    }, 60000 // 60s timeout for 100 iterations
    );
    (0, vitest_1.it)('returns 409 when request is not in Submitted status', async () => {
        const db = createTestDb();
        const app = (0, createApp_1.createApp)(db);
        const requestorId = seedUser(db, 'Requestor', 'EMEA');
        const managerId = seedUser(db, 'Lab_Manager', 'EMEA');
        const methodId = seedMethod(db, 'Some Method');
        const labId = seedLab(db, 'Some Lab', 'EMEA');
        linkLabMethod(db, labId, methodId);
        const requestId = seedRequest(db, requestorId, methodId);
        // First assignment — succeeds
        await (0, supertest_1.default)(app)
            .post(`/requests/${requestId}/assign`)
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: labId });
        // Second assignment — should fail with 409 (already Assigned)
        const res = await (0, supertest_1.default)(app)
            .post(`/requests/${requestId}/assign`)
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: labId });
        (0, vitest_2.expect)(res.status).toBe(409);
    });
    (0, vitest_1.it)('returns 404 for a non-existent request', async () => {
        const db = createTestDb();
        const app = (0, createApp_1.createApp)(db);
        const managerId = seedUser(db, 'Lab_Manager', 'EMEA');
        const res = await (0, supertest_1.default)(app)
            .post('/requests/non-existent-id/assign')
            .set('X-Mock-User-Id', managerId)
            .send({ lab_id: 'some-lab-id' });
        (0, vitest_2.expect)(res.status).toBe(404);
    });
});
