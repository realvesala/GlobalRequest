"use strict";
// Feature: lab-measurement-request-system, Property 12: Result Required for Completion
/**
 * Validates: Requirements 6.3
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
function seedUser(db, role) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'EMEA', ?, ?)`).run(id, `${role}-${id}`, `${role}-${id}@test.local`, role, role, now, now);
    return id;
}
function seedMethod(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
     VALUES (?, 'M', NULL, NULL, 1, ?, ?)`).run(id, now, now);
    return id;
}
function seedLabAndLink(db, methodId) {
    const labId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO labs (id, name, region, contact_info, is_active, created_at, updated_at)
     VALUES (?, 'Lab', 'EMEA', NULL, 1, ?, ?)`).run(labId, now, now);
    db.prepare('INSERT INTO lab_methods (lab_id, method_id) VALUES (?, ?)').run(labId, methodId);
    return labId;
}
(0, vitest_1.describe)('Property 12: Result Required for Completion', () => {
    (0, vitest_1.it)('completion attempt without attached result file is rejected (>=100 iterations)', async () => {
        await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 30 }), async (purpose) => {
            const db = createTestDb();
            const app = (0, createApp_1.createApp)(db);
            const requestorId = seedUser(db, 'Requestor');
            const managerId = seedUser(db, 'Lab_Manager');
            const technicianId = seedUser(db, 'Lab_Technician');
            const methodId = seedMethod(db);
            const labId = seedLabAndLink(db, methodId);
            const created = await (0, supertest_1.default)(app)
                .post('/requests')
                .set('X-Mock-User-Id', requestorId)
                .send({
                method_id: methodId,
                material_description: 'm',
                purpose_description: purpose,
                desired_completion: '2026-12-31',
            });
            const requestId = created.body.id;
            await (0, supertest_1.default)(app)
                .post(`/requests/${requestId}/assign`)
                .set('X-Mock-User-Id', managerId)
                .send({ lab_id: labId });
            await (0, supertest_1.default)(app)
                .post(`/requests/${requestId}/assign-technician`)
                .set('X-Mock-User-Id', managerId)
                .send({ technician_id: technicianId });
            const noFile = await (0, supertest_1.default)(app)
                .post(`/requests/${requestId}/results`)
                .set('X-Mock-User-Id', technicianId)
                .field('note', 'no file attached');
            (0, vitest_2.expect)(noFile.status).toBe(422);
            (0, vitest_2.expect)(noFile.body.error).toContain('At least one result file is required');
            const detail = await (0, supertest_1.default)(app)
                .get(`/requests/${requestId}`)
                .set('X-Mock-User-Id', requestorId);
            (0, vitest_2.expect)(detail.status).toBe(200);
            (0, vitest_2.expect)(detail.body.request.status).toBe('In_Progress');
        }), { numRuns: 100 });
    }, 90000);
});
