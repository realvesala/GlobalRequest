"use strict";
// Feature: lab-measurement-request-system, Property 7: Candidate Lab Capability Filter
/**
 * Validates: Requirements 5.1, 9.2
 *
 * Property 7: Candidate Lab Capability Filter
 * For any method, all candidate labs support that method and none are inactive.
 *
 * This test verifies:
 * - GET /requests/:id/candidates only returns labs that are both active AND support the method
 * - Inactive labs are excluded even if they support the method
 * - Labs that don't support the method are excluded even if they are active
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
function seedLab(db, name, region, isActive) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO labs (id, name, region, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`).run(id, name, region, isActive ? 1 : 0, now, now);
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
/**
 * Generates a configuration of labs:
 * - activeWithMethod: count of active labs that support the method (should appear in candidates)
 * - activeWithoutMethod: count of active labs that do NOT support the method (should be excluded)
 * - inactiveWithMethod: count of inactive labs that support the method (should be excluded)
 * - inactiveWithoutMethod: count of inactive labs that do NOT support the method (should be excluded)
 */
const labConfigArb = fc.record({
    activeWithMethod: fc.integer({ min: 0, max: 5 }),
    activeWithoutMethod: fc.integer({ min: 0, max: 5 }),
    inactiveWithMethod: fc.integer({ min: 0, max: 5 }),
    inactiveWithoutMethod: fc.integer({ min: 0, max: 5 }),
}).filter(cfg => 
// Ensure at least one lab exists in total
cfg.activeWithMethod + cfg.activeWithoutMethod + cfg.inactiveWithMethod + cfg.inactiveWithoutMethod > 0);
// ── Test suite ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Property 7: Candidate Lab Capability Filter', () => {
    let db;
    let requestorId;
    let managerId;
    let methodId;
    let requestId;
    (0, vitest_1.beforeEach)(() => {
        db = createTestDb();
        // createApp runs migrations, so we just need to seed users/method/request
        const app = (0, createApp_1.createApp)(db); // triggers runMigrationsOn
        requestorId = seedUser(db, 'Requestor', 'EMEA');
        managerId = seedUser(db, 'Lab_Manager', 'EMEA');
        methodId = seedMethod(db, 'Test Method');
        requestId = seedRequest(db, requestorId, methodId);
    });
    (0, vitest_1.it)('candidates only contain active labs that support the method (≥100 iterations)', async () => {
        await fc.assert(fc.asyncProperty(labConfigArb, async (cfg) => {
            // Fresh DB per iteration to avoid state accumulation
            const iterDb = createTestDb();
            const iterApp = (0, createApp_1.createApp)(iterDb);
            const iterRequestorId = seedUser(iterDb, 'Requestor', 'EMEA');
            const iterManagerId = seedUser(iterDb, 'Lab_Manager', 'EMEA');
            const iterMethodId = seedMethod(iterDb, 'Iter Method');
            const iterRequestId = seedRequest(iterDb, iterRequestorId, iterMethodId);
            // Track which lab IDs should appear in candidates
            const expectedCandidateIds = new Set();
            // Seed active labs that support the method — these SHOULD appear
            for (let i = 0; i < cfg.activeWithMethod; i++) {
                const labId = seedLab(iterDb, `active-with-method-${i}`, 'EMEA', true);
                linkLabMethod(iterDb, labId, iterMethodId);
                expectedCandidateIds.add(labId);
            }
            // Seed active labs that do NOT support the method — should be excluded
            for (let i = 0; i < cfg.activeWithoutMethod; i++) {
                seedLab(iterDb, `active-without-method-${i}`, 'EMEA', true);
                // No lab_methods link
            }
            // Seed inactive labs that support the method — should be excluded
            for (let i = 0; i < cfg.inactiveWithMethod; i++) {
                const labId = seedLab(iterDb, `inactive-with-method-${i}`, 'EMEA', false);
                linkLabMethod(iterDb, labId, iterMethodId);
            }
            // Seed inactive labs that do NOT support the method — should be excluded
            for (let i = 0; i < cfg.inactiveWithoutMethod; i++) {
                seedLab(iterDb, `inactive-without-method-${i}`, 'EMEA', false);
            }
            // Call GET /requests/:id/candidates
            const res = await (0, supertest_1.default)(iterApp)
                .get(`/requests/${iterRequestId}/candidates`)
                .set('X-Mock-User-Id', iterManagerId);
            (0, vitest_2.expect)(res.status).toBe(200);
            (0, vitest_2.expect)(res.body).toHaveProperty('candidates');
            const candidates = res.body.candidates;
            // Assert: every returned candidate is active
            for (const candidate of candidates) {
                (0, vitest_2.expect)(candidate.is_active).toBe(1);
            }
            // Assert: returned candidate IDs match exactly the expected set
            const returnedIds = new Set(candidates.map(c => c.id));
            (0, vitest_2.expect)(returnedIds).toEqual(expectedCandidateIds);
        }), { numRuns: 100 });
    }, 60000 // 60s timeout for 100 iterations
    );
    (0, vitest_1.it)('returns empty candidates when no labs support the method', async () => {
        const app = (0, createApp_1.createApp)(db);
        // Seed labs that don't support the method
        seedLab(db, 'Active Lab No Method', 'EMEA', true);
        seedLab(db, 'Inactive Lab No Method', 'EMEA', false);
        const res = await (0, supertest_1.default)(app)
            .get(`/requests/${requestId}/candidates`)
            .set('X-Mock-User-Id', managerId);
        (0, vitest_2.expect)(res.status).toBe(200);
        (0, vitest_2.expect)(res.body.candidates).toHaveLength(0);
    });
    (0, vitest_1.it)('excludes inactive labs even when they support the method', async () => {
        const app = (0, createApp_1.createApp)(db);
        const inactiveLabId = seedLab(db, 'Inactive Lab With Method', 'EMEA', false);
        linkLabMethod(db, inactiveLabId, methodId);
        const res = await (0, supertest_1.default)(app)
            .get(`/requests/${requestId}/candidates`)
            .set('X-Mock-User-Id', managerId);
        (0, vitest_2.expect)(res.status).toBe(200);
        const ids = res.body.candidates.map((c) => c.id);
        (0, vitest_2.expect)(ids).not.toContain(inactiveLabId);
    });
    (0, vitest_1.it)('returns 404 for a non-existent request', async () => {
        const app = (0, createApp_1.createApp)(db);
        const res = await (0, supertest_1.default)(app)
            .get('/requests/non-existent-id/candidates')
            .set('X-Mock-User-Id', managerId);
        (0, vitest_2.expect)(res.status).toBe(404);
    });
});
