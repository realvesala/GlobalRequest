"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const migrate_1 = require("./migrate");
const auth_1 = require("./middleware/auth");
const auth_2 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const db_1 = __importDefault(require("./db"));
const admin_1 = require("./routes/admin");
const requests_1 = require("./routes/requests");
const notifications_1 = require("./routes/notifications");
// Run migrations on startup
(0, migrate_1.runMigrations)();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health check and users list are public — no auth required
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/users', users_1.default);
// All routes below require mock auth
app.use(auth_1.mockAuthMiddleware);
app.use('/auth', auth_2.default);
app.use('/admin', (0, admin_1.createAdminRouter)(db_1.default));
app.use('/requests', (0, requests_1.createRequestsRouter)(db_1.default));
app.use('/notifications', (0, notifications_1.createNotificationsRouter)(db_1.default));
app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});
exports.default = app;
