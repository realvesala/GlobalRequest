"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyStatusChange = notifyStatusChange;
const notifications_1 = require("./notifications");
/**
 * Creates in-app notifications for users associated with a request status change.
 * Associated users: requestor, assigned technician (if present), and any lab managers
 * who touched this request (via status history or routing override).
 */
function notifyStatusChange(db, requestId, newStatus) {
    const requestRow = db
        .prepare('SELECT requestor_id, assigned_technician_id, routing_override_by FROM requests WHERE id = ?')
        .get(requestId);
    if (!requestRow)
        return;
    const managerIds = db
        .prepare(`SELECT DISTINCT h.changed_by AS id
       FROM request_status_history h
       JOIN users u ON u.id = h.changed_by
       WHERE h.request_id = ? AND u.role = 'Lab_Manager'`)
        .all(requestId);
    const recipients = new Set();
    recipients.add(requestRow.requestor_id);
    if (requestRow.assigned_technician_id) {
        recipients.add(requestRow.assigned_technician_id);
    }
    if (requestRow.routing_override_by) {
        recipients.add(requestRow.routing_override_by);
    }
    for (const manager of managerIds) {
        recipients.add(manager.id);
    }
    for (const userId of recipients) {
        (0, notifications_1.createNotification)(db, userId, requestId, 'status_changed', `Request ${requestId} changed status to ${newStatus}.`);
    }
}
