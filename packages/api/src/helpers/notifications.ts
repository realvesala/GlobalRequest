import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Inserts an in-app notification record for a user.
 */
export function createNotification(
  db: Database.Database,
  userId: string,
  requestId: string | null,
  eventType: string,
  message: string
): void {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, user_id, request_id, event_type, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(id, userId, requestId, eventType, message, now);
}
