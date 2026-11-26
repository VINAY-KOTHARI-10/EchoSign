// src/routes/v1/userRoutes.js
'use strict';
const { Router } = require('express');
const { getMe, updateProfile, getLeaderboard } = require('../../controllers/userController');
const { authenticate } = require('../../middleware/authMiddleware');
const { permissionsFor, matrix, classMatrix, effectiveRole } = require('../../config/permissions');

const router = Router();
router.use(authenticate);
router.get('/me', getMe);
router.patch('/profile', updateProfile);
router.get('/leaderboard', getLeaderboard);
// What this account may do, plus the full role table for the "Roles & permissions" page.
router.get('/permissions', (req, res) => {
  res.json({ success: true, data: { role: effectiveRole(req.user.role), permissions: permissionsFor(req.user.role), matrix: matrix(), classMatrix: classMatrix() } });
});
module.exports = router;
