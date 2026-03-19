"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
const uuid_1 = require("uuid");
/**
 * Inserts an in-app notification record for a user.
 */
function createNotification(db, userId, requestId, eventType, message) {
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO notifications (id, user_id, request_id, event_type, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`).run(id, userId, requestId, eventType, message, now);
}
