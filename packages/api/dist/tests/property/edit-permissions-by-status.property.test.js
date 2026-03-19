"use strict";
// Feature: lab-measurement-request-system, Property 6: Edit Permissions by Status
/**
 * Validates: Requirements 4.3, 4.4
 *
 * Property 6: Edit Permissions by Status
 * For any request, edit permission matches status (allowed at Submitted, denied at Assigned+).
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
function createTestDb() {
    const db = new better_sqlite3_1.default(':memory:');
    db.pragma('foreign_keys = ON');
    return db;
}
function seedUser(db, role, region = 'EMEA') {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, `${role}-${id}`, `${role}-${id}@test.local`, role, role, region, now, now);
    return id;
}
function seedMethod(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
     VALUES (?, 'Method', NULL, NULL, 1, ?, ?)`).run(id, now, now);
    return id;
}
function seedLab(db, methodId) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO labs (id, name, region, contact_info, is_active, created_at, updated_at)
     VALUES (?, 'Lab', 'EMEA', NULL, 1, ?, ?)`).run(id, now, now);
    db.prepare('INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)').run(id, methodId);
    return id;
}
(0, vitest_1.describe)('Property 6: Edit Permissions by Status', () => {
    (0, vitest_1.it)('owning requestor may edit at Submitted, but not once Assigned (>=100 iterations)', async () => {
        const bodyArb = fc.record({
            material_description: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
            purpose_description: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
        });
        await fc.assert(fc.asyncProperty(bodyArb, async (patch) => {
            const db = createTestDb();
            const app = (0, createApp_1.createApp)(db);
            const ownerId = seedUser(db, 'Requestor');
            const managerId = seedUser(db, 'Lab_Manager');
            const methodId = seedMethod(db);
            const labId = seedLab(db, methodId);
            const createRes = await (0, supertest_1.default)(app)
                .post('/requests')
                .set('X-Mock-User-Id', ownerId)
                .send({
                method_id: methodId,
                material_description: 'initial',
                purpose_description: 'initial',
                desired_completion: '2026-12-31',
            });
            (0, vitest_2.expect)(createRes.status).toBe(201);
            const requestId = createRes.body.id;
            // Submitted: owner can edit.
            const editSubmitted = await (0, supertest_1.default)(app)
                .put(`/requests/${requestId}`)
                .set('X-Mock-User-Id', ownerId)
                .send(patch);
            (0, vitest_2.expect)(editSubmitted.status).toBe(200);
            (0, vitest_2.expect)(editSubmitted.body.material_description).toBe(patch.material_description);
            (0, vitest_2.expect)(editSubmitted.body.purpose_description).toBe(patch.purpose_description);
            // Move to Assigned.
            const assignRes = await (0, supertest_1.default)(app)
                .post(`/requests/${requestId}/assign`)
                .set('X-Mock-User-Id', managerId)
                .send({ lab_id: labId });
            (0, vitest_2.expect)(assignRes.status).toBe(200);
            // Assigned+: owner edit must be denied.
            const editAssigned = await (0, supertest_1.default)(app)
                .put(`/requests/${requestId}`)
                .set('X-Mock-User-Id', ownerId)
                .send({ material_description: 'forbidden' });
            (0, vitest_2.expect)(editAssigned.status).toBe(403);
        }), { numRuns: 100 });
    }, 90000);
    (0, vitest_1.it)('non-owner requestor is denied edit even while Submitted', async () => {
        const db = createTestDb();
        const app = (0, createApp_1.createApp)(db);
        const ownerId = seedUser(db, 'Requestor');
        const otherRequestorId = seedUser(db, 'Requestor');
        const methodId = seedMethod(db);
        const createRes = await (0, supertest_1.default)(app)
            .post('/requests')
            .set('X-Mock-User-Id', ownerId)
            .send({
            method_id: methodId,
            material_description: 'initial',
            purpose_description: 'initial',
            desired_completion: '2026-12-31',
        });
        (0, vitest_2.expect)(createRes.status).toBe(201);
        const editRes = await (0, supertest_1.default)(app)
            .put(`/requests/${createRes.body.id}`)
            .set('X-Mock-User-Id', otherRequestorId)
            .send({ material_description: 'nope' });
        (0, vitest_2.expect)(editRes.status).toBe(403);
    });
});
