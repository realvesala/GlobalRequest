"use strict";
// Feature: lab-measurement-request-system, Property 5: Status Change Audit Trail
/**
 * Validates: Requirements 4.2
 *
 * Property 5: Status Change Audit Trail
 * For any status change, history entry contains all four required fields.
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
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const uuid_1 = require("uuid");
const migrate_1 = require("../../migrate");
const transitionStatus_1 = require("../../helpers/transitionStatus");
function createTestDb() {
    const db = new better_sqlite3_1.default(':memory:');
    db.pragma('foreign_keys = ON');
    (0, migrate_1.runMigrationsOn)(db);
    return db;
}
function seedUser(db, role) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, `${role}-${id}`, `${role}-${id}@test.local`, role, role, 'EMEA', now, now);
    return id;
}
function seedMethod(db) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO methods (id, name, description, required_material, is_active, created_at, updated_at)
     VALUES (?, 'Method', NULL, NULL, 1, ?, ?)`).run(id, now, now);
    return id;
}
function seedRequest(db, requestorId, methodId) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO requests
      (id, requestor_id, method_id, material_description, purpose_description, desired_completion, status, submitted_at, updated_at)
     VALUES (?, ?, ?, 'm', 'p', '2026-12-31', 'Submitted', ?, ?)`).run(id, requestorId, methodId, now, now);
    return id;
}
(0, vitest_1.describe)('Property 5: Status Change Audit Trail', () => {
    (0, vitest_1.it)('every successful status transition writes previous/new status, actor and timestamp (>=100 iterations)', async () => {
        const transitionArb = fc.constantFrom({ from: 'Submitted', to: 'Assigned' }, { from: 'Submitted', to: 'Unroutable' }, { from: 'Assigned', to: 'In_Progress' }, { from: 'In_Progress', to: 'Results_Ready' }, { from: 'Results_Ready', to: 'Closed' });
        await fc.assert(fc.asyncProperty(transitionArb, async ({ from, to }) => {
            const db = createTestDb();
            const requestorId = seedUser(db, 'Requestor');
            const managerId = seedUser(db, 'Lab_Manager');
            const methodId = seedMethod(db);
            const requestId = seedRequest(db, requestorId, methodId);
            // Move request to desired "from" status.
            if (from === 'Assigned') {
                const r = (0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'Assigned' });
                (0, vitest_2.expect)(r.ok).toBe(true);
            }
            else if (from === 'In_Progress') {
                (0, vitest_2.expect)((0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'Assigned' }).ok).toBe(true);
                (0, vitest_2.expect)((0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'In_Progress' }).ok).toBe(true);
            }
            else if (from === 'Results_Ready') {
                (0, vitest_2.expect)((0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'Assigned' }).ok).toBe(true);
                (0, vitest_2.expect)((0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'In_Progress' }).ok).toBe(true);
                (0, vitest_2.expect)((0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'Results_Ready' }).ok).toBe(true);
            }
            const result = (0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: to });
            (0, vitest_2.expect)(result.ok).toBe(true);
            const latestHistory = db
                .prepare(`SELECT previous_status, new_status, changed_by, changed_at
               FROM request_status_history
               WHERE request_id = ?
               ORDER BY rowid DESC
               LIMIT 1`)
                .get(requestId);
            (0, vitest_2.expect)(latestHistory).toBeDefined();
            (0, vitest_2.expect)(latestHistory?.previous_status ?? null).toBe(from);
            (0, vitest_2.expect)(latestHistory?.new_status).toBe(to);
            (0, vitest_2.expect)(latestHistory?.changed_by).toBe(managerId);
            (0, vitest_2.expect)(typeof latestHistory?.changed_at).toBe('string');
            (0, vitest_2.expect)((latestHistory?.changed_at ?? '').length).toBeGreaterThan(0);
        }), { numRuns: 100 });
    }, 60000);
});
