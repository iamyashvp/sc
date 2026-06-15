/**
 * Analyzes a Playwright page to extract structured data and categorize it.
 */
async function analyzePage(page, url) {
  const domain = new URL(url).hostname.replace('www.', '');
  
  const results = {
    url,
    domain,
    timestamp: new Date().toISOString(),
    type: 'generic',
    data: {},
    images: [],
    socialLinks: []
  };

  // 1. Extract all images (img tags and background images)
  results.images = await page.evaluate(() => {
    const images = new Set();
    
    // img tags
    document.querySelectorAll('img').forEach(img => {
      if (img.src) images.add(img.src);
    });
    
    // background images
    document.querySelectorAll('*').forEach(el => {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && bg.startsWith('url')) {
        const match = bg.match(/url\("?(.+?)"?\)/);
        if (match) images.add(match[1]);
      }
    });
    
    return Array.from(images);
  });

  // 2. Extract Social Links
  results.socialLinks = await page.evaluate(() => {
    const socials = [];
    const patterns = {
      facebook: /facebook\.com|fb\.me/,
      instagram: /instagram\.com/,
      twitter: /twitter\.com|x\.com/,
      linkedin: /linkedin\.com/,
      youtube: /youtube\.com|youtu\.be/
    };
    
    document.querySelectorAll('a[href]').forEach(a => {
      for (const [platform, regex] of Object.entries(patterns)) {
        if (regex.test(a.href)) {
          socials.push({ platform, url: a.href });
        }
      }
    });
    
    return socials;
  });

  // 3. Extract JSON-LD
  const jsonLd = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    return Array.from(scripts).map(s => {
      try {
        return JSON.parse(s.textContent);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  });
  results.data.jsonLd = jsonLd;

  // 4. Extract Internal Links for Crawling
  results.links = await page.evaluate((dom) => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(href => {
        try {
          const url = new URL(href);
          return url.hostname.includes(dom) && !href.includes('#') && !href.includes('mailto:') && !href.includes('tel:');
        } catch (e) {
          return false;
        }
      });
  }, domain);

  // 5. Categorize and Adaptive Extraction
  const hasEventList = jsonLd.some(j => j['@type'] === 'ItemList' || (j['@graph'] && j['@graph'].some(g => g['@type'] === 'ItemList')));
  const hasEvent = jsonLd.some(j => 
    j['@type'] === 'Event' || 
    (Array.isArray(j['@graph']) && j['@graph'].some(g => g['@type'] === 'Event'))
  );

  if (hasEventList) {
    results.type = 'event-list';
  } else if (hasEvent) {
    results.type = 'event';
  } else if (url.includes('/artist/') || url.includes('/person/') || url.includes('/organizer/')) {
    results.type = 'person';
  } else if (url.includes('/venue/') || url.includes('/cinema-') || jsonLd.some(j => j['@type'] === 'LocalBusiness' || j['@type'] === 'MovieTheater')) {
    results.type = 'venue';
  }

  // 5. Site-specific heuristics
  if (domain.includes('bookmyshow.com')) {
    results.data.bmsState = await page.evaluate(() => window.__INITIAL_STATE__);
  } else if (domain.includes('district.in')) {
    results.data.districtData = await page.evaluate(() => {
      // Look for specific District data if any
      return window.__NEXT_DATA__?.props?.pageProps;
    });
  }

  return results;
}

module.exports = {
  analyzePage
};
