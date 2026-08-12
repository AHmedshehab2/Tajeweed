const router = require('express').Router();
const scheduleService = require('../services/schedule.service');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

// GET /api/schedule?weekStart=YYYY-MM-DD
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await scheduleService.getSchedule(req.query.weekStart);
  res.json(result);
}));

// GET /api/schedule/templates — all templates
router.get('/templates', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const templates = await scheduleService.getTemplates();
  res.json(templates);
}));

// PUT /api/schedule/templates — bulk upsert
router.put('/templates', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const templates = await scheduleService.updateTemplates(req.body.entries);
  res.json(templates);
}));

// GET /api/schedule/exceptions?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/exceptions', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const exceptions = await scheduleService.getExceptions(req.query.from, req.query.to);
  res.json(exceptions);
}));

// POST /api/schedule/exceptions
router.post('/exceptions', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const exception = await scheduleService.createException(req.body);
  res.status(201).json(exception);
}));

// PATCH /api/schedule/exceptions/:id
router.patch('/exceptions/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const exception = await scheduleService.updateException(id, req.body);
  res.json(exception);
}));

// DELETE /api/schedule/exceptions/:id
router.delete('/exceptions/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await scheduleService.deleteException(id);
  res.status(204).end();
}));

module.exports = router;
