// src/routes/v1/languageRoutes.js
'use strict';
const { Router } = require('express');
const { prisma } = require('../../config/postgres');
const { authenticate, authorize } = require('../../middleware/authMiddleware');
const { activeLanguages, invalidateLanguages } = require('../../config/languages');

const router = Router();

// Public: get all supported languages
router.get('/', async (req, res, next) => {
  try {
    // The languages in effect everywhere in the app (built-in list adjusted by the admin's additions and switch-offs).
    const languages = (await activeLanguages(prisma)).map((l) => ({ ...l, active: true }));
    res.json({ success: true, data: { languages } });
  } catch (err) { next(err); }
});

// Admin only: add new language
router.post('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const flag = String(req.body.flag || '').trim();
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code)) return res.status(400).json({ success: false, error: 'Use a language code such as "tr" or "pt-br".' });
    if (name.length < 2 || name.length > 40) return res.status(400).json({ success: false, error: 'Give the language a name of 2 to 40 characters.' });
    const language = await prisma.language.create({ data: { code, name, flag } });
    invalidateLanguages();
    res.status(201).json({ success: true, data: { language } });
  } catch (err) { next(err); }
});

module.exports = router;
