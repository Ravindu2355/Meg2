require('dotenv').config?.();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const megaRouter = require('./routes/mega');
const { startWorker } = require('./worker');

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(morgan('tiny'));

// Create downloads dir
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/app/downloads';
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

app.get('/', (req, res) => res.send('Hello World — MEGA extractor uploader running'));
app.use('/', megaRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  // start background worker (in same process)
  startWorker();
});
