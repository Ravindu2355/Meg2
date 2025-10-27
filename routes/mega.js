const express = require('express');
const router = express.Router();
const { enqueueMegaUrl, listQueue } = require('../worker');

// POST /mega  { "url": "https://mega.nz/..." }
router.post('/mega', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'missing url in body' });

    const taskId = enqueueMegaUrl(url);
    return res.json({ ok: true, taskId });
  } catch (err) {
    console.error('POST /mega error', err);
    return res.status(500).json({ error: 'failed to enqueue', detail: String(err) });
  }
});

// optional: inspect queue
router.get('/queue', (req, res) => {
  res.json({ queue: listQueue() });
});

router.get('/s', (req, res) => {
   url="https://mega.nz/folder/Cs5yWK7S#suskw3fqZRSx54e4HogsbQ";
   const taskId = enqueueMegaUrl(url);
   return res.json({ ok: true, taskId });
});

module.exports = router;
