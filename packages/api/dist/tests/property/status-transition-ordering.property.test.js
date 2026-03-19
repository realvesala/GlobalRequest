"use strict";
// Feature: lab-measurement-request-system, Property 4: Status Transition Ordering
/**
 * Validates: Requirements 4.1
 *
 * Property 4: Status Transition Ordering
 * For any sequence of status transitions, only allowed orderings are accepted.
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
const allStatuses = ['Submitted', 'Assigned', 'In_Progress', 'Results_Ready', 'Closed', 'Unroutable'];
function isAllowed(from, to) {
    const allowed = {
        Submitted: ['Assigned', 'Unroutable'],
        Assigned: ['In_Progress'],
        In_Progress: ['Results_Ready'],
        Results_Ready: ['Closed'],
        Closed: [],
        Unroutable: [],
    };
    return allowed[from].includes(to);
}
(0, vitest_1.describe)('Property 4: Status Transition Ordering', () => {
    (0, vitest_1.it)('accepts exactly the allowed ordering and rejects all other transitions (>=100 iterations)', async () => {
        const transitionArb = fc.record({
            toStatus: fc.constantFrom(...allStatuses),
            chooseFromValidCurrent: fc.boolean(),
        });
        await fc.assert(fc.asyncProperty(transitionArb, async ({ toStatus, chooseFromValidCurrent }) => {
            const db = createTestDb();
            const requestorId = seedUser(db, 'Requestor');
            const managerId = seedUser(db, 'Lab_Manager');
            const methodId = seedMethod(db);
            const requestId = seedRequest(db, requestorId, methodId);
            // Move request to a chosen current state by valid transitions only.
            const progression = ['Submitted', 'Assigned', 'In_Progress', 'Results_Ready', 'Closed'];
            const current = chooseFromValidCurrent
                ? progression[Math.floor(Math.random() * progression.length)]
                : 'Unroutable';
            let active = 'Submitted';
            if (current === 'Unroutable') {
                const r = (0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: 'Unroutable' });
                (0, vitest_2.expect)(r.ok).toBe(true);
                active = 'Unroutable';
            }
            else {
                for (let i = 1; i <= progression.indexOf(current); i += 1) {
                    const next = progression[i];
                    const r = (0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus: next });
                    (0, vitest_2.expect)(r.ok).toBe(true);
                    active = next;
                }
            }
            const result = (0, transitionStatus_1.transitionStatus)({ db, requestId, actorId: managerId, toStatus });
            const shouldBeAllowed = isAllowed(active, toStatus);
            if (shouldBeAllowed) {
                (0, vitest_2.expect)(result.ok).toBe(true);
            }
            else {
                (0, vitest_2.expect)(result.ok).toBe(false);
                if (!result.ok) {
                    (0, vitest_2.expect)(result.type).toBe('conflict');
                    if (result.type === 'conflict') {
                        (0, vitest_2.expect)(result.currentStatus).toBe(active);
                    }
                }
            }
        }), { numRuns: 100 });
    }, 60000);
});
