import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Submitted: ['Assigned', 'Unroutable'],
  Assigned: ['In_Progress'],
  In_Progress: ['Results_Ready'],
  Results_Ready: ['Closed'],
  Closed: [],
  Unroutable: [],
};

type TransitionResult =
  | { ok: true; request: any }
  | { ok: false; type: 'not_found' }
  | { ok: false; type: 'conflict'; currentStatus: string; allowedTransitions: string[] };

type TransitionParams = {
  db: Database.Database;
  requestId: string;
  actorId: string;
  toStatus: string;
  now?: string;
  extraFields?: Record<string, unknown>;
};

/**
 * Validates and performs a status transition, including audit history insertion.
 */
export function transitionStatus(params: TransitionParams): TransitionResult {
  const { db, requestId, actorId, toStatus, extraFields = {} } = params;
  const now = params.now ?? new Date().toISOString();

  const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as
    | { id: string; status: string }
    | undefined;
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
  const values: unknown[] = [toStatus, now];
  for (const [key, value] of entries) {
    setFragments.push(`${key} = ?`);
    values.push(value);
  }
  values.push(requestId);

  db.prepare(
    `UPDATE requests
     SET ${setFragments.join(', ')}
     WHERE id = ?`
  ).run(...values);

  db.prepare(
    `INSERT INTO request_status_history (id, request_id, previous_status, new_status, changed_by, changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), requestId, requestRow.status, toStatus, actorId, now);

  const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  return { ok: true, request: updated };
}
