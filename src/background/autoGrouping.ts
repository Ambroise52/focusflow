/**
 * FocusFlow Auto-Grouping Intelligence
 *
 * Analyses open tabs and suggests workspace groupings using three heuristics:
 *   1. Domain clustering  – tabs sharing a known domain category
 *   2. Keyword detection  – URL/title keywords mapped to topic categories
 *   3. Time-based context – current hour/day mapped to Work/Personal/Leisure
 *
 * Only suggestions that reach >= 70 confidence are surfaced to the user.
 *
 * @module background/autoGrouping
 */

import { extractDomain, generateId } from '../lib/utils';
import { saveWorkspaceSuggestion, getSettings } from '../lib/storage';
import { DEBUG } from '../lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single workspace grouping suggestion produced by the algorithm. */
interface WorkspaceSuggestion {
  /** Auto-generated UUID for this suggestion. */
  id: string;
  /** Human-readable workspace name (e.g. "Development", "Travel Planning"). */
  name: string;
  /** Chrome tab IDs included in this suggestion. */
  tabIds: number[];
  /** Tab URLs included in this suggestion. */
  tabUrls: string[];
  /** 0–100 confidence score. Only suggestions >= 70 are shown. */
  confidence: number;
  /** Human-readable reason shown in the notification. */
  reason: string;
  /** ISO timestamp of when this suggestion was created. */
  createdAt: string;
}

/** Internal scoring breakdown used while computing confidence. */
interface ConfidenceBreakdown {
  domainScore: number;
  tabCountScore: number;
  recencyScore: number;
  focusScore: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Domain patterns  (8 categories, 100+ domains)
// ---------------------------------------------------------------------------

/**
 * Maps workspace category names to lists of known domains.
 * Tabs whose hostnames end with any listed domain contribute to that category.
 */
const DOMAIN_PATTERNS: Record<string, string[]> = {
  'Development': [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackoverflow.com',
    'stackexchange.com',
    'developer.mozilla.org',
    'docs.python.org',
    'docs.rust-lang.org',
    'nodejs.org',
    'npmjs.com',
    'pypi.org',
    'rubygems.org',
    'crates.io',
    'pkg.go.dev',
    'jsr.io',
    'vercel.com',
    'netlify.com',
    'heroku.com',
    'railway.app',
    'render.com',
    'fly.io',
    'aws.amazon.com',
    'console.cloud.google.com',
    'portal.azure.com',
    'digitalocean.com',
    'cloudflare.com',
    'replit.com',
    'codepen.io',
    'codesandbox.io',
    'jsfiddle.net',
    'regex101.com',
    'devdocs.io',
    'bundlephobia.com',
    'caniuse.com',
  ],

  'Work & Productivity': [
    'notion.so',
    'docs.google.com',
    'sheets.google.com',
    'slides.google.com',
    'drive.google.com',
    'mail.google.com',
    'calendar.google.com',
    'meet.google.com',
    'slack.com',
    'teams.microsoft.com',
    'zoom.us',
    'webex.com',
    'office.com',
    'outlook.live.com',
    'outlook.office.com',
    'trello.com',
    'asana.com',
    'monday.com',
    'linear.app',
    'jira.atlassian.com',
    'confluence.atlassian.com',
    'basecamp.com',
    'clickup.com',
    'airtable.com',
    'miro.com',
    'figma.com',
    'dropbox.com',
    'box.com',
    'evernote.com',
    'todoist.com',
    'craft.do',
    'obsidian.md',
    'roamresearch.com',
  ],

  'Entertainment': [
    'youtube.com',
    'netflix.com',
    'disneyplus.com',
    'hulu.com',
    'primevideo.com',
    'hbomax.com',
    'max.com',
    'peacocktv.com',
    'twitch.tv',
    'reddit.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'tiktok.com',
    'facebook.com',
    'snapchat.com',
    'pinterest.com',
    'tumblr.com',
    'imgur.com',
    '9gag.com',
    'ifunny.co',
    'spotify.com',
    'soundcloud.com',
    'deezer.com',
    'tidal.com',
    'store.steampowered.com',
    'epicgames.com',
    'gog.com',
    'itch.io',
    'chess.com',
    'lichess.org',
  ],

  'Shopping': [
    'amazon.com',
    'amazon.co.uk',
    'ebay.com',
    'etsy.com',
    'aliexpress.com',
    'walmart.com',
    'target.com',
    'bestbuy.com',
    'costco.com',
    'homedepot.com',
    'ikea.com',
    'wayfair.com',
    'chewy.com',
    'zappos.com',
    'asos.com',
    'shein.com',
    'zara.com',
    'uniqlo.com',
    'nike.com',
    'adidas.com',
    'apple.com',
    'newegg.com',
    'bhphotovideo.com',
    'shopify.com',
    'mercadolibre.com',
    'flipkart.com',
    'lazada.com',
  ],

  'Research & Learning': [
    'scholar.google.com',
    'arxiv.org',
    'pubmed.ncbi.nlm.nih.gov',
    'researchgate.net',
    'academia.edu',
    'ssrn.com',
    'semanticscholar.org',
    'jstor.org',
    'coursera.org',
    'udemy.com',
    'edx.org',
    'khanacademy.org',
    'brilliant.org',
    'pluralsight.com',
    'linkedin.com/learning',
    'skillshare.com',
    'freecodecamp.org',
    'theodinproject.com',
    'codecademy.com',
    'exercism.org',
    'leetcode.com',
    'hackerrank.com',
    'codewars.com',
    'wikipedia.org',
    'wolframalpha.com',
    'mathworld.wolfram.com',
  ],

  'News & Media': [
    'nytimes.com',
    'wsj.com',
    'washingtonpost.com',
    'bbc.com',
    'theguardian.com',
    'reuters.com',
    'apnews.com',
    'cnn.com',
    'nbcnews.com',
    'abcnews.go.com',
    'cbsnews.com',
    'foxnews.com',
    'politico.com',
    'theatlantic.com',
    'newyorker.com',
    'economist.com',
    'ft.com',
    'bloomberg.com',
    'techcrunch.com',
    'theverge.com',
    'wired.com',
    'ars technica.com',
    'arstechnica.com',
    'engadget.com',
    'gizmodo.com',
    'hackernews.com',
    'news.ycombinator.com',
  ],

  'Finance': [
    'paypal.com',
    'stripe.com',
    'wise.com',
    'revolut.com',
    'cashapp.com',
    'venmo.com',
    'coinbase.com',
    'binance.com',
    'kraken.com',
    'robinhood.com',
    'etrade.com',
    'fidelity.com',
    'schwab.com',
    'vanguard.com',
    'personalcapital.com',
    'mint.com',
    'ynab.com',
    'quickbooks.com',
    'freshbooks.com',
    'xero.com',
    'tradingview.com',
    'finance.yahoo.com',
    'marketwatch.com',
    'investing.com',
    'morningstar.com',
  ],

  'Travel': [
    'booking.com',
    'airbnb.com',
    'expedia.com',
    'kayak.com',
    'skyscanner.com',
    'google.com/travel',
    'tripadvisor.com',
    'hotels.com',
    'trivago.com',
    'hotwire.com',
    'priceline.com',
    'vrbo.com',
    'hostelworld.com',
    'ryanair.com',
    'easyjet.com',
    'southwest.com',
    'delta.com',
    'united.com',
    'britishairways.com',
    'flightaware.com',
    'flightradar24.com',
    'rome2rio.com',
    'seat61.com',
    'lonelyplanet.com',
    'nomadlist.com',
    'iata.org',
    'visa-requirements.org',
  ],
};

// ---------------------------------------------------------------------------
// Keyword patterns  (8 categories, 50+ keywords)
// ---------------------------------------------------------------------------

/**
 * Maps workspace category names to keyword arrays.
 * Keywords are matched against lowercased URL + tab title strings.
 */
const KEYWORD_PATTERNS: Record<string, string[]> = {
  'Research': [
    'research', 'paper', 'study', 'journal', 'academic', 'thesis',
    'dissertation', 'abstract', 'literature', 'citation', 'peer-review',
    'methodology', 'hypothesis', 'findings', 'analysis', 'dataset',
  ],

  'Recipes & Cooking': [
    'recipe', 'cooking', 'baking', 'food', 'cuisine', 'ingredient',
    'dinner', 'lunch', 'breakfast', 'dessert', 'vegetarian', 'vegan',
    'meal', 'kitchen', 'chef', 'roast', 'simmer', 'sauté',
  ],

  'Travel Planning': [
    'travel', 'flight', 'hotel', 'vacation', 'holiday', 'trip',
    'itinerary', 'passport', 'visa', 'airport', 'airbnb', 'hostel',
    'backpack', 'destination', 'tour', 'sightseeing', 'booking',
  ],

  'Learning': [
    'tutorial', 'course', 'learn', 'education', 'training', 'lesson',
    'lecture', 'guide', 'howto', 'how-to', 'explainer', 'beginner',
    'advanced', 'certification', 'bootcamp', 'workshop', 'documentation',
  ],

  'Job Search': [
    'jobs', 'career', 'resume', 'cv', 'interview', 'salary',
    'hiring', 'recruit', 'apply', 'application', 'linkedin',
    'glassdoor', 'indeed', 'vacancy', 'position', 'opening', 'opportunity',
  ],

  'Documentation': [
    'docs', 'documentation', 'api', 'reference', 'spec', 'specification',
    'guide', 'handbook', 'wiki', 'readme', 'changelog', 'release',
    'sdk', 'library', 'framework', 'manual', 'faq',
  ],

  'Design': [
    'design', 'ui', 'ux', 'figma', 'prototype', 'wireframe', 'mockup',
    'component', 'typography', 'color', 'palette', 'icon', 'illustration',
    'brand', 'logo', 'dribbble', 'behance', 'awwwards',
  ],

  'Writing': [
    'writing', 'blog', 'article', 'essay', 'draft', 'edit', 'publish',
    'newsletter', 'substack', 'medium', 'content', 'copywriting',
    'storytelling', 'novel', 'script', 'grammar', 'proofread',
  ],
};

// ---------------------------------------------------------------------------
// Confidence scoring constants
// ---------------------------------------------------------------------------

/** Minimum confidence (0-100) required before surfacing a suggestion. */
const CONFIDENCE_THRESHOLD = 70;

/** Points awarded per percentage point of domain match coverage (max 40). */
const DOMAIN_MATCH_MAX = 40;

/** Points awarded based on tab count brackets (max 30). */
const TAB_COUNT_MAX = 30;

/** Points awarded when most tabs were opened in the last 10 minutes (max 15). */
const RECENCY_BONUS_MAX = 15;

/** Points awarded when tabs are concentrated on a single domain (max 15). */
const FOCUS_BONUS_MAX = 15;

/** Recency window in milliseconds (10 minutes). */
const RECENCY_WINDOW_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main entry point called by tabListener after a debounced tab event.
 * Analyses the provided Chrome tabs and fires a notification for the best
 * suggestion (if any) that exceeds the confidence threshold.
 *
 * @param chromeTabs - Array of Chrome tab objects from the current window
 */
export async function suggestWorkspaceGrouping(
  chromeTabs: chrome.tabs.Tab[]
): Promise<void> {
  try {
    if (DEBUG) {
      console.log('🤖 Running workspace grouping analysis...');
    }

    const settings = await getSettings();
    if (!settings.enableAutoGrouping) {
      return;
    }

    // Filter to actionable tabs only
    const validTabs = chromeTabs.filter(
      (t) =>
        t.id !== undefined &&
        t.url &&
        !t.url.startsWith('chrome://') &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.startsWith('edge://') &&
        !t.url.startsWith('about:')
    );

    if (validTabs.length < 2) {
      if (DEBUG) {
        console.log('⏭️  Not enough valid tabs for grouping analysis');
      }
      return;
    }

    // Generate all candidate suggestions
    const suggestions = await generateSuggestions(validTabs);

    if (suggestions.length === 0) {
      if (DEBUG) {
        console.log('💬 No high-confidence suggestions found');
      }
      return;
    }

    // Pick the highest-confidence suggestion
    const best = suggestions.reduce((a, b) =>
      a.confidence >= b.confidence ? a : b
    );

    if (DEBUG) {
      console.log(`💡 Best suggestion: "${best.name}" (${best.confidence}% confidence)`);
    }

    // Persist suggestion for later retrieval by the popup
    await saveWorkspaceSuggestion(best);

    // Show browser notification
    await showSuggestionNotification(best);
  } catch (error) {
    console.error('❌ suggestWorkspaceGrouping failed:', error);
  }
}

/**
 * Handles a click on a suggestion notification button.
 * Called by the notification `onButtonClicked` listener in background/index.ts.
 *
 * Button indices:
 *   0 → "Create Workspace" (accept suggestion)
 *   1 → "Dismiss"
 *
 * @param notificationId - The notification ID (matches suggestion.id)
 * @param buttonIndex - 0 for accept, 1 for dismiss
 */
export async function handleSuggestionNotificationClick(
  notificationId: string,
  buttonIndex: number
): Promise<void> {
  try {
    if (buttonIndex === 0) {
      if (DEBUG) {
        console.log(`✅ User accepted suggestion: ${notificationId}`);
      }
      // Open the FocusFlow popup so the user can confirm workspace creation
      await chrome.action.openPopup();
    } else {
      if (DEBUG) {
        console.log(`❌ User dismissed suggestion: ${notificationId}`);
      }
    }

    // Always clear the notification
    chrome.notifications.clear(notificationId);
  } catch (error) {
    console.error('❌ handleSuggestionNotificationClick failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Core analysis pipeline  (private)
// ---------------------------------------------------------------------------

/**
 * Runs all three heuristics and returns suggestions above the threshold,
 * sorted by confidence descending.
 *
 * @param tabs - Filtered, valid Chrome tabs
 */
async function generateSuggestions(
  tabs: chrome.tabs.Tab[]
): Promise<WorkspaceSuggestion[]> {
  const results: WorkspaceSuggestion[] = [];

  // Heuristic 1 – domain-based grouping
  const domainSuggestions = generateDomainSuggestions(tabs);
  results.push(...domainSuggestions);

  // Heuristic 2 – keyword-based grouping
  const keywordSuggestions = generateKeywordSuggestions(tabs);
  results.push(...keywordSuggestions);

  // Heuristic 3 – time-based context (single suggestion for current period)
  const timeSuggestion = generateTimeSuggestion(tabs);
  if (timeSuggestion) {
    results.push(timeSuggestion);
  }

  // Heuristic 4 – same-domain clustering (catches unlisted domains)
  const sameDomainSuggestions = generateSameDomainSuggestions(tabs);
  results.push(...sameDomainSuggestions);

  // Deduplicate by category name, keep highest confidence per name
  const seen = new Map<string, WorkspaceSuggestion>();
  for (const s of results) {
    const existing = seen.get(s.name);
    if (!existing || s.confidence > existing.confidence) {
      seen.set(s.name, s);
    }
  }

  return Array.from(seen.values())
    .filter((s) => s.confidence >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// Heuristic 1 – Domain-based grouping
// ---------------------------------------------------------------------------

/**
 * For each domain category, calculates how many of the open tabs match.
 * Returns a suggestion for every category that has 3+ matching tabs
 * and reaches the confidence threshold.
 *
 * @param tabs - Valid Chrome tabs
 */
function generateDomainSuggestions(
  tabs: chrome.tabs.Tab[]
): WorkspaceSuggestion[] {
  const suggestions: WorkspaceSuggestion[] = [];

  for (const [category, domains] of Object.entries(DOMAIN_PATTERNS)) {
    const matchingTabs = tabs.filter((tab) => {
      if (!tab.url) return false;
      const domain = extractDomain(tab.url);
      return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
    });

    if (matchingTabs.length < 3) {
      continue; // Need at least 3 tabs to suggest a workspace
    }

    const confidence = calculateDomainConfidence(matchingTabs, tabs);

    if (confidence < CONFIDENCE_THRESHOLD) {
      continue;
    }

    suggestions.push({
      id: generateId(),
      name: category,
      tabIds: matchingTabs.map((t) => t.id!),
      tabUrls: matchingTabs.map((t) => t.url!),
      confidence,
      reason: `${matchingTabs.length} tabs match the "${category}" domain pattern`,
      createdAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

/**
 * Calculates confidence for a domain-based suggestion.
 *
 * Scoring:
 *   Domain match coverage  0–40 pts  (matchingTabs / totalTabs * 40)
 *   Tab count bracket      0–30 pts  (3+ → 15, 5+ → 22, 8+ → 30)
 *   Recency bonus          0–15 pts  (≥50% opened in last 10 min)
 *   Focus bonus            0–15 pts  (≥80% on same root domain)
 *
 * @param matchingTabs - Tabs that matched this category
 * @param allTabs - All valid open tabs
 */
function calculateDomainConfidence(
  matchingTabs: chrome.tabs.Tab[],
  allTabs: chrome.tabs.Tab[]
): number {
  const breakdown: ConfidenceBreakdown = {
    domainScore: 0,
    tabCountScore: 0,
    recencyScore: 0,
    focusScore: 0,
    total: 0,
  };

  // Domain match coverage
  const coverageRatio = matchingTabs.length / allTabs.length;
  breakdown.domainScore = Math.round(coverageRatio * DOMAIN_MATCH_MAX);

  // Tab count bracket
  const count = matchingTabs.length;
  if (count >= 8) {
    breakdown.tabCountScore = TAB_COUNT_MAX;
  } else if (count >= 5) {
    breakdown.tabCountScore = Math.round(TAB_COUNT_MAX * 0.73); // 22
  } else if (count >= 3) {
    breakdown.tabCountScore = Math.round(TAB_COUNT_MAX * 0.5); // 15
  }

  // Recency bonus – tabs opened in last 10 minutes
  const now = Date.now();
  const recentCount = matchingTabs.filter(
    (t) => t.lastAccessed !== undefined && now - t.lastAccessed < RECENCY_WINDOW_MS
  ).length;
  if (recentCount / matchingTabs.length >= 0.5) {
    breakdown.recencyScore = RECENCY_BONUS_MAX;
  }

  // Focus bonus – most tabs concentrated on one domain
  const domainFreq = new Map<string, number>();
  for (const tab of matchingTabs) {
    if (!tab.url) continue;
    const d = extractDomain(tab.url);
    domainFreq.set(d, (domainFreq.get(d) ?? 0) + 1);
  }
  const maxFreq = Math.max(...Array.from(domainFreq.values()), 0);
  if (maxFreq / matchingTabs.length >= 0.8) {
    breakdown.focusScore = FOCUS_BONUS_MAX;
  }

  breakdown.total = Math.min(
    100,
    breakdown.domainScore +
      breakdown.tabCountScore +
      breakdown.recencyScore +
      breakdown.focusScore
  );

  if (DEBUG) {
    console.log('📊 Domain confidence breakdown:', breakdown);
  }

  return breakdown.total;
}

// ---------------------------------------------------------------------------
// Heuristic 2 – Keyword-based grouping
// ---------------------------------------------------------------------------

/**
 * For each keyword category, scans tab URLs and titles for keyword matches.
 * Returns suggestions for categories where 2+ tabs contain matching keywords.
 *
 * @param tabs - Valid Chrome tabs
 */
function generateKeywordSuggestions(
  tabs: chrome.tabs.Tab[]
): WorkspaceSuggestion[] {
  const suggestions: WorkspaceSuggestion[] = [];

  for (const [category, keywords] of Object.entries(KEYWORD_PATTERNS)) {
    const matchingTabs = tabs.filter((tab) => {
      const searchText = `${tab.url ?? ''} ${tab.title ?? ''}`.toLowerCase();
      return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
    });

    if (matchingTabs.length < 2) {
      continue;
    }

    const confidence = calculateKeywordConfidence(matchingTabs, tabs, keywords);

    if (confidence < CONFIDENCE_THRESHOLD) {
      continue;
    }

    suggestions.push({
      id: generateId(),
      name: category,
      tabIds: matchingTabs.map((t) => t.id!),
      tabUrls: matchingTabs.map((t) => t.url!),
      confidence,
      reason: `${matchingTabs.length} tabs contain "${category.toLowerCase()}" keywords`,
      createdAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

/**
 * Calculates confidence for a keyword-based suggestion.
 *
 * Scoring mirrors domain confidence but with slightly lower weights
 * since keyword matching is less precise than domain matching.
 *
 * @param matchingTabs - Tabs that matched this category
 * @param allTabs - All valid open tabs
 * @param keywords - The keyword list for this category
 */
function calculateKeywordConfidence(
  matchingTabs: chrome.tabs.Tab[],
  allTabs: chrome.tabs.Tab[],
  keywords: string[]
): number {
  // Base coverage (max 35 for keywords – slightly less than domain)
  const coverageRatio = matchingTabs.length / allTabs.length;
  const coverageScore = Math.round(coverageRatio * 35);

  // Count score (max 25)
  const count = matchingTabs.length;
  let countScore = 0;
  if (count >= 6) {
    countScore = 25;
  } else if (count >= 4) {
    countScore = 18;
  } else if (count >= 2) {
    countScore = 12;
  }

  // Keyword density – tabs with multiple keyword matches (max 20)
  const multiMatchCount = matchingTabs.filter((tab) => {
    const text = `${tab.url ?? ''} ${tab.title ?? ''}`.toLowerCase();
    const hits = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
    return hits >= 2;
  }).length;
  const densityScore = Math.round((multiMatchCount / matchingTabs.length) * 20);

  // Recency bonus (max 20)
  const now = Date.now();
  const recentCount = matchingTabs.filter(
    (t) => t.lastAccessed !== undefined && now - t.lastAccessed < RECENCY_WINDOW_MS
  ).length;
  const recencyScore =
    recentCount / matchingTabs.length >= 0.5 ? 20 : 0;

  return Math.min(100, coverageScore + countScore + densityScore + recencyScore);
}

// ---------------------------------------------------------------------------
// Heuristic 3 – Time-based context
// ---------------------------------------------------------------------------

/**
 * Returns a time-context suggestion (Work / Personal / Leisure / Night Reading)
 * based on the current hour and day of the week.
 * Only produced when the tab count is at or above the user's threshold.
 *
 * @param tabs - Valid Chrome tabs
 */
function generateTimeSuggestion(
  tabs: chrome.tabs.Tab[]
): WorkspaceSuggestion | null {
  // Require at least 3 tabs for a time-based suggestion
  if (tabs.length < 3) {
    return null;
  }

  const context = getTimeBasedContext();

  // Confidence for a time-based suggestion is intentionally modest (70–80)
  // since it's purely heuristic and can't inspect tab content.
  const confidence = 70 + Math.min(10, tabs.length - 3);

  return {
    id: generateId(),
    name: context,
    tabIds: tabs.map((t) => t.id!),
    tabUrls: tabs.map((t) => t.url!),
    confidence,
    reason: `${tabs.length} tabs open during your typical "${context}" browsing time`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Maps the current time to a browsing context label.
 *
 * Rules:
 *   Weekend (day 0 or 6)          → 'Leisure'
 *   Weekday 09:00–17:00            → 'Work'
 *   Weekday 17:00–23:00            → 'Personal'
 *   Weekday 23:00–09:00 (late)    → 'Night Reading'
 */
function getTimeBasedContext(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday

  if (day === 0 || day === 6) {
    return 'Leisure';
  }

  if (hour >= 9 && hour < 17) {
    return 'Work';
  }

  if (hour >= 17 && hour < 23) {
    return 'Personal';
  }

  return 'Night Reading';
}

// ---------------------------------------------------------------------------
// Heuristic 4 – Same-domain clustering (unlisted domains)
// ---------------------------------------------------------------------------

/**
 * Detects clusters of 3+ tabs sharing the same root domain that was NOT
 * matched by DOMAIN_PATTERNS. This catches company-internal tools,
 * regional sites, and any domain not yet in our list.
 *
 * @param tabs - Valid Chrome tabs
 */
function generateSameDomainSuggestions(
  tabs: chrome.tabs.Tab[]
): WorkspaceSuggestion[] {
  // Count how many tabs share each root domain
  const domainMap = new Map<string, chrome.tabs.Tab[]>();

  for (const tab of tabs) {
    if (!tab.url) continue;
    const domain = extractDomain(tab.url);

    // Skip domains already covered by DOMAIN_PATTERNS
    const alreadyCovered = Object.values(DOMAIN_PATTERNS).some((domains) =>
      domains.some((d) => domain === d || domain.endsWith(`.${d}`))
    );
    if (alreadyCovered) continue;

    const existing = domainMap.get(domain) ?? [];
    existing.push(tab);
    domainMap.set(domain, existing);
  }

  const suggestions: WorkspaceSuggestion[] = [];

  for (const [domain, domainTabs] of domainMap.entries()) {
    if (domainTabs.length < 3) continue;

    // Name the workspace after the domain (strip www.)
    const name = domain.replace(/^www\./, '');
    const confidence = calculateDomainConfidence(domainTabs, tabs);

    if (confidence < CONFIDENCE_THRESHOLD) continue;

    suggestions.push({
      id: generateId(),
      name,
      tabIds: domainTabs.map((t) => t.id!),
      tabUrls: domainTabs.map((t) => t.url!),
      confidence,
      reason: `${domainTabs.length} tabs open on ${domain}`,
      createdAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Displays a Chrome notification for the given suggestion.
 * Notification ID is set to suggestion.id so button-click handlers can
 * identify which suggestion was accepted or dismissed.
 *
 * @param suggestion - The suggestion to notify the user about
 */
async function showSuggestionNotification(
  suggestion: WorkspaceSuggestion
): Promise<void> {
  try {
    // Check that the notifications API is available
    if (!chrome.notifications) {
      if (DEBUG) {
        console.warn('⚠️  chrome.notifications not available');
      }
      return;
    }

    const tabWord = suggestion.tabIds.length === 1 ? 'tab' : 'tabs';

    await chrome.notifications.create(suggestion.id, {
      type: 'basic',
      iconUrl: '../assets/icon48.png',
      title: `💡 Group into "${suggestion.name}"?`,
      message: `${suggestion.reason}. Save them as a workspace to easily resume later.`,
      buttons: [
        { title: '✅ Create Workspace' },
        { title: '❌ Dismiss' },
      ],
      priority: 1,
    });

    if (DEBUG) {
      console.log(
        `🔔 Notification shown for "${suggestion.name}" (${suggestion.tabIds.length} ${tabWord})`
      );
    }
  } catch (error) {
    console.error('❌ showSuggestionNotification failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------

if (DEBUG) {
  console.log('✅ autoGrouping module loaded');
}
