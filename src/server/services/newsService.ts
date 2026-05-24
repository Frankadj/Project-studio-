import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
      ["image", "itemImage"],
    ],
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  timeout: 10000,
});

export interface NewsItem {
  id: string | number;
  headline: string;
  time: string;
  url: string;
  source: string;
  image: string;
}

let cachedNews: NewsItem[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (keep up-to-date every 5-10 mins)

const ogImageCache = new Map<string, string>();

async function extractOgImage(url: string): Promise<string> {
  if (!url) return "";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    clearTimeout(timeoutId);
    if (!res.ok) return "";
    const html = await res.text();
    const match = html.match(/<meta[^>]+property=["\x27]og:image["\x27][^>]+content=["\x27]([^"\x27]+)["\x27]/i) || 
                  html.match(/<meta[^>]+content=["\x27]([^"\x27]+)["\x27][^>]+property=["\x27]og:image["\x27]/i) ||
                  html.match(/<meta[^>]+name=["\x27]twitter:image["\x27][^>]+content=["\x27]([^"\x27]+)["\x27]/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

interface FeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string;
  categories?: string[];
  enclosure?: { url?: string };
  mediaContent?: Array<{ $: { url: string } }>;
  mediaThumbnail?: { $: { url: string } };
  itemImage?: string | { $: { url: string } } | { _?: string } | any;
  contentEncoded?: string;
  content?: string;
  description?: string;
}

interface NewsSource {
  name: string;
  url: string;
  fallbackUrl?: string;
  filter?: (item: FeedItem) => boolean;
}

const SOURCES: NewsSource[] = [
  {
    name: "News Ghana",
    url: "https://newsghana.com.gh/feed/",
    fallbackUrl: "https://www.modernghana.com/rss/news.xml",
    filter: (item: FeedItem) => {
      const cats = item.categories || [];
      return cats.some((c: string) =>
        c.toLowerCase().includes("business") ||
        c.toLowerCase().includes("economy") ||
        c.toLowerCase().includes("finance") ||
        c.toLowerCase().includes("commerce")
      );
    }
  },
  { name: "MyJoyOnline", url: "https://www.myjoyonline.com/business/feed/" },
  { 
    name: "3News", 
    url: "https://3news.com/feed/", 
    filter: (item: FeedItem) => {
      const cats = item.categories || [];
      return cats.some((c: string) => 
        c.toLowerCase().includes("business") || 
        c.toLowerCase().includes("economy") ||
        c.toLowerCase().includes("finance")
      );
    }
  },
  { name: "Graphic Online", url: "https://www.graphic.com.gh/business.html?format=feed&type=rss" },
  { name: "GBC Ghana Online", url: "https://www.gbcghanaonline.com/category/business/feed/" },
  { name: "B&FT Online", url: "https://thebftonline.com/feed/" },
];

export async function fetchAggregatedNews(force: boolean = false): Promise<NewsItem[]> {
  const now = Date.now();
  if (!force && now - lastFetchTime < CACHE_DURATION && cachedNews.length > 0) {
    return cachedNews;
  }

  const allItems: NewsItem[] = [];
  const oneDayAgo = new Date(now - 48 * 60 * 60 * 1000); // Increased to 48h to ensure more diversity

  const fetchPromises = SOURCES.map(async (sourceObj) => {
    // Clone source to prevent cross-request mutations
    const source = { ...sourceObj };
    try {
      let xmlText = "";

      const doFetch = async (targetUrl: string, timeoutMs: number = 10000): Promise<string> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`Status code ${response.status}`);
          }
          return await response.text();
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      try {
        xmlText = await doFetch(source.url, 12000);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (source.fallbackUrl) {
          console.warn(`Bypassed primary source ${source.name} (${reason}). Trying fallback source...`);
          try {
            xmlText = await doFetch(source.fallbackUrl, 10000);
            source.name = "B&FT Online";
          } catch {
            throw new Error(`Both ${source.name} and fallback failed. Original error: ${reason}`);
          }
        } else {
          throw err;
        }
      }

      // Check if response is HTML instead of XML
      const trimmedText = xmlText.trim();
      const isHtml = trimmedText.toLowerCase().startsWith("<!doctype") || trimmedText.toLowerCase().startsWith("<html") || trimmedText.toLowerCase().includes("<body");
      if (isHtml) {
        throw new Error("Response is HTML format, not valid RSS XML");
      }

      // Sanitize raw XML text to fix "Invalid character in entity name" errors.
      const sanitizedXml = xmlText.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, "&amp;");

      const feed = await parser.parseString(sanitizedXml);
      const sourceItems: NewsItem[] = [];
      
      feed.items.forEach((item: FeedItem) => {
        const timestamp = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
        const isValidDate = !Number.isNaN(timestamp);
        
        // Filter by age (max 2 days old for better diversity), allow if no valid date
        if (isValidDate && timestamp < oneDayAgo.getTime()) return;

        // Apply source-specific filters
        if (source.filter && !source.filter(item)) return;

        let image = "";
        if (item.enclosure?.url) {
          image = item.enclosure.url;
        } else if (item.mediaContent?.[0]?.$.url) {
          image = item.mediaContent[0].$.url;
        } else if (item.mediaThumbnail?.$?.url) {
          image = item.mediaThumbnail.$.url;
        } else if (item.itemImage) {
          if (typeof item.itemImage === "string") {
            image = item.itemImage;
          } else if (typeof item.itemImage === "object") {
            image = (item.itemImage as any).$?.url || (item.itemImage as any)._ || "";
          }
        } else if (item.contentEncoded) {
          const match = item.contentEncoded.match(/<img[^>]+src="([^">]+)"/);
          if (match) image = match[1];
        } else if (item.content) {
          const match = item.content.match(/<img[^>]+src="([^">]+)"/);
          if (match) image = match[1];
        } else if (item.description) {
          const match = item.description.match(/<img[^>]+src="([^">]+)"/);
          if (match) image = match[1];
        }

        sourceItems.push({
          id: item.guid || item.link || Math.random().toString(),
          headline: item.title || "No Title",
          time: isValidDate ? new Date(timestamp).toISOString() : new Date().toISOString(),
          url: item.link || "",
          source: source.name,
          image: image
        });
      });

      // Grab dynamic OpenGraph (og:image) from page URLs in parallel for the top 8 items per source if they are missing
      const subset = sourceItems.slice(0, 8);
      await Promise.all(subset.map(async (item) => {
        if (!item.image && item.url) {
          if (ogImageCache.has(item.url)) {
            item.image = ogImageCache.get(item.url) || "";
          } else {
            const ogImg = await extractOgImage(item.url);
            ogImageCache.set(item.url, ogImg);
            item.image = ogImg;
          }
        }
      }));

      // Cap per source to ensure diversity
      allItems.push(...subset);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`Bypassed feed source ${source.name}:`, msg);
    }
  });

  await Promise.allSettled(fetchPromises);

  // Sort all items individually by date descending first
  allItems.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // Group by source and de-duplicate by URL
  const bySource: Record<string, NewsItem[]> = {};
  const seenUrls = new Set<string>();
  
  allItems.forEach(item => {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      if (!bySource[item.source]) bySource[item.source] = [];
      bySource[item.source].push(item);
    }
  });

  // Interleave sources for maximum diversity
  const interleaved: NewsItem[] = [];
  let added = true;
  while (added && interleaved.length < 30) {
    added = false;
    for (const name of SOURCES.map(s => s.name)) {
      if (bySource[name] && bySource[name].length > 0) {
        const item = bySource[name].shift();
        if (item) {
          interleaved.push(item);
          added = true;
        }
      }
    }
  }

  cachedNews = interleaved;
  lastFetchTime = now;

  return cachedNews;
}
