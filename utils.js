const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * Converts a URL into a safe filename slug.
 * @param {string} urlStr 
 * @returns {string}
 */
function slugify(urlStr) {
  try {
    const url = new URL(urlStr);
    let name = url.pathname + url.search;
    name = name.replace(/[^a-z0-9]/gi, '_').replace(/^_+|_+$/g, '');
    return name || 'index';
  } catch (e) {
    return urlStr.replace(/[^a-z0-9]/gi, '_');
  }
}

/**
 * Extracts the domain from a URL.
 * @param {string} urlStr 
 * @returns {string}
 */
function getDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace('www.', '');
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Ensures a directory exists.
 * @param {string} dirPath 
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Saves content to a file.
 * @param {string} filePath 
 * @param {string} content 
 */
function saveFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Saves data as JSON to a file.
 * @param {string} filePath 
 * @param {Object} data 
 */
function saveJson(filePath, data) {
  saveFile(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  slugify,
  getDomain,
  ensureDir,
  saveFile,
  saveJson
};
