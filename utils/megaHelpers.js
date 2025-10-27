const { File } = require('megajs');

/**
 * Collect all files from any MEGA URL (file or folder, nested)
 * Returns array of: { id: [folderId?, fileId?], key: base64, name, size, fullPath }
 */
async function collectMegaFiles(url) {
  const out = [];

  async function traverse(node, parentPath = '') {
    // Load node attributes if needed
    if (typeof node.loadAttributes === 'function') {
      try { await node.loadAttributes(); } catch {}
    }

    const curPath = parentPath ? `${parentPath}/${node.name}` : node.name || '';

    if (node.directory) {
      // traverse children
      const children = node.children || [];
      for (let child of children) {
        await traverse(child, curPath);
      }
    } else {
      const key = node.key ? node.key.toString('base64') : null;
      out.push({
        id: [node.publicId || null, node.downloadId || node.nodeId || null],
        key,
        name: node.name,
        size: node.size,
        fullPath: curPath,
        link: node.link && typeof node.link === "function" ? node.link() : null
      });
    }
  }

  // start traversal
  const root = File.fromURL(url);
  await traverse(root, '');

  return out;
}

module.exports = { collectMegaFiles };
