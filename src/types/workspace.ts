/**
 * FocusFlow Extension - Workspace Type Definitions
 * 
 * Defines the core Workspace interface and related types.
 * This is the central data structure for organizing tabs into contextual groups.
 * 
 * @module types/workspace
 */

import type { Tab } from './tab';

/**
 * Workspace - A collection of tabs organized by context
 * 
 * Workspaces allow users to group related tabs together and switch between
 * different contexts (e.g., "Work", "Research", "Shopping") without losing
 * their place.
 * 
 * @example
 * const myWorkspace: Workspace = {
 *   id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 *   name: 'Development',
 *   createdAt: Date.now(),
 *   lastUsedAt: Date.now(),
 *   tabs: [
 *     { id: 1, url: 'https://github.com', title: 'GitHub', ... },
 *     { id: 2, url: 'https://stackoverflow.com', title: 'Stack Overflow', ... },
 *   ],
 *   isActive: true,
 *   isPaused: false,
 *   color: '#3B82F6',
 *   icon: '💻',
 * };
 */
export interface Workspace {
  /**
   * Unique identifier for this workspace (UUID v4)
   * Generated using crypto.randomUUID() or similar
   */
  id: string;
  
  /**
   * User-defined or auto-generated workspace name
   * Examples: "Work", "Research Project", "Shopping", "GitHub Work"
   * 
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  
  /**
   * Unix timestamp when this workspace was created
   * Generated with Date.now()
   */
  createdAt: number;
  
  /**
   * Unix timestamp when this workspace was last opened or modified
   * Updated whenever:
   * - Workspace is resumed
   * - Tabs are added/removed
   * - Workspace is saved to cloud
   */
  lastUsedAt: number;
  
  /**
   * Array of tabs in this workspace
   * Tabs are sorted by the order they were added
   */
  tabs: Tab[];
  
  /**
   * Whether this workspace is currently active
   * 
   * True = Workspace is open in a window right now
   * False = Workspace is paused/saved for later
   * 
   * Only ONE workspace can be active at a time
   */
  isActive: boolean;
  
  /**
   * Whether this workspace's tabs are currently hibernated
   * 
   * True = Tabs are closed/discarded to save RAM (workspace is "paused")
   * False = Tabs are open and active
   * 
   * When paused, tabs can be quickly reopened from saved state
   */
  isPaused: boolean;
  
  /**
   * Optional hex color code for visual coding
   * Used to color-code workspaces in the UI (e.g., left border, badge)
   * 
   * @example "#3B82F6" (blue), "#10B981" (green), "#EF4444" (red)
   * @pattern ^#[0-9A-Fa-f]{6}$
   */
  color?: string;
  
  /**
   * Optional emoji or icon for quick visual identification
   * Used in workspace cards, tabs, and notifications
   * 
   * @example "💼" (work), "🔬" (research), "🛒" (shopping), "📚" (learning)
   * @maxLength 2 (allows single emoji or emoji with modifier)
   */
  icon?: string;
}

/**
 * WorkspaceSuggestion - An auto-generated workspace recommendation
 * 
 * Created by the auto-grouping algorithm when it detects patterns in open tabs.
 * Users can accept suggestions to quickly create workspaces.
 * 
 * @example
 * const suggestion: WorkspaceSuggestion = {
 *   name: 'GitHub Development',
 *   tabs: [
 *     { url: 'https://github.com/user/repo', ... },
 *     { url: 'https://github.com/user/other-repo', ... },
 *   ],
 *   confidence: 85,
 *   reason: 'Same domain (github.com)',
 *   suggestedColor: '#3B82F6',
 *   suggestedIcon: '💻',
 * };
 */
export interface WorkspaceSuggestion {
  /**
   * Suggested workspace name
   * Auto-generated based on:
   * - Common domain (e.g., "GitHub Workspace")
   * - Detected keywords (e.g., "Shopping")
   * - Time of day (e.g., "Work", "Personal")
   * 
   * @example "GitHub Workspace", "Shopping", "Research"
   */
  name: string;
  
  /**
   * Tabs that match this suggestion
   * These are the tabs the algorithm thinks belong together
   */
  tabs: Tab[];
  
  /**
   * Confidence score (0-100)
   * 
   * Higher scores = more confident the grouping makes sense
   * - 90-100: Very strong pattern (e.g., all tabs from same domain)
   * - 70-89: Good pattern (e.g., related keywords)
   * - 60-69: Weak pattern (e.g., time-based guess)
   * - <60: Not shown to user
   * 
   * @min 0
   * @max 100
   */
  confidence: number;
  
  /**
   * Human-readable explanation for this suggestion
   * Shown to user to help them understand why this grouping was suggested
   * 
   * @example
   * - "Same domain (github.com)"
   * - "All tabs contain 'recipe' or 'cooking'"
   * - "Opened during work hours"
   */
  reason: string;
  
  /**
   * Algorithm-suggested color for this workspace
   * Based on category detection (e.g., blue for development, green for shopping)
   * 
   * @example "#3B82F6" (development), "#10B981" (shopping)
   */
  suggestedColor?: string;
  
  /**
   * Algorithm-suggested icon for this workspace
   * Based on category detection
   * 
   * @example "💻" (development), "🛒" (shopping), "📚" (research)
   */
  suggestedIcon?: string;
  
  /**
   * Timestamp when this suggestion was generated
   * Used to expire old suggestions (don't show suggestions from yesterday)
   */
  createdAt?: number;
}

/**
 * WorkspaceMetadata - Computed metadata about a workspace
 * 
 * This is not stored directly, but calculated on-demand from the Workspace object.
 * Useful for displaying stats in the UI.
 * 
 * @example
 * const metadata: WorkspaceMetadata = {
 *   tabCount: 12,
 *   importantTabCount: 3,
 *   totalSize: '2.3 GB',
 *   domains: ['github.com', 'stackoverflow.com'],
 *   lastUsedRelative: '2 hours ago',
 * };
 */
export interface WorkspaceMetadata {
  /**
   * Total number of tabs in workspace
   */
  tabCount: number;
  
  /**
   * Number of tabs marked as important (starred)
   */
  importantTabCount: number;
  
  /**
   * Estimated total memory usage (formatted string)
   * Calculated as: tabCount × 75MB (average per tab)
   * 
   * @example "900 MB", "2.3 GB"
   */
  totalSize: string;
  
  /**
   * Unique domains in this workspace
   * Used to show "Contains tabs from: github.com, docs.google.com"
   */
  domains: string[];
  
  /**
   * Human-readable time since last use
   * 
   * @example "just now", "2 hours ago", "3 days ago"
   */
  lastUsedRelative: string;
}

/**
 * Type guard to check if an object is a valid Workspace
 * Useful for validating data from storage or API
 * 
 * @param obj - Object to check
 * @returns True if object matches Workspace interface
 * 
 * @example
 * if (isWorkspace(data)) {
 *   console.log('Valid workspace:', data.name);
 * }
 */
export function isWorkspace(obj: any): obj is Workspace {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.lastUsedAt === 'number' &&
    Array.isArray(obj.tabs) &&
    typeof obj.isActive === 'boolean' &&
    typeof obj.isPaused === 'boolean' &&
    (obj.color === undefined || typeof obj.color === 'string') &&
    (obj.icon === undefined || typeof obj.icon === 'string')
  );
}

/**
 * Type guard to check if an object is a valid WorkspaceSuggestion
 * 
 * @param obj - Object to check
 * @returns True if object matches WorkspaceSuggestion interface
 */
export function isWorkspaceSuggestion(obj: any): obj is WorkspaceSuggestion {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.tabs) &&
    typeof obj.confidence === 'number' &&
    obj.confidence >= 0 &&
    obj.confidence <= 100 &&
    typeof obj.reason === 'string'
  );
}

/**
 * Default empty workspace (useful for initialization)
 */
export const EMPTY_WORKSPACE: Omit<Workspace, 'id'> = {
  name: 'New Workspace',
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
  tabs: [],
  isActive: false,
  isPaused: false,
};