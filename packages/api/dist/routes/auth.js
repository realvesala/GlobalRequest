"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/me', (req, res) => {
    const { id, email, display_name, role, region } = req.user;
    res.json({ id, email, display_name, role, region });
});
exports.default = router;
