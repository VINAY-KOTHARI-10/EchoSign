// src/routes/v1/peopleRoutes.js
'use strict';
const { Router } = require('express');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const { listPeople, getPerson, updatePerson, createPerson } = require('../../controllers/peopleController');

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('people.view'), listPeople);
router.post('/', requirePermission('people.edit'), createPerson);
router.get('/:id', requirePermission('people.view'), getPerson);
router.patch('/:id', requirePermission('people.edit'), updatePerson);
module.exports = router;
