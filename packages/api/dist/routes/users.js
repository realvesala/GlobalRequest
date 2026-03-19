"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Public endpoint — lists demo users for the role-switcher UI
router.get('/', (_req, res) => {
    const users = db_1.default
        .prepare('SELECT id, display_name, role, region FROM users ORDER BY created_at ASC')
        .all();
    res.json(users);
});
exports.default = router;
