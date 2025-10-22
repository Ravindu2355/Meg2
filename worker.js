const { collectMegaFiles } = require('./utils/megaHelpers');
const { processSingleFile, sleep } = require('./utils/downloadAndUpload');

const queue = []; // each entry: { id, url, files: [file objects], status }

function enqueueMegaUrl(url) {
  const task = { id: Date.now().toString(36), url, files: null, status: 'queued' };
  queue.push(task);
  console.log('Enqueued', task.id, url);
  return task.id;
}

function listQueue() {
  return queue.map(q => ({ id: q.id, url: q.url, status: q.status, files: (q.files ? q.files.length : 0) }));
}

async function startWorker() {
  console.log('Worker started — processing queue forever');
  while (true) {
    try {
      const task = queue.find(q => q.status === 'queued' || q.status === 'processing_files');
      if (!task) {
        await sleep(3000);
        continue;
      }

      // if queued, collect files first
      if (task.status === 'queued') {
        task.status = 'collecting';
        console.log('Collecting files for', task.id, task.url);
        try {
          const files = await collectMegaFiles(task.url);
          // filter out files > MAX_DOWNLOAD_BYTES here? we'll handle in processSingleFile
          task.files = files;
          task.status = 'processing_files';
          console.log(`Task ${task.id} discovered ${files.length} files`);
        } catch (err) {
          console.error('Error collecting files for', task.id, err);
          task.status = 'failed_collect';
          await sleep(2000);
          continue;
        }
      }

      // process files sequentially
      if (task.status === 'processing_files' && Array.isArray(task.files)) {
        while (task.files.length) {
          const next = task.files.shift();
          console.log(`Task ${task.id} — processing file: ${next.fullPath || next.name}`);
          const result = await processSingleFile(next);
          if (!result.success) {
            console.warn('File processing failed, skipping to next', result.error);
          }
          // short delay between uploads to avoid API limits
          await sleep(1500);
        }
        task.status = 'done';
        console.log('Task done', task.id);
      } else {
        await sleep(1000);
      }
    } catch (err) {
      console.error('Worker loop error', err);
      await sleep(2000);
    }
  }
}

module.exports = { enqueueMegaUrl, listQueue, startWorker };
