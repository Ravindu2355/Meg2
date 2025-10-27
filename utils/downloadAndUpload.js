const fs = require('fs');
const path = require('path');
const { File } = require('megajs');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/app/downloads';
const MAX_DOWNLOAD_BYTES = Number(process.env.MAX_DOWNLOAD_BYTES || 50 * 1024 * 1024);
const VIDEO_THRESHOLD_BYTES = Number(process.env.VIDEO_THRESHOLD_BYTES || 20 * 1024 * 1024);
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.warn('BOT_TOKEN or CHANNEL_ID not set — uploads will fail until env vars are configured');
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function downloadFileFromNode(fileObj) {
  // fileObj: { id: [..], key: base64, name, size, fullPath }
  // Ensure id and key exist
  if (!fileObj || !fileObj.id || !fileObj.key) throw new Error('invalid fileObj');

  // If key is JSON buffer object (with data), handle that before sending to this function.
  const fileId = Array.isArray(fileObj.id) ? fileObj.id[1] : fileObj.id;
  if (!fileId) throw new Error('missing file id');

  // Create a download URL and use megajs File.fromURL to handle
  const megaUrl = fileObj.link || `https://mega.nz/file/${fileId}#${fileObj.key}`;
  const file = File.fromURL(megaUrl);
  await file.loadAttributes();

  if ((file.size || 0) > MAX_DOWNLOAD_BYTES) {
    throw new Error('file_too_large:' + (file.size||0));
  }

  const filename = fileObj.name || file.name || `file_${Date.now()}`;
  const outPath = path.join(DOWNLOAD_DIR, filename);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const writeStream = fs.createWriteStream(outPath);
  const readStream = file.download();

  await new Promise((resolve, reject) => {
    readStream.pipe(writeStream);
    readStream.on('end', resolve);
    readStream.on('error', reject);
    writeStream.on('error', reject);
  });

  return { path: outPath, filename, size: fs.statSync(outPath).size };
}

// remux to mp4 (copy streams) for better streaming support
async function remuxToMp4IfNeeded(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  if (filePath.toLowerCase().endsWith('.mp4')) return filePath;

  const outPath = filePath.replace(path.extname(filePath), '.mp4');
  // if already exists, return it
  if (fs.existsSync(outPath)) return outPath;

  // ffmpeg -y -i input -c copy -movflags +faststart out
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y','-i', filePath, '-c', 'copy', '-movflags', '+faststart', outPath], { stdio: 'ignore' });
    ff.on('close', code => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size>0) resolve();
      else reject(new Error('ffmpeg failed code '+code));
    });
  });

  return outPath;
}

async function uploadToTelegramFile(filepath, filename, asVideo=false) {
  // uses Telegram Bot API sendDocument or sendVideo
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${asVideo ? 'sendVideo' : 'sendDocument'}`;

  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  // caption optional
  form.append('caption', `Uploaded: ${filename}`);
  form.append(asVideo ? 'video' : 'document', fs.createReadStream(filepath), { filename });

  // For video, we may also send supports_streaming and duration is optional
  if (asVideo) form.append('supports_streaming', 'true');

  const headers = form.getHeaders();
  const resp = await axios.post(url, form, { headers, maxBodyLength: Infinity, maxContentLength: Infinity });
  return resp.data;
}

async function processSingleFile(fileObj) {
  const info = { fileObj };
  try {
    console.log('→ Starting download for', fileObj.fullPath || fileObj.name);
    const dl = await downloadFileFromNode(fileObj);
    console.log('Downloaded to', dl.path, 'size', dl.size);

    // If filesize > MAX_DOWNLOAD_BYTES we shouldn't be here; but check
    if (dl.size > MAX_DOWNLOAD_BYTES) {
      console.log('Skipping large file:', dl.path, dl.size);
      fs.unlinkSync(dl.path);
      return { skipped: true, reason: 'too_large' };
    }

    // If smaller than threshold, try to remux for streaming and send as video
    let uploadPath = dl.path;
    let asVideo = false;
    if (dl.size <= VIDEO_THRESHOLD_BYTES) {
      try {
        const maybeMp4 = await remuxToMp4IfNeeded(dl.path);
        // if remux produced a .mp4 and exists, use it
        if (maybeMp4 && fs.existsSync(maybeMp4)) {
          uploadPath = maybeMp4;
        }
        asVideo = true;
      } catch (e) {
        console.warn('Remux failed, will send original as document', e.message);
        asVideo = false;
      }
    } else {
      asVideo = false;
    }

    console.log('Uploading to Telegram as', asVideo ? 'video' : 'document');
    await uploadToTelegramFile(uploadPath, dl.filename, asVideo);

    // cleanup
    try { if (fs.existsSync(dl.path)) fs.unlinkSync(dl.path); } catch(e){/*ignore*/}
    // if remux created a different path, remove that too
    if (uploadPath !== dl.path && fs.existsSync(uploadPath)) {
      try { fs.unlinkSync(uploadPath); } catch(e){}
    }

    console.log('Uploaded & cleaned up:', dl.filename);
    return { success: true };
  } catch (err) {
    console.error('processSingleFile error', err && err.message ? err.message : err);
    return { success: false, error: String(err) };
  }
}

module.exports = { downloadFileFromNode, remuxToMp4IfNeeded, processSingleFile, sleep };
