"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitionStatus = transitionStatus;
const uuid_1 = require("uuid");
const ALLOWED_TRANSITIONS = {
    Submitted: ['Assigned', 'Unroutable'],
    Assigned: ['In_Progress'],
    In_Progress: ['Results_Ready'],
    Results_Ready: ['Closed'],
    Closed: [],
    Unroutable: [],
};
/**
 * Validates and performs a status transition, including audit history insertion.
 */
function transitionStatus(params) {
    const { db, requestId, actorId, toStatus, extraFields = {} } = params;
    const now = params.now ?? new Date().toISOString();
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!requestRow) {
        return { ok: false, type: 'not_found' };
    }
    const allowedTransitions = ALLOWED_TRANSITIONS[requestRow.status] ?? [];
    if (!allowedTransitions.includes(toStatus)) {
        return {
            ok: false,
            type: 'conflict',
            currentStatus: requestRow.status,
            allowedTransitions,
        };
    }
    const entries = Object.entries(extraFields);
    const setFragments = ['status = ?', 'updated_at = ?'];
    const values = [toStatus, now];
    for (const [key, value] of entries) {
        setFragments.push(`${key} = ?`);
        values.push(value);
    }
    values.push(requestId);
    db.prepare(`UPDATE requests
     SET ${setFragments.join(', ')}
     WHERE id = ?`).run(...values);
    db.prepare(`INSERT INTO request_status_history (id, request_id, previous_status, new_status, changed_by, changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`).run((0, uuid_1.v4)(), requestId, requestRow.status, toStatus, actorId, now);
    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    return { ok: true, request: updated };
}
