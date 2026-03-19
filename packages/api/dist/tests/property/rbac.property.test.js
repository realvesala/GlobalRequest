"use strict";
// Feature: lab-measurement-request-system, Property 1: Role-Based Access Control Enforcement
/**
 * Validates: Requirements 2.3, 2.4
 *
 * Property 1: Role-Based Access Control Enforcement
 * For any non-Admin role and any admin endpoint, access is denied (403).
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
// ── In-memory DB setup ────────────────────────────────────────────────────────
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
const NON_ADMIN_ROLES = ['Requestor', 'Lab_Technician', 'Lab_Manager'];
const ADMIN_ENDPOINTS = [
    { method: 'GET', path: '/admin/labs' },
    { method: 'POST', path: '/admin/labs' },
    { method: 'PUT', path: '/admin/labs/some-id' },
    { method: 'DELETE', path: '/admin/labs/some-id' },
    { method: 'GET', path: '/admin/methods' },
    { method: 'POST', path: '/admin/methods' },
    { method: 'PUT', path: '/admin/methods/some-id' },
    { method: 'DELETE', path: '/admin/methods/some-id' },
    { method: 'GET', path: '/admin/users' },
    { method: 'PUT', path: '/admin/users/some-id/role' },
];
// ── Test suite ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('Property 1: Role-Based Access Control Enforcement', () => {
    let db;
    // Map role → seeded user id
    const userIds = {};
    (0, vitest_1.beforeAll)(() => {
        db = createTestDb();
        const now = new Date().toISOString();
        const insert = db.prepare(`INSERT INTO users (id, sso_subject, email, display_name, role, region, created_at, updated_at)
       VALUES (@id, @sso_subject, @email, @display_name, @role, @region, @created_at, @updated_at)`);
        const allRoles = ['Requestor', 'Lab_Technician', 'Lab_Manager', 'Admin'];
        for (const role of allRoles) {
            const id = (0, uuid_1.v4)();
            userIds[role] = id;
            insert.run({
                id,
                sso_subject: `test-${role.toLowerCase()}`,
                email: `${role.toLowerCase()}@test.local`,
                display_name: `Test ${role}`,
                role,
                region: 'EMEA',
                created_at: now,
                updated_at: now,
            });
        }
    });
    (0, vitest_1.it)('non-Admin roles receive 403 on all admin endpoints (≥100 iterations)', async () => {
        const app = (0, createApp_1.createApp)(db);
        // Arbitraries
        const roleArb = fc.constantFrom(...NON_ADMIN_ROLES);
        const endpointArb = fc.constantFrom(...ADMIN_ENDPOINTS);
        await fc.assert(fc.asyncProperty(roleArb, endpointArb, async (role, endpoint) => {
            const userId = userIds[role];
            const req = (0, supertest_1.default)(app)[endpoint.method.toLowerCase()](endpoint.path).set('X-Mock-User-Id', userId);
            const response = await req;
            (0, vitest_2.expect)(response.status).toBe(403);
        }), { numRuns: 100 });
    }, 30000 // 30s timeout for 100 iterations
    );
    (0, vitest_1.it)('Admin role can access admin endpoints (sanity check)', async () => {
        const app = (0, createApp_1.createApp)(db);
        const adminId = userIds['Admin'];
        const response = await (0, supertest_1.default)(app)
            .get('/admin/labs')
            .set('X-Mock-User-Id', adminId);
        (0, vitest_2.expect)(response.status).toBe(200);
    });
    (0, vitest_1.it)('missing auth header returns 401 on admin endpoints', async () => {
        const app = (0, createApp_1.createApp)(db);
        const response = await (0, supertest_1.default)(app).get('/admin/labs');
        (0, vitest_2.expect)(response.status).toBe(401);
    });
});
