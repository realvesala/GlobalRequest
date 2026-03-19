import Database from 'better-sqlite3';
import { createNotification } from './notifications';

/**
 * Creates in-app notifications for users associated with a request status change.
 * Associated users: requestor, assigned technician (if present), and any lab managers
 * who touched this request (via status history or routing override).
 */
export function notifyStatusChange(
  db: Database.Database,
  requestId: string,
  newStatus: string
): void {
  const requestRow = db
    .prepare('SELECT requestor_id, assigned_technician_id, routing_override_by FROM requests WHERE id = ?')
    .get(requestId) as
    | {
        requestor_id: string;
        assigned_technician_id: string | null;
        routing_override_by: string | null;
      }
    | undefined;

  if (!requestRow) return;

  const managerIds = db
    .prepare(
      `SELECT DISTINCT h.changed_by AS id
       FROM request_status_history h
       JOIN users u ON u.id = h.changed_by
       WHERE h.request_id = ? AND u.role = 'Lab_Manager'`
    )
    .all(requestId) as Array<{ id: string }>;

  const recipients = new Set<string>();
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
    createNotification(
      db,
      userId,
      requestId,
      'status_changed',
      `Request ${requestId} changed status to ${newStatus}.`
    );
  }
}
