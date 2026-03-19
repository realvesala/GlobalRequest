"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestsRouter = createRequestsRouter;
const express_1 = require("express");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const requireRole_1 = require("../middleware/requireRole");
const notifications_1 = require("../helpers/notifications");
const transitionStatus_1 = require("../helpers/transitionStatus");
const statusNotifications_1 = require("../helpers/statusNotifications");
function createRequestsRouter(db) {
    const router = (0, express_1.Router)();
    const uploadDir = path_1.default.resolve(__dirname, '../../uploads');
    if (!fs_1.default.existsSync(uploadDir)) {
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
    }
    const upload = (0, multer_1.default)({
        storage: multer_1.default.diskStorage({
            destination: (_req, _file, cb) => cb(null, uploadDir),
            filename: (_req, file, cb) => {
                const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                cb(null, `${Date.now()}-${(0, uuid_1.v4)()}-${safeOriginal}`);
            },
        }),
    });
    function canViewRequest(requestRow, user) {
        if (!user)
            return false;
        if (user.role === 'Admin')
            return true;
        if (user.role === 'Requestor')
            return requestRow.requestor_id === user.id;
        if (user.role === 'Lab_Technician')
            return requestRow.assigned_technician_id === user.id;
        if (user.role === 'Lab_Manager') {
            // This PoC does not model explicit manager->lab ownership, so we scope by region:
            // - assigned requests whose lab is in manager's region
            // - unassigned requests where the requestor is in manager's region
            const regionScoped = db.prepare(`SELECT 1
         FROM requests r
         LEFT JOIN labs l ON l.id = r.assigned_lab_id
         LEFT JOIN users u ON u.id = r.requestor_id
         WHERE r.id = ?
           AND (
             (r.assigned_lab_id IS NOT NULL AND l.region = ?)
             OR
             (r.assigned_lab_id IS NULL AND u.region = ?)
           )
         LIMIT 1`).get(requestRow.id, user.region ?? '', user.region ?? '');
            return Boolean(regionScoped);
        }
        return false;
    }
    // GET /requests — role-aware request list
    router.get('/', (req, res) => {
        const user = req.user;
        let rows = [];
        if (user.role === 'Admin') {
            rows = db.prepare(`SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         ORDER BY r.submitted_at DESC`).all();
        }
        else if (user.role === 'Requestor') {
            rows = db.prepare(`SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         WHERE r.requestor_id = ?
         ORDER BY r.submitted_at DESC`).all(user.id);
        }
        else if (user.role === 'Lab_Technician') {
            rows = db.prepare(`SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         WHERE r.assigned_technician_id = ?
         ORDER BY r.submitted_at DESC`).all(user.id);
        }
        else if (user.role === 'Lab_Manager') {
            rows = db.prepare(`SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region, m.name AS method_name, l.region AS assigned_lab_region
         FROM requests r
         JOIN users u ON u.id = r.requestor_id
         JOIN methods m ON m.id = r.method_id
         LEFT JOIN labs l ON l.id = r.assigned_lab_id
         WHERE (
           (r.assigned_lab_id IS NOT NULL AND l.region = ?)
           OR
           (r.assigned_lab_id IS NULL AND u.region = ?)
         )
         ORDER BY r.submitted_at DESC`).all(user.region ?? '', user.region ?? '');
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
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        if (!requestRow) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        if (!canViewRequest(requestRow, req.user)) {
            res.status(403).json({ error: 'Forbidden: insufficient role' });
            return;
        }
        const history = db.prepare(`SELECT h.*, u.display_name AS changed_by_name
       FROM request_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.request_id = ?
       ORDER BY h.changed_at ASC`).all(id);
        res.json({ history });
    });
    // GET /requests/:id — request detail including status history
    router.get('/:id', (req, res) => {
        const { id } = req.params;
        const requestRow = db.prepare(`SELECT r.*, u.display_name AS requestor_name, u.region AS requestor_region,
              m.name AS method_name, l.name AS assigned_lab_name,
              t.display_name AS assigned_technician_name
       FROM requests r
       JOIN users u ON u.id = r.requestor_id
       JOIN methods m ON m.id = r.method_id
       LEFT JOIN labs l ON l.id = r.assigned_lab_id
       LEFT JOIN users t ON t.id = r.assigned_technician_id
       WHERE r.id = ?`).get(id);
        if (!requestRow) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        if (!canViewRequest(requestRow, req.user)) {
            res.status(403).json({ error: 'Forbidden: insufficient role' });
            return;
        }
        const history = db.prepare(`SELECT h.*, u.display_name AS changed_by_name
       FROM request_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.request_id = ?
       ORDER BY h.changed_at ASC`).all(id);
        const results = db.prepare(`SELECT id, request_id, uploaded_by, file_key, file_name, mime_type, uploaded_at
       FROM results
       WHERE request_id = ?
       ORDER BY uploaded_at DESC`).all(id);
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
    router.get('/:id/candidates', (0, requireRole_1.requireRole)('Lab_Manager', 'Admin'), (req, res) => {
        const { id } = req.params;
        // Look up the request
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        if (!requestRow) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        // Get the requestor's region
        const requestor = db.prepare('SELECT region FROM users WHERE id = ?').get(requestRow.requestor_id);
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
    `).all(requestRow.method_id);
        // Rank: same region first, then ascending open_request_count
        candidates.sort((a, b) => {
            const aLocal = a.region === requestorRegion ? 0 : 1;
            const bLocal = b.region === requestorRegion ? 0 : 1;
            if (aLocal !== bLocal)
                return aLocal - bLocal;
            return a.open_request_count - b.open_request_count;
        });
        res.json({ candidates });
    });
    // POST /requests/:id/assign — Lab_Manager only
    router.post('/:id/assign', (0, requireRole_1.requireRole)('Lab_Manager'), (req, res) => {
        const { id } = req.params;
        const { lab_id } = req.body;
        const managerId = req.user.id;
        const now = new Date().toISOString();
        // Validate request exists
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        if (!requestRow) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        // Determine if the provided lab is a valid candidate
        let validLab = null;
        if (lab_id) {
            validLab = db.prepare(`SELECT l.* FROM labs l
         JOIN lab_methods lm ON lm.lab_id = l.id
         WHERE l.id = ? AND l.is_active = 1 AND lm.method_id = ?`).get(lab_id, requestRow.method_id);
        }
        if (!validLab) {
            const transition = (0, transitionStatus_1.transitionStatus)({
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
            (0, notifications_1.createNotification)(db, requestRow.requestor_id, id, 'request_unroutable', `Your request (${id}) could not be routed to any lab — no lab supports the requested method.`);
            (0, statusNotifications_1.notifyStatusChange)(db, id, 'Unroutable');
            res.json(transition.request);
            return;
        }
        const transition = (0, transitionStatus_1.transitionStatus)({
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
        (0, statusNotifications_1.notifyStatusChange)(db, id, 'Assigned');
        res.json(transition.request);
    });
    // POST /requests/:id/override-route — Lab_Manager only
    router.post('/:id/override-route', (0, requireRole_1.requireRole)('Lab_Manager'), (req, res) => {
        const { id } = req.params;
        const { lab_id, reason } = req.body;
        const managerId = req.user.id;
        const now = new Date().toISOString();
        // Validate request exists
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
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
        const lab = db.prepare('SELECT * FROM labs WHERE id = ? AND is_active = 1').get(lab_id);
        if (!lab) {
            res.status(422).json({ error: 'Lab not found or is inactive' });
            return;
        }
        // Determine if we need a status transition
        const needsStatusTransition = requestRow.status === 'Submitted';
        if (needsStatusTransition) {
            const transition = (0, transitionStatus_1.transitionStatus)({
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
            (0, statusNotifications_1.notifyStatusChange)(db, id, 'Assigned');
            res.json(transition.request);
            return;
        }
        else {
            // Already Assigned or other status — just update lab and override fields
            db.prepare(`UPDATE requests SET assigned_lab_id = ?, routing_override_reason = ?, routing_override_by = ?, updated_at = ? WHERE id = ?`).run(lab_id, reason, managerId, now, id);
        }
        const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        res.json(updated);
    });
    // POST /requests/:id/assign-technician — Lab_Manager only
    router.post('/:id/assign-technician', (0, requireRole_1.requireRole)('Lab_Manager'), (req, res) => {
        const { id } = req.params;
        const { technician_id } = req.body;
        const managerId = req.user.id;
        const now = new Date().toISOString();
        // Validate request exists
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        if (!requestRow) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        // Validate technician exists and has Lab_Technician role
        if (!technician_id) {
            res.status(400).json({ error: 'technician_id is required' });
            return;
        }
        const technician = db.prepare('SELECT * FROM users WHERE id = ?').get(technician_id);
        if (!technician || technician.role !== 'Lab_Technician') {
            res.status(422).json({ error: 'Technician not found or does not have Lab_Technician role' });
            return;
        }
        const transition = (0, transitionStatus_1.transitionStatus)({
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
        (0, statusNotifications_1.notifyStatusChange)(db, id, 'In_Progress');
        res.json(transition.request);
    });
    // POST /requests/:id/reassign-technician — Lab_Manager only
    router.post('/:id/reassign-technician', (0, requireRole_1.requireRole)('Lab_Manager'), (req, res) => {
        const { id } = req.params;
        const { technician_id } = req.body;
        const now = new Date().toISOString();
        // Validate request exists and is In_Progress
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
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
        const technician = db.prepare('SELECT * FROM users WHERE id = ?').get(technician_id);
        if (!technician || technician.role !== 'Lab_Technician') {
            res.status(422).json({ error: 'Technician not found or does not have Lab_Technician role' });
            return;
        }
        // Update technician without changing status
        db.prepare(`UPDATE requests SET assigned_technician_id = ?, updated_at = ? WHERE id = ?`).run(technician_id, now, id);
        const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        res.json(updated);
    });
    // POST /requests/:id/notes — Lab_Technician only
    router.post('/:id/notes', (0, requireRole_1.requireRole)('Lab_Technician'), (req, res) => {
        const { id } = req.params;
        const { note } = req.body;
        const technicianId = req.user.id;
        const now = new Date().toISOString();
        // Validate note is provided
        if (!note) {
            res.status(400).json({ error: 'note is required' });
            return;
        }
        // Validate request exists
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
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
        const existingNotes = JSON.parse(requestRow.notes || '[]');
        existingNotes.push({ text: note, author_id: technicianId, created_at: now });
        db.prepare('UPDATE requests SET notes = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(existingNotes), now, id);
        const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        res.json(updated);
    });
    // POST /requests — Requestor only
    router.post('/', (0, requireRole_1.requireRole)('Requestor'), (req, res) => {
        const { method_id, material_description, purpose_description, desired_completion } = req.body;
        // Validate required fields
        const errors = {};
        if (!method_id)
            errors.method_id = 'method_id is required';
        if (!material_description)
            errors.material_description = 'material_description is required';
        if (!purpose_description)
            errors.purpose_description = 'purpose_description is required';
        if (!desired_completion)
            errors.desired_completion = 'desired_completion is required';
        if (Object.keys(errors).length > 0) {
            res.status(400).json({ errors });
            return;
        }
        // Check method exists and is active
        const method = db.prepare('SELECT * FROM methods WHERE id = ?').get(method_id);
        if (!method || method.is_active === 0) {
            res.status(422).json({ error: 'The specified method does not exist or is inactive' });
            return;
        }
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const requestorId = req.user.id;
        db.prepare(`INSERT INTO requests
        (id, requestor_id, method_id, material_description, purpose_description,
         desired_completion, status, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Submitted', ?, ?)`).run(id, requestorId, method_id, material_description, purpose_description, desired_completion, now, now);
        const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        res.status(201).json(created);
    });
    // POST /requests/:id/results — Lab_Technician only
    router.post('/:id/results', (0, requireRole_1.requireRole)('Lab_Technician'), upload.single('file'), (req, res) => {
        const { id } = req.params;
        const technicianId = req.user.id;
        const now = new Date().toISOString();
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
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
        const resultId = (0, uuid_1.v4)();
        db.prepare(`INSERT INTO results (id, request_id, uploaded_by, file_key, file_name, mime_type, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(resultId, id, technicianId, req.file.filename, req.file.originalname, req.file.mimetype || null, now);
        const transition = (0, transitionStatus_1.transitionStatus)({
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
        (0, notifications_1.createNotification)(db, requestRow.requestor_id, id, 'results_ready', `Results for request ${id} are ready.`);
        (0, statusNotifications_1.notifyStatusChange)(db, id, 'Results_Ready');
        const createdResult = db.prepare('SELECT * FROM results WHERE id = ?').get(resultId);
        res.status(201).json({ request: transition.request, result: createdResult });
    });
    // GET /requests/:id/results/:rid — download result file
    router.get('/:id/results/:rid', (req, res) => {
        const { id, rid } = req.params;
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
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
            .get(rid, id);
        if (!result) {
            res.status(404).json({ error: 'Result not found' });
            return;
        }
        const filePath = path_1.default.join(uploadDir, result.file_key);
        if (!fs_1.default.existsSync(filePath)) {
            res.status(404).json({ error: 'Result file not found' });
            return;
        }
        res.download(filePath, result.file_name);
    });
    // POST /requests/:id/acknowledge — Requestor only
    router.post('/:id/acknowledge', (0, requireRole_1.requireRole)('Requestor'), (req, res) => {
        const { id } = req.params;
        const actorId = req.user.id;
        const now = new Date().toISOString();
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        if (!requestRow) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        if (requestRow.requestor_id !== actorId) {
            res.status(403).json({ error: 'Forbidden: only owning Requestor can acknowledge' });
            return;
        }
        const transition = (0, transitionStatus_1.transitionStatus)({
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
        (0, statusNotifications_1.notifyStatusChange)(db, id, 'Closed');
        res.json(transition.request);
    });
    // PUT /requests/:id — owning Requestor only while Submitted
    router.put('/:id', (req, res) => {
        const { id } = req.params;
        const actor = req.user;
        const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
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
        const { method_id, material_description, purpose_description, desired_completion } = req.body;
        if (method_id !== undefined) {
            const method = db.prepare('SELECT * FROM methods WHERE id = ?').get(method_id);
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
        db.prepare(`UPDATE requests
       SET method_id = ?, material_description = ?, purpose_description = ?, desired_completion = ?, updated_at = ?
       WHERE id = ?`).run(nextMethodId, nextMaterialDescription, nextPurposeDescription, nextDesiredCompletion, now, id);
        const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        res.json(updated);
    });
    return router;
}
