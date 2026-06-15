const https = require('https');
const xml2js = require('xml2js');
const { URL } = require('url');

/**
 * Fetches content from a URL using HTTPS.
 * @param {string} url 
 * @returns {Promise<string>}
 */
function fetchContent(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Parses robots.txt to find sitemap URLs.
 * @param {string} domain 
 * @returns {Promise<string[]>}
 */
async function getSitemapsFromRobots(domain) {
  const robotsUrl = `https://${domain}/robots.txt`;
  try {
    const content = await fetchContent(robotsUrl);
    const lines = content.split('\n');
    const sitemaps = lines
      .filter(line => line.toLowerCase().startsWith('sitemap:'))
      .map(line => line.split(':').slice(1).join(':').trim());
    return sitemaps;
  } catch (e) {
    console.warn(`Could not fetch robots.txt for ${domain}`);
    return [];
  }
}

/**
 * Recursively fetches URLs from a sitemap (including nested sitemaps).
 * @param {string} sitemapUrl 
 * @returns {Promise<string[]>}
 */
async function getUrlsFromSitemap(sitemapUrl) {
  try {
    const content = await fetchContent(sitemapUrl);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(content);
    
    let urls = [];
    
    // Check if it's a sitemap index
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      for (const s of result.sitemapindex.sitemap) {
        if (s.loc && s.loc[0]) {
          const nestedUrls = await getUrlsFromSitemap(s.loc[0]);
          urls = urls.concat(nestedUrls);
        }
      }
    } 
    // Check if it's a standard sitemap
    else if (result.urlset && result.urlset.url) {
      urls = result.urlset.url.map(u => u.loc[0]);
    }
    
    return urls;
  } catch (e) {
    console.warn(`Could not parse sitemap ${sitemapUrl}: ${e.message}`);
    return [];
  }
}

/**
 * Extracts internal links from a Playwright page.
 * @param {import('playwright').Page} page 
 * @param {string} domain 
 * @returns {Promise<string[]>}
 */
async function extractInternalLinks(page, domain) {
  return await page.evaluate((dom) => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(href => {
        try {
          const url = new URL(href);
          return url.hostname.includes(dom);
        } catch (e) {
          return false;
        }
      });
  }, domain);
}

module.exports = {
  getSitemapsFromRobots,
  getUrlsFromSitemap,
  extractInternalLinks
};
