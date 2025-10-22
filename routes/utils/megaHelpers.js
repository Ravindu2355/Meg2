const { Storage, File } = require('megajs');

/**
 * Resolve any MEGA URL: file/folder/nested file.
 * Returns an array of plain file objects:
 * { id: [folderId?, fileId?] or string, key: base64 string, name, size, fullPath }
 */
async function collectMegaFiles(url) {
  // Try File.fromURL for direct file links first (some work)
  try {
    const direct = File.fromURL(url);
    await direct.loadAttributes();
    // If direct has size, it's a file
    if (direct.size) {
      const keyBuf = direct.key || direct._key || null;
      const key = keyBuf ? keyBuf.toString('base64') : null;
      return [{
        id: [direct.publicId || null, direct.downloadId || direct.nodeId || null],
        key,
        name: direct.name,
        size: direct.size,
        fullPath: direct.name
      }];
    }
  } catch (e) {
    // ignore - fallback to Storage
  }

  // Use Storage.importFile for folders and nested file URLs
  const storage = await Storage.importFile(url);
  await new Promise(resolve => storage.on('ready', resolve));

  const out = [];

  function recurse(node, parentPath = '') {
    const curPath = parentPath ? `${parentPath}/${node.name}` : node.name || '';
    if (node.directory) {
      (node.children || []).forEach(child => recurse(child, curPath));
    } else {
      // node.key or node._key is a Buffer; convert to base64 without re-wrapping
      const keyBuf = node.key || node._key || null;
      const key = keyBuf ? keyBuf.toString('base64') : null;
      out.push({
        id: [storage.publicId || null, node.downloadId || node.nodeId || null],
        key,
        name: node.name,
        size: node.size,
        fullPath: curPath
      });
    }
  }

  Object.values(storage.files || {}).forEach(node => {
    // Some nodes in storage.files map are already top-level entries; recurse those
    recurse(node, '');
  });

  return out;
}

module.exports = { collectMegaFiles };
