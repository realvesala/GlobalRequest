"use strict";
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
exports.createApp = createApp;
const express_1 = __importStar(require("express"));
const cors_1 = __importDefault(require("cors"));
const authFactory_1 = require("./middleware/authFactory");
const admin_1 = require("./routes/admin");
const requests_1 = require("./routes/requests");
const migrate_1 = require("./migrate");
/**
 * Creates an Express app wired to the given SQLite database instance.
 * Used by tests to inject an in-memory DB.
 */
function createApp(db) {
    const app = (0, express_1.default)();
    // Ensure schema exists on the provided DB (idempotent — uses CREATE TABLE IF NOT EXISTS)
    (0, migrate_1.runMigrationsOn)(db);
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    // Auth middleware using the provided db
    const authMiddleware = (0, authFactory_1.mockAuthMiddlewareWithDb)(db);
    app.use(authMiddleware);
    // Auth routes
    const authRouter = (0, express_1.Router)();
    authRouter.get('/me', (req, res) => {
        const { id, email, display_name, role, region } = req.user;
        res.json({ id, email, display_name, role, region });
    });
    app.use('/auth', authRouter);
    // Admin routes — Admin only (labs, methods, users stubs)
    const adminRouter = (0, admin_1.createAdminRouter)(db);
    // Users stubs (managed by a future task)
    adminRouter.get('/users', (_req, res) => res.json({ users: [] }));
    adminRouter.put('/users/:id/role', (_req, res) => res.json({ updated: true }));
    app.use('/admin', adminRouter);
    // Requests routes
    const requestsRouter = (0, requests_1.createRequestsRouter)(db);
    app.use('/requests', requestsRouter);
    return app;
}
