"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotificationsRouter = createNotificationsRouter;
const express_1 = require("express");
function createNotificationsRouter(db) {
    const router = (0, express_1.Router)();
    // GET /notifications — current user's notifications newest first
    router.get('/', (req, res) => {
        const userId = req.user.id;
        const notifications = db
            .prepare(`SELECT id, user_id, request_id, event_type, message, is_read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC`)
            .all(userId);
        res.json({ notifications });
    });
    // PUT /notifications/:id/read — mark as read (owner only)
    router.put('/:id/read', (req, res) => {
        const userId = req.user.id;
        const { id } = req.params;
        const existing = db
            .prepare('SELECT id, user_id FROM notifications WHERE id = ?')
            .get(id);
        if (!existing) {
            res.status(404).json({ error: 'Notification not found' });
            return;
        }
        if (existing.user_id !== userId) {
            res.status(403).json({ error: 'Forbidden: cannot modify this notification' });
            return;
        }
        db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
        const updated = db
            .prepare('SELECT id, user_id, request_id, event_type, message, is_read, created_at FROM notifications WHERE id = ?')
            .get(id);
        res.json(updated);
    });
    return router;
}
