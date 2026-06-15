const { analyzePage } = require('./analyzer');

/**
 * Main scraping function for a single URL.
 */
async function scrapeUrl(browser, url, options = {}) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  
  // Anti-bot: mask webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Optimize: Block unnecessary resources
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (['font', 'media'].includes(type) || url.includes('google-analytics') || url.includes('facebook.net') || url.includes('doubleclick')) {
      route.abort();
    } else {
      route.continue();
    }
  });

  console.log(`[Scraping] ${url}`);
  
  try {
    // Switch to 'domcontentloaded' for faster/more reliable loads on tracker-heavy sites
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    
    // Wait for a bit to let important JS execute
    await page.waitForTimeout(5000);
    
    // Initial analysis to determine strategy
    let analysis = await analyzePage(page, url);
    
    // Adaptive Strategy: Change behavior based on analysis
    if (analysis.type === 'event' || analysis.type === 'venue') {
      console.log(`  -> Detected ${analysis.type}, applying deep scroll...`);
      await autoScroll(page);
      // Re-analyze after scroll to catch new content/images
      analysis = await analyzePage(page, url);
    } else {
      await page.waitForTimeout(2000);
    }

    const html = await page.content();
    
    await context.close();
    
    return {
      url,
      html,
      analysis
    };
  } catch (e) {
    console.error(`  [Error] Failed to scrape ${url}: ${e.message}`);
    await context.close();
    throw e;
  }
}

/**
 * Auto-scrolling to trigger lazy loading.
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight || totalHeight > 10000) { // Limit to 10k px
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

module.exports = {
  scrapeUrl
};
