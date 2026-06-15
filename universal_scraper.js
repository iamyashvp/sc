const { Command } = require('commander');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { scrapeUrl } = require('./src/scraper_core');
const { getDomain, slugify, saveFile, saveJson } = require('./src/utils');
const { getSitemapsFromRobots, getUrlsFromSitemap, extractInternalLinks } = require('./src/crawler');

const program = new Command();

program
  .name('universal-scraper')
  .description('Adaptive Playwright Scraper for BMS, District, FB, IG, etc.')
  .version('1.0.0')
  .option('-u, --url <url>', 'Seed URL or domain to scrape')
  .option('-f, --file <path>', 'Path to a text file containing URLs')
  .option('-w, --workers <number>', 'Number of parallel workers', '3')
  .option('-c, --crawl', 'Enable recursive crawling within the domain', false)
  .option('-s, --sitemap', 'Parse robots.txt and sitemaps to discover URLs', false)
  .option('-o, --output <dir>', 'Output directory', 'scraped_data');

program.parse(process.argv);

const options = program.opts();
const OUTPUT_DIR = options.output;
const MAX_WORKERS = parseInt(options.workers);

async function main() {
  const queue = new Set();
  const visited = new Set();
  const domain = options.url ? getDomain(options.url) : null;

  // 1. Initialize Queue
  if (options.file) {
    if (fs.existsSync(options.file)) {
      const content = fs.readFileSync(options.file, 'utf-8');
      content.split('\n').map(l => l.trim()).filter(l => l).forEach(url => queue.add(url));
      console.log(`Loaded ${queue.size} URLs from file: ${options.file}`);
    } else {
      console.error(`File not found: ${options.file}`);
      process.exit(1);
    }
  }

  if (options.url) {
    queue.add(options.url);
    
    if (options.sitemap) {
      console.log(`[Discovery] Fetching sitemaps for ${domain}...`);
      const sitemaps = await getSitemapsFromRobots(domain);
      for (const sm of sitemaps) {
        console.log(`  -> Parsing sitemap: ${sm}`);
        const urls = await getUrlsFromSitemap(sm);
        urls.forEach(u => queue.add(u));
      }
      console.log(`[Discovery] Total URLs in queue after sitemap: ${queue.size}`);
    }
  }

  if (queue.size === 0) {
    console.error('No URLs to process. Use --url or --file.');
    program.help();
    return;
  }

  // 2. Start Browser
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu'
    ]
  });

  const workerPool = [];
  const activeQueue = Array.from(queue);
  const queuedSet = new Set(activeQueue); // To track what's already in the queue or processed
  let currentIndex = 0;

  async function runWorker(workerId) {
    // Stagger start to avoid resource spikes
    await new Promise(r => setTimeout(r, workerId * 1000));

    while (currentIndex < activeQueue.length) {
      const url = activeQueue[currentIndex++];
      if (!url || visited.has(url)) continue;
      visited.add(url);

      const domainName = getDomain(url);
      const slug = slugify(url);

      try {
        const result = await scrapeUrl(browser, url);

        // Save Data
        const baseDir = path.join(OUTPUT_DIR, domainName);
        saveFile(path.join(baseDir, 'raw', `${slug}.html`), result.html);
        saveJson(path.join(baseDir, 'analyzed', `${slug}_data.json`), result.analysis);

        console.log(`  [Worker ${workerId}] [Done] ${url} -> ${slug} (${result.analysis.type})`);

        // Recursive Crawl
        if (options.crawl && result.analysis.links) {
          for (const link of result.analysis.links) {
            if (!visited.has(link) && !queuedSet.has(link)) {
              activeQueue.push(link);
              queuedSet.add(link);
            }
          }
        }

      } catch (e) {
        console.error(`  [Worker ${workerId}] [Failed] ${url}: ${e.message}`);
        // Optional: Add to a failed list for retry or just ignore
      }
    }
  }

  console.log(`\nStarting ${MAX_WORKERS} workers for ${activeQueue.length} initial URLs...\n`);
  
  for (let i = 0; i < MAX_WORKERS; i++) {
    workerPool.push(runWorker(i));
  }

  await Promise.all(workerPool);
  
  await browser.close();
  console.log(`\nScraping complete. Results saved to ${OUTPUT_DIR}`);
}

main().catch(console.error);
