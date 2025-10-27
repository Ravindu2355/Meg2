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
      console.log(`searching dir- ${node.name}`);
      const children = node.children || [];
      console.log(`Found ${children.length}`);
      for (let child of children) {
        await traverse(child, curPath);
      }
    } else {
      console.log(`working on file- ${node.name}`);
      const key = node.key ? node.key.toString('base64') : null;
      var nlink;
      try{
        nlink = typeof node.link === "function" ? node.link() : null
      } catch (nlinkEr){
        console.log(`File link getting failed!- ${nlinkEr}`);
      }
      try{
        nlink = node.link();
      }catch(nlinkEr2){
        console.log(`File link2 getting failed!- ${nlinkEr2}`);
      }
      out.push({
        id: [node.publicId || null, node.downloadId || node.nodeId || null],
        key,
        name: node.name,
        size: node.size,
        fullPath: curPath,
        link: nlink
      });
    }
  }

  // start traversal
  const root = File.fromURL(url);
  await traverse(root, '');

  return out;
}

module.exports = { collectMegaFiles };
