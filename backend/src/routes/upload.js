const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const uploadService = require('../services/upload.service');
const { uploadFields, validateUpload, timeoutHandler } = require('../middleware/upload.middleware');

router.post(
  '/',
  requireAuth,
  requireAdmin,
  timeoutHandler(600000),
  uploadFields,
  validateUpload,
  asyncHandler(async (req, res) => {
    const result = await uploadService.handleUpload({
      area: req.body.area,
      targetId: req.body.targetId,
      title: req.body.title,
      type: req.body.type,
      files: req.files,
    });
    res.status(201).json(result);
  })
);

router.delete(
  '/recordings/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await uploadService.removeRecording(req.params.id);
    res.json({ ok: true });
  })
);

router.delete(
  '/resources/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await uploadService.removeResource(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
