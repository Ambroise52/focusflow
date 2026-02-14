/**
 * FocusFlow Auto-Grouping Intelligence
 * 
 * Analyzes open tabs and suggests intelligent workspace groupings using:
 * - Domain clustering (GitHub, Google Docs, YouTube, etc.)
 * - Keyword detection in URLs and titles
 * - Time-based context (Work hours, Personal time, Weekend)
 * - Confidence scoring (0-100%)
 * 
 * This is what makes FocusFlow "smart" instead of just a tab organizer.
 * 
 * @module background/autoGrouping
 */

import { extractDomain, generateId } from '../lib/utils';
import { saveWorkspaceSuggestion, getSettings } from '../lib/storage';
import { DEBUG } from '../lib/constants';

/**
 * Domain patterns for automatic categorization
 * Maps workspace categories to common domain patterns
 */
const DOMAIN_PATTERNS: Record<string, string[]> = {
  'Development': [
    'github.com', 'gitlab.com', 'bitbucket.org',
    'stackoverflow.com', 'stackexchange.com',
    'developer.mozilla.org', 'docs.python.org', 'nodejs.org',
    'npmjs.com', 'pypi.org', 'crates.io',
    'codesandbox.io', 'replit.com', 'codepen.io'
  ],
  'Work & Productivity': [
    'notion.so', 'airtable.com', 'asana.com', 'trello.com',
    'docs.google.com', 'sheets.google.com', 'slides.google.com',
    'drive.google.com', 'calendar.google.com',
    'slack.com', 'discord.com', 'teams.microsoft.com',
    'zoom.us', 'meet.google.com',
    'figma.com', 'miro.com', 'canva.com'
  ],
  'Entertainment': [
    'youtube.com', 'netflix.com', 'hulu.com', 'disneyplus.com',
    'reddit.com', 'twitter.com', 'instagram.com', 'facebook.com',
    'twitch.tv', 'tiktok.com',
    'spotify.com', 'soundcloud.com', 'apple.com/music'
  ],
  'Shopping': [
    'amazon.com', 'ebay.com', 'etsy.com', 'aliexpress.com',
    'shopify.com', 'walmart.com', 'target.com', 'bestbuy.com',
    'alibaba.com', 'wish.com'
  ],
  'Research & Learning': [
    'scholar.google.com', 'researchgate.net', 'arxiv.org',
    'pubmed.ncbi.nlm.nih.gov', 'jstor.org', 'sciencedirect.com',
    'coursera.org', 'udemy.com', 'khanacademy.org',
    'edx.org', 'linkedin.com/learning',
    'wikipedia.org', 'medium.com'
  ],
  'News & Media': [
    'nytimes.com', 'bbc.com', 'cnn.com', 'theguardian.com',
    'reuters.com', 'apnews.com', 'wsj.com',
    'techcrunch.com', 'theverge.com', 'arstechnica.com'
  ],
  'Finance': [
    'paypal.com', 'stripe.com', 'wise.com',
    'coinbase.com', 'binance.com',
    'mint.com', 'ynab.com', 'personalcapital.com',
    'robinhood.com', 'fidelity.com', 'vanguard.com'
  ],
  'Travel': [
    'booking.com', 'airbnb.com', 'hotels.com', 'expedia.com',
    'kayak.com', 'skyscanner.com', 'tripadvisor.com',
    'google.com/travel', 'google.com/flights'
  ]
};

/**
 * Keyword patterns for URL and title matching
 * Scans for context clues when domain patterns don't match
 */
const KEYWORD_PATTERNS: Record<string, string[]> = {
  'Research': ['research', 'paper', 'study', 'journal', 'academic', 'thesis', 'publication', 'article'],
  'Recipes & Cooking': ['recipe', 'cooking', 'food', 'baking', 'cuisine', 'cook', 'meal', 'ingredient'],
  'Travel Planning': ['travel', 'flight', 'hotel', 'booking', 'vacation', 'trip', 'destination', 'itinerary'],
  'Learning': ['tutorial', 'course', 'learn', 'education', 'training', 'guide', 'how to', 'lesson'],
  'Job Search': ['job', 'career', 'hiring', 'recruit', 'linkedin', 'resume', 'interview', 'apply'],
  'Documentation': ['docs', 'documentation', 'api', 'reference', 'manual', 'guide'],
  'Design': ['design', 'ui', 'ux', 'mockup', 'wireframe', 'prototype', 'figma', 'sketch'],
  'Writing': ['blog', 'article', 'writing', 'draft', 'post', 'content', 'editor']
};

/**
 * Workspace suggestion interface
 */
interface WorkspaceSuggestion {
  name: string;
  tabs: chrome.tabs.Tab[];
  confidence: number;
  reason: string;
  icon?: string;
}

/**
 * Main entry point: Analyze tabs and suggest workspace groupings
 * Called by tabListener.ts when auto-grouping threshold is reached
 * 
 * @param chromeTabs - Array of Chrome tabs to analyze
 */
export async function suggestWorkspaceGrouping(
  chromeTabs: chrome.tabs.Tab[]
): Promise<void> {
  try {
    if (DEBUG) {
      console.log(`🧠 Analyzing ${chromeTabs.length} tabs for auto-grouping...`);
    }

    const settings = await getSettings();
    
    // Don't suggest if auto-grouping is disabled
    if (!settings.enableAutoGrouping) {
      return;
    }

    // Generate all possible suggestions
    const suggestions = generateSuggestions(chromeTabs);

    // Filter by confidence threshold (only show high-confidence suggestions)
    const highConfidenceSuggestions = suggestions.filter(s => s.confidence >= 70);

    if (highConfidenceSuggestions.length === 0) {
      if (DEBUG) {
        console.log('⚠️  No high-confidence suggestions found');
      }
      return;
    }

    // Pick the best suggestion (highest confidence)
    const bestSuggestion = highConfidenceSuggestions.sort((a, b) => 
      b.confidence - a.confidence
    )[0];

    if (DEBUG) {
      console.log('💡 Workspace suggestion:', {
        name: bestSuggestion.name,
        tabCount: bestSuggestion.tabs.length,
        confidence: bestSuggestion.confidence,
        reason: bestSuggestion.reason
      });
    }

    // Save suggestion for later retrieval by popup
    await saveWorkspaceSuggestion({
      id: generateId(),
      name: bestSuggestion.name,
      tabs: bestSuggestion.tabs.map(tab => ({
        id: tab.id!,
        url: tab.url!,
        title: tab.title || 'Untitled',
        favIconUrl: tab.favIconUrl,
        isImportant: false,
        lastAccessed: Date.now()
      })),
      confidence: bestSuggestion.confidence,
      reason: bestSuggestion.reason,
      createdAt: Date.now()
    });

    // Show notification to user
    await showSuggestionNotification(bestSuggestion);

  } catch (error) {
    console.error('❌ Auto-grouping failed:', error);
  }
}

/**
 * Generate all possible workspace suggestions from tabs
 * Returns array of suggestions sorted by confidence (high to low)
 * 
 * @param chromeTabs - Chrome tabs to analyze
 * @returns Array of workspace suggestions
 */
function generateSuggestions(chromeTabs: chrome.tabs.Tab[]): WorkspaceSuggestion[] {
  const suggestions: WorkspaceSuggestion[] = [];

  // 1. Domain-based suggestions (highest priority)
  const domainSuggestions = generateDomainSuggestions(chromeTabs);
  suggestions.push(...domainSuggestions);

  // 2. Keyword-based suggestions
  const keywordSuggestions = generateKeywordSuggestions(chromeTabs);
  suggestions.push(...keywordSuggestions);

  // 3. Time-based suggestions (fallback)
  const timeSuggestion = generateTimeSuggestion(chromeTabs);
  if (timeSuggestion) {
    suggestions.push(timeSuggestion);
  }

  // 4. Same-domain clustering (if multiple tabs from one domain)
  const sameDomainSuggestions = generateSameDomainSuggestions(chromeTabs);
  suggestions.push(...sameDomainSuggestions);

  return suggestions;
}

/**
 * Generate suggestions based on domain pattern matching
 * 
 * @param chromeTabs - Tabs to analyze
 * @returns Array of domain-based suggestions
 */
function generateDomainSuggestions(chromeTabs: chrome.tabs.Tab[]): WorkspaceSuggestion[] {
  const suggestions: WorkspaceSuggestion[] = [];

  for (const [category, domains] of Object.entries(DOMAIN_PATTERNS)) {
    const matchingTabs = chromeTabs.filter(tab => {
      if (!tab.url) return false;
      const domain = extractDomain(tab.url);
      return domains.some(pattern => domain.includes(pattern));
    });

    if (matchingTabs.length >= 3) {
      const confidence = calculateDomainConfidence(matchingTabs, chromeTabs.length);
      
      suggestions.push({
        name: category,
        tabs: matchingTabs,
        confidence,
        reason: `${matchingTabs.length} tabs from ${category.toLowerCase()} websites`,
        icon: getCategoryIcon(category)
      });
    }
  }

  return suggestions;
}

/**
 * Generate suggestions based on keyword matching in URLs and titles
 * 
 * @param chromeTabs - Tabs to analyze
 * @returns Array of keyword-based suggestions
 */
function generateKeywordSuggestions(chromeTabs: chrome.tabs.Tab[]): WorkspaceSuggestion[] {
  const suggestions: WorkspaceSuggestion[] = [];

  for (const [category, keywords] of Object.entries(KEYWORD_PATTERNS)) {
    const matchingTabs = chromeTabs.filter(tab => {
      const searchText = `${tab.url} ${tab.title}`.toLowerCase();
      return keywords.some(keyword => searchText.includes(keyword));
    });

    if (matchingTabs.length >= 3) {
      const confidence = calculateKeywordConfidence(matchingTabs, chromeTabs.length);
      
      suggestions.push({
        name: category,
        tabs: matchingTabs,
        confidence,
        reason: `${matchingTabs.length} tabs related to ${category.toLowerCase()}`,
        icon: getCategoryIcon(category)
      });
    }
  }

  return suggestions;
}

/**
 * Generate time-based suggestion (Work/Personal/Leisure)
 * 
 * @param chromeTabs - Tabs to analyze
 * @returns Time-based suggestion or null
 */
function generateTimeSuggestion(chromeTabs: chrome.tabs.Tab[]): WorkspaceSuggestion | null {
  const context = getTimeBasedContext();
  
  // Only suggest if we have enough tabs
  if (chromeTabs.length < 5) {
    return null;
  }

  // Lower confidence for time-based suggestions (they're more generic)
  const confidence = 50 + (chromeTabs.length >= 10 ? 10 : 0);

  return {
    name: context,
    tabs: chromeTabs,
    confidence,
    reason: `Based on current time (${new Date().toLocaleTimeString()})`,
    icon: getTimeIcon(context)
  };
}

/**
 * Generate suggestions for tabs from the same domain
 * Useful for clustering 5+ tabs from github.com, docs.google.com, etc.
 * 
 * @param chromeTabs - Tabs to analyze
 * @returns Array of same-domain suggestions
 */
function generateSameDomainSuggestions(chromeTabs: chrome.tabs.Tab[]): WorkspaceSuggestion[] {
  const suggestions: WorkspaceSuggestion[] = [];
  
  // Group tabs by domain
  const domainGroups = new Map<string, chrome.tabs.Tab[]>();
  
  for (const tab of chromeTabs) {
    if (!tab.url) continue;
    const domain = extractDomain(tab.url);
    
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain)!.push(tab);
  }

  // Create suggestions for domains with 5+ tabs
  for (const [domain, tabs] of domainGroups.entries()) {
    if (tabs.length >= 5) {
      const confidence = Math.min(60 + tabs.length * 3, 95);
      
      suggestions.push({
        name: formatDomainName(domain),
        tabs,
        confidence,
        reason: `${tabs.length} tabs from ${domain}`,
        icon: '🌐'
      });
    }
  }

  return suggestions;
}

/**
 * Calculate confidence score for domain-based suggestions
 * 
 * @param matchingTabs - Tabs that match the pattern
 * @param totalTabs - Total number of tabs being analyzed
 * @returns Confidence score (0-100)
 */
function calculateDomainConfidence(matchingTabs: chrome.tabs.Tab[], totalTabs: number): number {
  let score = 0;
  
  // Base score: percentage of matching tabs (max 40 points)
  const matchPercentage = matchingTabs.length / totalTabs;
  score += matchPercentage * 40;
  
  // Tab count bonus (max 30 points)
  if (matchingTabs.length >= 3) score += 10;
  if (matchingTabs.length >= 5) score += 10;
  if (matchingTabs.length >= 8) score += 10;
  
  // Recency bonus: if tabs were opened recently (max 15 points)
  const recentTabs = matchingTabs.filter(tab => {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    return tab.lastAccessed && tab.lastAccessed > tenMinutesAgo;
  });
  score += (recentTabs.length / matchingTabs.length) * 15;
  
  // Focus bonus: if most tabs are from same domain (max 15 points)
  const domains = new Set(matchingTabs.map(tab => extractDomain(tab.url || '')));
  if (domains.size === 1) score += 15;
  else if (domains.size === 2) score += 10;
  else if (domains.size === 3) score += 5;
  
  return Math.min(Math.round(score), 100);
}

/**
 * Calculate confidence score for keyword-based suggestions
 * 
 * @param matchingTabs - Tabs that match keywords
 * @param totalTabs - Total number of tabs
 * @returns Confidence score (0-100)
 */
function calculateKeywordConfidence(matchingTabs: chrome.tabs.Tab[], totalTabs: number): number {
  let score = 0;
  
  // Base score: percentage of matching tabs (max 35 points)
  const matchPercentage = matchingTabs.length / totalTabs;
  score += matchPercentage * 35;
  
  // Tab count bonus (max 25 points)
  if (matchingTabs.length >= 3) score += 10;
  if (matchingTabs.length >= 5) score += 10;
  if (matchingTabs.length >= 8) score += 5;
  
  // Keyword density bonus (max 20 points)
  // Higher score if keywords appear multiple times
  const avgKeywordMatches = matchingTabs.reduce((sum, tab) => {
    const text = `${tab.url} ${tab.title}`.toLowerCase();
    let matches = 0;
    for (const keywords of Object.values(KEYWORD_PATTERNS)) {
      matches += keywords.filter(kw => text.includes(kw)).length;
    }
    return sum + matches;
  }, 0) / matchingTabs.length;
  
  score += Math.min(avgKeywordMatches * 5, 20);
  
  // Lower confidence than domain matching (keywords are less reliable)
  score *= 0.85;
  
  return Math.min(Math.round(score), 100);
}

/**
 * Get time-based context based on current hour and day
 * 
 * @returns Context name (Work/Personal/Leisure/Night Reading)
 */
function getTimeBasedContext(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Weekend
  if (day === 0 || day === 6) {
    return 'Leisure';
  }

  // Weekday - time-based
  if (hour >= 9 && hour < 17) {
    return 'Work';
  } else if (hour >= 17 && hour < 23) {
    return 'Personal';
  } else {
    return 'Night Reading';
  }
}

/**
 * Format domain name for workspace suggestion
 * Removes TLD and capitalizes
 * 
 * @param domain - Domain name (e.g., "github.com")
 * @returns Formatted name (e.g., "GitHub")
 */
function formatDomainName(domain: string): string {
  // Remove common TLDs
  const name = domain.replace(/\.(com|org|net|io|dev|co|edu)$/, '');
  
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Get emoji icon for category
 * 
 * @param category - Category name
 * @returns Emoji icon
 */
function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'Development': '💻',
    'Work & Productivity': '💼',
    'Entertainment': '🎬',
    'Shopping': '🛒',
    'Research & Learning': '📚',
    'News & Media': '📰',
    'Finance': '💰',
    'Travel': '✈️',
    'Recipes & Cooking': '🍳',
    'Travel Planning': '🗺️',
    'Learning': '🎓',
    'Job Search': '💼',
    'Documentation': '📖',
    'Design': '🎨',
    'Writing': '✍️'
  };

  return icons[category] || '📁';
}

/**
 * Get emoji icon for time-based context
 * 
 * @param context - Time context
 * @returns Emoji icon
 */
function getTimeIcon(context: string): string {
  const icons: Record<string, string> = {
    'Work': '💼',
    'Personal': '🏠',
    'Leisure': '🎮',
    'Night Reading': '🌙'
  };

  return icons[context] || '⏰';
}

/**
 * Show notification to user about workspace suggestion
 * 
 * @param suggestion - Workspace suggestion to display
 */
async function showSuggestionNotification(suggestion: WorkspaceSuggestion): Promise<void> {
  try {
    // Create notification
    await chrome.notifications.create(`suggestion-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
      title: '💡 Workspace Suggestion',
      message: `Create "${suggestion.name}" workspace with ${suggestion.tabs.length} tabs?\n${suggestion.reason}`,
      buttons: [
        { title: 'Create Workspace' },
        { title: 'Dismiss' }
      ],
      requireInteraction: true, // Stays visible until user interacts
      priority: 2
    });

    if (DEBUG) {
      console.log('✅ Notification shown to user');
    }
  } catch (error) {
    console.error('❌ Failed to show notification:', error);
  }
}

/**
 * Handle notification button clicks
 * Should be registered in background/index.ts
 */
export async function handleSuggestionNotificationClick(
  notificationId: string,
  buttonIndex: number
): Promise<void> {
  // Button 0 = "Create Workspace"
  // Button 1 = "Dismiss"
  
  if (buttonIndex === 0) {
    // User accepted suggestion - open popup to confirm
    chrome.action.openPopup();
  }
  
  // Clear notification
  await chrome.notifications.clear(notificationId);
}

// Log that auto-grouping module is loaded
if (DEBUG) {
  console.log('✅ Auto-grouping module loaded');
}
