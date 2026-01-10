/**
 * Workspace Type Definitions
 * 
 * Defines the structure for workspaces - organized collections of tabs
 * grouped by context (work, research, shopping, etc.)
 */

import type { Tab, TabId } from './tab';

/**
 * Unique identifier for a workspace
 * Using UUID v4 format for uniqueness across devices
 * 
 * @example "550e8400-e29b-41d4-a716-446655440000"
 */
export type WorkspaceId = string;

/**
 * Hex color code for workspace visual coding
 * Used to visually distinguish workspaces in the UI
 * 
 * @example "#3B82F6" (blue)
 */
export type WorkspaceColor = string;

/**
 * Represents a workspace - a collection of tabs with shared context
 * 
 * Workspaces help users organize tabs by project, topic, or activity.
 * They can be paused (tabs closed but state saved) and resumed later.
 */
export interface Workspace {
  /**
   * Unique workspace identifier (UUID v4)
   */
  id: WorkspaceId;

  /**
   * User-defined workspace name
   * Can be edited inline in the UI
   * 
   * @example "Client Project Research"
   * @example "Weekend Learning"
   */
  name: string;

  /**
   * Array of tabs belonging to this workspace
   * Preserves order for restoration
   */
  tabs: Tab[];

  /**
   * Timestamp when workspace was created (milliseconds)
   * 
   * @example 1704931200000 (Date.now())
   */
  createdAt: number;

  /**
   * Timestamp when workspace was last accessed/modified
   * Updated when:
   * - Workspace is opened/resumed
   * - Tabs are added/removed
   * - Workspace is renamed
   */
  lastUsedAt: number;

  /**
   * Whether this workspace is currently active (tabs are open)
   * 
   * true = tabs are open in browser
   * false = workspace is paused (tabs hibernated)
   */
  isActive: boolean;

  /**
   * Whether this workspace's tabs are currently hibernated
   * Hibernated tabs are closed to free RAM but state is preserved
   * 
   * This is the inverse of isActive for clarity in different contexts
   */
  isPaused: boolean;

  /**
   * Optional color for visual coding in the UI
   * Displays as a colored border on workspace cards
   * 
   * @example "#3B82F6" (blue)
   * @example "#10B981" (green)
   */
  color?: WorkspaceColor;

  /**
   * Optional description/notes about this workspace
   * Not shown in MVP, reserved for future feature
   */
  description?: string;

  /**
   * Tags for categorization and search
   * Not implemented in MVP, reserved for future feature
   * 
   * @example ["work", "urgent", "client-acme"]
   */
  tags?: string[];

  /**
   * ID of the Chrome window this workspace is associated with
   * Used when reopening workspaces to restore window context
   */
  windowId?: number;
}

/**
 * AI-generated suggestion for creating a workspace
 * Based on auto-grouping heuristics (domain, keywords, time)
 */
export interface WorkspaceSuggestion {
  /**
   * Suggested workspace name
   * Generated from domain patterns or keywords
   * 
   * @example "Development" (multiple GitHub tabs)
   * @example "Shopping" (Amazon, eBay tabs)
   */
  name: string;

  /**
   * Tabs that match this suggestion
   * User can accept, modify, or reject the suggestion
   */
  tabs: Tab[];

  /**
   * Confidence score (0-100)
   * Higher = stronger match based on heuristics
   * 
   * Display suggestions with confidence > 60
   * 
   * @example 85 (very confident)
   * @example 45 (weak suggestion, don't show)
   */
  confidence: number;

  /**
   * Human-readable explanation of why this grouping was suggested
   * Shown to user to help them understand the suggestion
   * 
   * @example "5 tabs from github.com domain"
   * @example "Multiple tabs with 'recipe' in title"
   */
  reason: string;

  /**
   * The heuristic rule that triggered this suggestion
   * Used for analytics and improving the algorithm
   * 
   * @example "domain_clustering"
   * @example "keyword_detection"
   * @example "time_based"
   */
  ruleType: 'domain_clustering' | 'keyword_detection' | 'time_based' | 'custom';

  /**
   * Timestamp when this suggestion was generated
   */
  generatedAt: number;

  /**
   * Optional color recommendation for this workspace
   */
  suggestedColor?: WorkspaceColor;
}

/**
 * Parameters for creating a new workspace
 * Makes certain fields optional for convenience
 */
export type CreateWorkspaceParams = {
  name: string;
  tabs?: Tab[];
  color?: WorkspaceColor;
  description?: string;
  tags?: string[];
};

/**
 * Parameters for updating an existing workspace
 * All fields optional except ID
 */
export type UpdateWorkspaceParams = Partial<Omit<Workspace, 'id' | 'createdAt'>> & {
  id: WorkspaceId;
};

/**
 * Filter criteria for querying workspaces
 */
export interface WorkspaceFilter {
  /**
   * Filter by active status
   */
  isActive?: boolean;

  /**
   * Filter by paused status
   */
  isPaused?: boolean;

  /**
   * Search by name (case-insensitive partial match)
   */
  nameContains?: string;

  /**
   * Filter by tag (exact match)
   */
  hasTag?: string;

  /**
   * Only return workspaces with at least this many tabs
   */
  minTabs?: number;

  /**
   * Only return workspaces with at most this many tabs
   */
  maxTabs?: number;

  /**
   * Only return workspaces used after this timestamp
   */
  usedAfter?: number;

  /**
   * Only return workspaces used before this timestamp
   */
  usedBefore?: number;
}

/**
 * Sort options for workspace lists
 */
export type WorkspaceSortBy = 
  | 'lastUsedAt'    // Most recently used first
  | 'createdAt'     // Newest first
  | 'name'          // Alphabetical
  | 'tabCount';     // Most tabs first

/**
 * Workspace sorting configuration
 */
export interface WorkspaceSortOptions {
  sortBy: WorkspaceSortBy;
  direction: 'asc' | 'desc';
}

/**
 * Statistics about a workspace
 * Used for displaying insights to users
 */
export interface WorkspaceStats {
  /**
   * Total number of tabs in workspace
   */
  tabCount: number;

  /**
   * Number of starred/important tabs
   */
  importantTabCount: number;

  /**
   * Number of discarded (hibernated) tabs
   */
  discardedTabCount: number;

  /**
   * Estimated total memory usage in MB
   * Only available if browser supports memory API
   */
  estimatedMemoryMB?: number;

  /**
   * Most common domain in this workspace
   * Used to show primary context
   * 
   * @example "github.com"
   */
  primaryDomain?: string;

  /**
   * How long ago (in ms) this workspace was last used
   */
  timeSinceLastUse: number;

  /**
   * Number of days this workspace has existed
   */
  ageInDays: number;
}

/**
 * Result of a workspace operation
 */
export interface WorkspaceOperationResult {
  success: boolean;
  workspaceId?: WorkspaceId;
  error?: string;
  /**
   * Additional context about the operation
   */
  message?: string;
}

/**
 * Predefined workspace colors
 * Used in color picker UI
 */
export const WORKSPACE_COLORS = {
  BLUE: '#3B82F6',
  GREEN: '#10B981',
  YELLOW: '#F59E0B',
  RED: '#EF4444',
  PURPLE: '#8B5CF6',
  PINK: '#EC4899',
  GRAY: '#6B7280',
  ORANGE: '#F97316',
} as const;

/**
 * Default workspace color
 */
export const DEFAULT_WORKSPACE_COLOR = WORKSPACE_COLORS.BLUE;

/**
 * Maximum number of workspaces allowed in free tier
 */
export const MAX_FREE_WORKSPACES = 5;

/**
 * Maximum number of tabs recommended per workspace
 * Beyond this, suggest splitting into multiple workspaces
 */
export const RECOMMENDED_MAX_TABS_PER_WORKSPACE = 20;