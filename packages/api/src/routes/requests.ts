import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { requireRole } from '../middleware/requireRole';
import { createNotification } from '../helpers/notifications';
import { transitionStatus } from '../helpers/transitionStatus';
import { notifyStatusChange } from '../helpers/statusNotifications';

export function createRequestsRouter(db: Database.Database): Router {
  const router = Router();
  const uploadDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${uuidv4()}-${safeOriginal}`);
      },
    }),
  });

  type RequestRow = {
    id: string;
    requestor_id: string;
    assigned_lab_id: string | null;
    assigned_technician_id: string | null;
    status: string;
  };

  function canViewRequest(requestRow: RequestRow, user: Express.Request['user']): boolean {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    if (user.role === 'Requestor') return requestRow.requestor_id === user.id;
    if (user.role === 'Lab_Technician') return requestRow.assigned_technician_id === user.id;
    if (user.role === 'Lab_Manager') {
      // This PoC does not model explicit manager->lab ownership, so we scope by region:
      // - assigned requests whose lab is in manager's region
      // - unassigned requests where the requestor is in manager's region
      const regionScoped = db.prepare(
        `SELECT 1
         FROM requests r
         LEFT JOIN labs l ON l.id = r.assigned_lab_id
         LEFT JOIN users u ON u.id = r.requestor_id
         WHERE r.id = ?
           AND (
             (r.assigned_lab_id IS NOT NULL AND l.region = ?)
             OR
             (r.assigned_lab_id IS NULL AND u.region = ?)
           )
         LIMIT 1`
      ).get(requestRow.id, user.region ?? '', user.region ?? '');
      return Boolean(regionScoped);
    }
    return false;
  }

  // GET /requests — role-aware request list
  router.get('/', (req, res) => {
    const user = req.user!;
    let rows: any[] = [];

    if (user.role === 'Admin') {
      rows = db.prepare(
        `SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         ORDER BY r.submitted_at DESC`
      ).all() as any[];
    } else if (user.role === 'Requestor') {
      rows = db.prepare(
        `SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         WHERE r.requestor_id = ?
         ORDER BY r.submitted_at DESC`
      ).all(user.id) as any[];
    } else if (user.role === 'Lab_Technician') {
      rows = db.prepare(
        `SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         WHERE r.assigned_technician_id = ?
         ORDER BY r.submitted_at DESC`
      ).all(user.id) as any[];
    } else if (user.role === 'Lab_Manager') {
      rows = db.prepare(
        `SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name, l.region AS assigned_lab_region
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         LEFT JOIN labs l ON l.id = r.assigned_lab_id
         WHERE (
           (r.assigned_lab_id IS NOT NULL AND l.region = ?)
           OR
           (r.assigned_lab_id IS NULL AND u.region = ?)
         )
         ORDER BY r.submitted_at DESC`
      ).all(user.region ?? '', user.region ?? '') as any[];
    }

    const requests = rows.map((r) => ({
      ...r,
      title: `${r.method_name} — ${r.material_description}`,
      region: r.requestor_region,
    }));

    res.json({ requests });
  });

  // GET /requests/:id/history — ordered status history entries
  router.get('/:id/history', (req, res) => {
    const { id } = req.params;
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (!canViewRequest(requestRow, req.user)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }

    const history = db.prepare(
      `SELECT h.*, u.display_name AS changed_by_name
       FROM request_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.request_id = ?
       ORDER BY h.changed_at ASC`
    ).all(id);

    res.json({ history });
  });

  // GET /requests/:id — request detail including status history
  router.get('/:id', (req, res) => {
    const { id } = req.params;
    const requestRow = db.prepare(
      `SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region,
              m.name AS method_name, l.name AS assigned_lab_name,
              t.display_name AS assigned_technician_name
       FROM requests r
       JOIN users u ON u.id = r.requestor_id
       JOIN methods m ON m.id = r.method_id
       LEFT JOIN labs l ON l.id = r.assigned_lab_id
       LEFT JOIN users t ON t.id = r.assigned_technician_id
       WHERE r.id = ?`
    ).get(id) as (RequestRow & Record<string, any>) | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (!canViewRequest(requestRow, req.user)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }

    const history = db.prepare(
      `SELECT h.*, u.display_name AS changed_by_name
       FROM request_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.request_id = ?
       ORDER BY h.changed_at ASC`
    ).all(id);

    const results = db.prepare(
      `SELECT id, request_id, uploaded_by, file_key, file_name, mime_type, uploaded_at
       FROM results
       WHERE request_id = ?
       ORDER BY uploaded_at DESC`
    ).all(id);

    res.json({
      request: {
        ...requestRow,
        title: `${requestRow.method_name} — ${requestRow.material_description}`,
        region: requestRow.requestor_region,
      },
      history,
      results,
    });
  });

  // GET /requests/:id/candidates — Lab_Manager and Admin
  router.get('/:id/candidates', requireRole('Lab_Manager', 'Admin'), (req, res) => {
    const { id } = req.params;

    // Look up the request
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // Get the requestor's region
    const requestor = db.prepare('SELECT region FROM users WHERE id = ?').get(requestRow.requestor_id) as any;
    const requestorRegion = requestor?.region ?? null;

    // Find all active labs that support the request's method
    const candidates = db.prepare(`
      SELECT l.id, l.name, l.region, l.contact_info, l.is_active,
             COUNT(CASE WHEN r.status IN ('Submitted','Assigned','In_Progress') THEN 1 END) AS open_request_count
      FROM labs l
      JOIN lab_methods lm ON lm.lab_id = l.id
      LEFT JOIN requests r ON r.assigned_lab_id = l.id
      WHERE lm.method_id = ? AND l.is_active = 1
      GROUP BY l.id
    `).all(requestRow.method_id) as Array<{
      id: string;
      name: string;
      region: string;
      contact_info: string | null;
      is_active: number;
      open_request_count: number;
    }>;

    // Rank: same region first, then ascending open_request_count
    candidates.sort((a, b) => {
      const aLocal = a.region === requestorRegion ? 0 : 1;
      const bLocal = b.region === requestorRegion ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
      return a.open_request_count - b.open_request_count;
    });

    res.json({ candidates });
  });

  // POST /requests/:id/assign — Lab_Manager only
  router.post('/:id/assign', requireRole('Lab_Manager'), (req, res) => {
    const { id } = req.params;
    const { lab_id } = req.body as { lab_id?: string };
    const managerId = req.user!.id;
    const now = new Date().toISOString();

    // Validate request exists
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // Determine if the provided lab is a valid candidate
    let validLab: any = null;
    if (lab_id) {
      validLab = db.prepare(
        `SELECT l.* FROM labs l
         JOIN lab_methods lm ON lm.lab_id = l.id
         WHERE l.id = ? AND l.is_active = 1 AND lm.method_id = ?`
      ).get(lab_id, requestRow.method_id);
    }

    if (!validLab) {
      const transition = transitionStatus({
        db,
        requestId: id,
        actorId: managerId,
        toStatus: 'Unroutable',
        now,
      });
      if (!transition.ok) {
        if (transition.type === 'not_found') {
          res.status(404).json({ error: 'Request not found' });
          return;
        }
        res.status(409).json({
          error: 'Illegal status transition',
          current_status: transition.currentStatus,
          allowed_transitions: transition.allowedTransitions,
        });
        return;
      }

      // Notify requestor
      createNotification(
        db,
        requestRow.requestor_id,
        id,
        'request_unroutable',
        `Your request (${id}) could not be routed to any lab — no lab supports the requested method.`
      );
      notifyStatusChange(db, id, 'Unroutable');

      res.json(transition.request);
      return;
    }

    const transition = transitionStatus({
      db,
      requestId: id,
      actorId: managerId,
      toStatus: 'Assigned',
      now,
      extraFields: { assigned_lab_id: lab_id ?? null },
    });
    if (!transition.ok) {
      if (transition.type === 'not_found') {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
      res.status(409).json({
        error: 'Illegal status transition',
        current_status: transition.currentStatus,
        allowed_transitions: transition.allowedTransitions,
      });
      return;
    }
    notifyStatusChange(db, id, 'Assigned');
    res.json(transition.request);
  });

  // POST /requests/:id/override-route — Lab_Manager only
  router.post('/:id/override-route', requireRole('Lab_Manager'), (req, res) => {
    const { id } = req.params;
    const { lab_id, reason } = req.body as { lab_id?: string; reason?: string };
    const managerId = req.user!.id;
    const now = new Date().toISOString();

    // Validate request exists
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // Validate reason is provided
    if (!reason) {
      res.status(400).json({ error: 'reason is required' });
      return;
    }

    // Validate lab exists and is active
    if (!lab_id) {
      res.status(400).json({ error: 'lab_id is required' });
      return;
    }
    const lab = db.prepare('SELECT * FROM labs WHERE id = ? AND is_active = 1').get(lab_id) as any;
    if (!lab) {
      res.status(422).json({ error: 'Lab not found or is inactive' });
      return;
    }

    // Determine if we need a status transition
    const needsStatusTransition = requestRow.status === 'Submitted';

    if (needsStatusTransition) {
      const transition = transitionStatus({
        db,
        requestId: id,
        actorId: managerId,
        toStatus: 'Assigned',
        now,
        extraFields: {
          assigned_lab_id: lab_id,
          routing_override_reason: reason,
          routing_override_by: managerId,
        },
      });
      if (!transition.ok) {
        if (transition.type === 'not_found') {
          res.status(404).json({ error: 'Request not found' });
          return;
        }
        res.status(409).json({
          error: 'Illegal status transition',
          current_status: transition.currentStatus,
          allowed_transitions: transition.allowedTransitions,
        });
        return;
      }
      notifyStatusChange(db, id, 'Assigned');
      res.json(transition.request);
      return;
    } else {
      // Already Assigned or other status — just update lab and override fields
      db.prepare(
        `UPDATE requests SET assigned_lab_id = ?, routing_override_reason = ?, routing_override_by = ?, updated_at = ? WHERE id = ?`
      ).run(lab_id, reason, managerId, now, id);
    }

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json(updated);
  });

  // POST /requests/:id/assign-technician — Lab_Manager only
  router.post('/:id/assign-technician', requireRole('Lab_Manager'), (req, res) => {
    const { id } = req.params;
    const { technician_id } = req.body as { technician_id?: string };
    const managerId = req.user!.id;
    const now = new Date().toISOString();

    // Validate request exists
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // Validate technician exists and has Lab_Technician role
    if (!technician_id) {
      res.status(400).json({ error: 'technician_id is required' });
      return;
    }
    const technician = db.prepare('SELECT * FROM users WHERE id = ?').get(technician_id) as any;
    if (!technician || technician.role !== 'Lab_Technician') {
      res.status(422).json({ error: 'Technician not found or does not have Lab_Technician role' });
      return;
    }

    const transition = transitionStatus({
      db,
      requestId: id,
      actorId: managerId,
      toStatus: 'In_Progress',
      now,
      extraFields: { assigned_technician_id: technician_id },
    });
    if (!transition.ok) {
      if (transition.type === 'not_found') {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
      res.status(409).json({
        error: 'Illegal status transition',
        current_status: transition.currentStatus,
        allowed_transitions: transition.allowedTransitions,
      });
      return;
    }

    notifyStatusChange(db, id, 'In_Progress');

    res.json(transition.request);
  });

  // POST /requests/:id/reassign-technician — Lab_Manager only
  router.post('/:id/reassign-technician', requireRole('Lab_Manager'), (req, res) => {
    const { id } = req.params;
    const { technician_id } = req.body as { technician_id?: string };
    const now = new Date().toISOString();

    // Validate request exists and is In_Progress
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (requestRow.status !== 'In_Progress') {
      res.status(409).json({ error: 'Request must be in In_Progress status to reassign technician', current_status: requestRow.status });
      return;
    }

    // Validate technician exists and has Lab_Technician role
    if (!technician_id) {
      res.status(400).json({ error: 'technician_id is required' });
      return;
    }
    const technician = db.prepare('SELECT * FROM users WHERE id = ?').get(technician_id) as any;
    if (!technician || technician.role !== 'Lab_Technician') {
      res.status(422).json({ error: 'Technician not found or does not have Lab_Technician role' });
      return;
    }

    // Update technician without changing status
    db.prepare(
      `UPDATE requests SET assigned_technician_id = ?, updated_at = ? WHERE id = ?`
    ).run(technician_id, now, id);

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json(updated);
  });

  // POST /requests/:id/notes — Lab_Technician only
  router.post('/:id/notes', requireRole('Lab_Technician'), (req, res) => {
    const { id } = req.params;
    const { note } = req.body as { note?: string };
    const technicianId = req.user!.id;
    const now = new Date().toISOString();

    // Validate note is provided
    if (!note) {
      res.status(400).json({ error: 'note is required' });
      return;
    }

    // Validate request exists
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // Validate request is In_Progress
    if (requestRow.status !== 'In_Progress') {
      res.status(409).json({ error: 'Request must be in In_Progress status to add notes', current_status: requestRow.status });
      return;
    }

    // Parse existing notes and append new note
    const existingNotes: Array<{ text: string; author_id: string; created_at: string }> =
      JSON.parse(requestRow.notes || '[]');
    existingNotes.push({ text: note, author_id: technicianId, created_at: now });

    db.prepare('UPDATE requests SET notes = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(existingNotes), now, id);

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json(updated);
  });

  // POST /requests — Requestor only
  router.post('/', requireRole('Requestor'), (req, res) => {
    const { method_id, material_description, purpose_description, desired_completion } = req.body as {
      method_id?: string;
      material_description?: string;
      purpose_description?: string;
      desired_completion?: string;
    };

    // Validate required fields
    const errors: Record<string, string> = {};
    if (!method_id) errors.method_id = 'method_id is required';
    if (!material_description) errors.material_description = 'material_description is required';
    if (!purpose_description) errors.purpose_description = 'purpose_description is required';
    if (!desired_completion) errors.desired_completion = 'desired_completion is required';

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ errors });
      return;
    }

    // Check method exists and is active
    const method = db.prepare('SELECT * FROM methods WHERE id = ?').get(method_id) as any;
    if (!method || method.is_active === 0) {
      res.status(422).json({ error: 'The specified method does not exist or is inactive' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const requestorId = req.user!.id;

    db.prepare(
      `INSERT INTO requests
        (id, requestor_id, method_id, material_description, purpose_description,
         desired_completion, status, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Submitted', ?, ?)`
    ).run(id, requestorId, method_id, material_description, purpose_description, desired_completion, now, now);

    const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.status(201).json(created);
  });

  // POST /requests/:id/results — Lab_Technician only
  router.post('/:id/results', requireRole('Lab_Technician'), upload.single('file'), (req, res) => {
    const { id } = req.params;
    const technicianId = req.user!.id;
    const now = new Date().toISOString();

    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (requestRow.assigned_technician_id !== technicianId) {
      res.status(403).json({ error: 'Forbidden: request is not assigned to this technician' });
      return;
    }
    if (!req.file) {
      res.status(422).json({ error: 'At least one result file is required' });
      return;
    }

    const resultId = uuidv4();
    db.prepare(
      `INSERT INTO results (id, request_id, uploaded_by, file_key, file_name, mime_type, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      resultId,
      id,
      technicianId,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype || null,
      now
    );

    const transition = transitionStatus({
      db,
      requestId: id,
      actorId: technicianId,
      toStatus: 'Results_Ready',
      now,
    });
    if (!transition.ok) {
      if (transition.type === 'not_found') {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
      res.status(409).json({
        error: 'Illegal status transition',
        current_status: transition.currentStatus,
        allowed_transitions: transition.allowedTransitions,
      });
      return;
    }

    createNotification(
      db,
      requestRow.requestor_id,
      id,
      'results_ready',
      `Results for request ${id} are ready.`
    );
    notifyStatusChange(db, id, 'Results_Ready');

    const createdResult = db.prepare('SELECT * FROM results WHERE id = ?').get(resultId);
    res.status(201).json({ request: transition.request, result: createdResult });
  });

  // GET /requests/:id/results/:rid — download result file
  router.get('/:id/results/:rid', (req, res) => {
    const { id, rid } = req.params;
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (!canViewRequest(requestRow, req.user)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' });
      return;
    }

    const result = db
      .prepare('SELECT * FROM results WHERE id = ? AND request_id = ?')
      .get(rid, id) as any;
    if (!result) {
      res.status(404).json({ error: 'Result not found' });
      return;
    }

    const filePath = path.join(uploadDir, result.file_key);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Result file not found' });
      return;
    }
    res.download(filePath, result.file_name);
  });

  // POST /requests/:id/acknowledge — Requestor only
  router.post('/:id/acknowledge', requireRole('Requestor'), (req, res) => {
    const { id } = req.params;
    const actorId = req.user!.id;
    const now = new Date().toISOString();

    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (requestRow.requestor_id !== actorId) {
      res.status(403).json({ error: 'Forbidden: only owning Requestor can acknowledge' });
      return;
    }

    const transition = transitionStatus({
      db,
      requestId: id,
      actorId,
      toStatus: 'Closed',
      now,
    });
    if (!transition.ok) {
      if (transition.type === 'not_found') {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
      res.status(409).json({
        error: 'Illegal status transition',
        current_status: transition.currentStatus,
        allowed_transitions: transition.allowedTransitions,
      });
      return;
    }
    notifyStatusChange(db, id, 'Closed');
    res.json(transition.request);
  });

  // PUT /requests/:id — owning Requestor only while Submitted
  router.put('/:id', (req, res) => {
    const { id } = req.params;
    const actor = req.user!;
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (actor.role !== 'Requestor' || actor.id !== requestRow.requestor_id) {
      res.status(403).json({ error: 'Forbidden: only the owning Requestor can edit this request' });
      return;
    }
    if (requestRow.status !== 'Submitted') {
      res.status(403).json({ error: 'Forbidden: request can only be edited while status is Submitted' });
      return;
    }

    const { method_id, material_description, purpose_description, desired_completion } = req.body as {
      method_id?: string;
      material_description?: string;
      purpose_description?: string;
      desired_completion?: string;
    };

    if (method_id !== undefined) {
      const method = db.prepare('SELECT * FROM methods WHERE id = ?').get(method_id) as any;
      if (!method || method.is_active === 0) {
        res.status(422).json({ error: 'The specified method does not exist or is inactive' });
        return;
      }
    }

    const nextMethodId = method_id ?? requestRow.method_id;
    const nextMaterialDescription = material_description ?? requestRow.material_description;
    const nextPurposeDescription = purpose_description ?? requestRow.purpose_description;
    const nextDesiredCompletion = desired_completion ?? requestRow.desired_completion;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE requests
       SET method_id = ?, material_description = ?, purpose_description = ?, desired_completion = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextMethodId,
      nextMaterialDescription,
      nextPurposeDescription,
      nextDesiredCompletion,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json(updated);
  });

  return router;
}
