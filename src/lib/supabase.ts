/**
 * FocusFlow Extension - Supabase Cloud Sync
 * 
 * ARCHITECTURE OVERVIEW:
 * ====================
 * This extension connects to a CENTRALIZED Supabase database owned by the
 * FocusFlow developer (you). All users authenticate and store their data
 * in YOUR Supabase instance. Users do NOT need their own Supabase accounts.
 * 
 * Flow:
 * 1. User signs up in the extension (email/password)
 * 2. Account is created in YOUR Supabase database
 * 3. User's workspaces are encrypted and stored in YOUR database
 * 4. You control the backend, users just use the app
 * 
 * Payment Integration:
 * - Uses Paddle.com for subscription management
 * - Paddle webhook updates subscription status in Supabase
 * 
 * Handles:
 * - Authentication (sign up, sign in, sign out)
 * - Workspace sync (push/pull to YOUR cloud)
 * - Conflict resolution (multi-device edits)
 * - Data encryption (privacy-first approach)
 * - Premium status management (via Paddle)
 * 
 * @module supabase
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { SUPABASE, IS_DEV } from './constants';
import { getWorkspaces, saveWorkspace, updateLastSyncTime } from './storage';
import type { Workspace, UserSettings } from '../types';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Supabase database row structure for workspaces table
 * (Stored in YOUR centralized Supabase database)
 * 
 * IMPORTANT: This interface MUST match the SQL schema exactly!
 * See: FocusFlow Supabase Database Schema (Complete)
 */
interface WorkspaceRow {
  id: string;
  user_id: string;              // References the user in YOUR database
  name: string;
  tabs: string;                 // Encrypted JSON string (JSONB in DB)
  color?: string;               // Hex color for visual coding
  icon?: string;                // Optional emoji/icon
  created_at: string;
  updated_at: string;
  last_synced: string;
  last_used_at: string;
  is_active: boolean;           // Currently open?
  is_paused: boolean;           // Tabs hibernated?
  is_deleted: boolean;          // Soft delete (archived)
  is_shared: boolean;           // Shared with team? (future feature)
  device_id: string;            // Which device created/modified this
  device_name?: string;         // Human-readable device name
  tab_count: number;            // Number of tabs (auto-calculated)
  important_tab_count: number;  // Number of starred tabs (auto-calculated)
}

/**
 * User profile in YOUR Supabase database
 * 
 * IMPORTANT: This interface MUST match the SQL schema exactly!
 * See: FocusFlow Supabase Database Schema (Complete)
 */
interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  last_login?: string;
  
  // Subscription fields
  subscription_tier: 'free' | 'premium' | 'team';
  subscription_status: 'active' | 'canceled' | 'expired' | 'trial';
  subscription_expires_at?: string;
  
  // Paddle integration fields
  paddle_customer_id?: string;      // Paddle's unique customer ID
  paddle_subscription_id?: string;  // Paddle's subscription ID
  paddle_update_url?: string;       // URL for user to update payment info
  paddle_cancel_url?: string;       // URL for user to cancel subscription
  
  // Metadata
  total_workspaces: number;         // Cached workspace count
  last_sync?: string;               // Last cloud sync timestamp
  device_count: number;             // Number of devices using this account
  
  // Preferences
  timezone: string;                 // User's timezone (default: 'UTC')
  language: string;                 // User's language (default: 'en')
}

/**
 * Sync operation result
 */
interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  error?: string;
}

/**
 * Authentication result
 */
interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Subscription tier
 */
type SubscriptionTier = 'free' | 'premium' | 'team';

/**
 * Subscription status
 */
type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'trial';

// =============================================================================
// SUPABASE CLIENT INITIALIZATION
// =============================================================================

/**
 * Initialize Supabase client
 * 
 * IMPORTANT: This connects to YOUR centralized Supabase instance.
 * All users' data is stored in YOUR database, not individual Supabase accounts.
 * 
 * The SUPABASE.URL and SUPABASE.ANON_KEY are YOUR credentials from:
 * https://bdtoctmhyylusvutswea.supabase.co
 */
let supabaseClient: SupabaseClient | null = null;

const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE.URL, SUPABASE.ANON_KEY, {
      auth: {
        // Store session in Chrome storage instead of localStorage
        // (Extensions can't reliably use localStorage)
        storage: {
          getItem: async (key: string) => {
            const result = await chrome.storage.local.get(key);
            return result[key] || null;
          },
          setItem: async (key: string, value: string) => {
            await chrome.storage.local.set({ [key]: value });
          },
          removeItem: async (key: string) => {
            await chrome.storage.local.remove(key);
          },
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Extension doesn't use URL-based auth
      },
    });
  }
  
  return supabaseClient;
};

/**
 * Debug logger for Supabase operations
 */
const logSupabase = (operation: string, ...args: any[]) => {
  if (IS_DEV) {
    console.log(`[Supabase] ${operation}:`, ...args);
  }
};

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Signs up a new user with email and password
 * 
 * This creates a NEW account in YOUR Supabase database (not the user's own).
 * The user is signing up for FocusFlow, and their data will be stored in
 * YOUR centralized backend.
 * 
 * @param email - User email
 * @param password - User password (min 6 characters)
 * @returns Promise with auth result
 * 
 * @example
 * const result = await signUp('user@example.com', 'password123');
 * if (result.success) {
 *   console.log('User created in YOUR database:', result.user);
 * }
 */
export const signUp = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  try {
    const supabase = getSupabaseClient();
    
    // Create user in YOUR Supabase database
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      logSupabase('SIGN_UP_ERROR', error);
      return {
        success: false,
        error: error.message,
      };
    }
    
    // Initialize user profile in YOUR database
    if (data.user) {
      await supabase.from(SUPABASE.TABLES.USERS).upsert({
        id: data.user.id,
        email: data.user.email,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        subscription_tier: 'free', // Default to free tier
        subscription_status: 'active',
        total_workspaces: 0,
        device_count: 1,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        language: navigator.language.split('-')[0] || 'en', // 'en' from 'en-US'
      });
    }
    
    logSupabase('SIGN_UP_SUCCESS', data.user?.email);
    
    return {
      success: true,
      user: data.user || undefined,
    };
  } catch (error) {
    console.error('Sign up error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during sign up',
    };
  }
};

/**
 * Signs in an existing user
 * 
 * Authenticates the user against YOUR Supabase database.
 * 
 * @param email - User email
 * @param password - User password
 * @returns Promise with auth result
 */
export const signIn = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      logSupabase('SIGN_IN_ERROR', error);
      return {
        success: false,
        error: error.message,
      };
    }
    
    // Update last_login timestamp
    if (data.user) {
      await supabase.from(SUPABASE.TABLES.USERS).update({
        last_login: new Date().toISOString(),
      }).eq('id', data.user.id);
    }
    
    logSupabase('SIGN_IN_SUCCESS', data.user?.email);
    
    return {
      success: true,
      user: data.user,
    };
  } catch (error) {
    console.error('Sign in error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during sign in',
    };
  }
};

/**
 * Signs out the current user
 * 
 * @returns Promise with operation result
 */
export const signOut = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      logSupabase('SIGN_OUT_ERROR', error);
      return {
        success: false,
        error: error.message,
      };
    }
    
    logSupabase('SIGN_OUT_SUCCESS');
    
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during sign out',
    };
  }
};

/**
 * Gets the current authenticated user
 * 
 * @returns Promise with user or null if not authenticated
 */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const supabase = getSupabaseClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    
    return user;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

/**
 * Gets the current session
 * 
 * @returns Promise with session or null if not authenticated
 */
export const getCurrentSession = async (): Promise<Session | null> => {
  try {
    const supabase = getSupabaseClient();
    
    const { data: { session } } = await supabase.auth.getSession();
    
    return session;
  } catch (error) {
    console.error('Get session error:', error);
    return null;
  }
};

/**
 * Checks if user is currently authenticated
 * 
 * @returns Promise with boolean
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user !== null;
};

/**
 * Sends a password reset email
 * 
 * @param email - User email
 * @returns Promise with operation result
 */
export const resetPassword = async (
  email: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://focusflow.app/reset-password', // Your website
    });
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Reset password error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
};

/**
 * Gets user profile from YOUR database
 * 
 * @returns Promise with user profile or null
 */
export const getUserProfile = async (): Promise<UserProfile | null> => {
  try {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    
    if (!user) return null;
    
    const { data, error } = await supabase
      .from(SUPABASE.TABLES.USERS)
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) {
      logSupabase('GET_PROFILE_ERROR', error);
      return null;
    }
    
    return data as UserProfile;
  } catch (error) {
    console.error('Get user profile error:', error);
    return null;
  }
};

// =============================================================================
// DATA ENCRYPTION (PRIVACY-FIRST)
// =============================================================================

/**
 * Simple base64 encryption for workspace data
 * 
 * NOTE: For MVP, we use basic base64 encoding.
 * TODO: Upgrade to AES-256 encryption for production release.
 * 
 * Even with basic encoding, only you (database owner) can access the data.
 * Users can't read each other's workspaces due to Supabase Row Level Security (RLS).
 * 
 * @param data - Data to encrypt
 * @param key - Encryption key (user's ID)
 * @returns Encrypted string
 */
const encrypt = (data: string, key: string): string => {
  try {
    // For MVP: base64 encoding
    // For production: Replace with crypto-js AES encryption
    const encrypted = btoa(data);
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return data;
  }
};

/**
 * Decrypts encrypted workspace data
 * 
 * @param encryptedData - Encrypted string
 * @param key - Decryption key
 * @returns Decrypted string
 */
const decrypt = (encryptedData: string, key: string): string => {
  try {
    const decrypted = atob(encryptedData);
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedData;
  }
};

// =============================================================================
// CLOUD SYNC OPERATIONS
// =============================================================================

/**
 * Pushes local workspaces to YOUR Supabase database
 * 
 * @param workspaces - Array of workspaces to push
 * @returns Promise with number of workspaces pushed
 */
export const pushWorkspaces = async (
  workspaces: Workspace[]
): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    
    if (!user) {
      return {
        success: false,
        count: 0,
        error: 'User not authenticated',
      };
    }
    
    // Get device ID (unique identifier for this browser)
    const deviceId = await getDeviceId();
    const deviceName = await getDeviceName();
    
    // Convert workspaces to database format
    const rows: Partial<WorkspaceRow>[] = workspaces.map(workspace => ({
      id: workspace.id,
      user_id: user.id,
      name: workspace.name,
      tabs: encrypt(JSON.stringify(workspace.tabs), user.id), // Encrypt tabs
      color: workspace.color || null,
      icon: workspace.icon || null,
      created_at: new Date(workspace.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
      last_synced: new Date().toISOString(),
      last_used_at: new Date(workspace.lastUsedAt).toISOString(),
      is_active: workspace.isActive || false,
      is_paused: workspace.isPaused || false,
      is_deleted: false,
      is_shared: false, // Future feature
      device_id: deviceId,
      device_name: deviceName,
      // tab_count and important_tab_count are auto-calculated by database trigger
    }));
    
    // Upsert workspaces (insert or update if exists)
    // This stores data in YOUR database, tied to the user's ID
    const { error } = await supabase
      .from(SUPABASE.TABLES.WORKSPACES)
      .upsert(rows, { onConflict: 'id' });
    
    if (error) {
      logSupabase('PUSH_ERROR', error);
      return {
        success: false,
        count: 0,
        error: error.message,
      };
    }
    
    logSupabase('PUSH_SUCCESS', `Pushed ${workspaces.length} workspaces`);
    
    // Update last sync timestamp
    await updateLastSyncTime();
    
    return {
      success: true,
      count: workspaces.length,
    };
  } catch (error) {
    console.error('Push workspaces error:', error);
    return {
      success: false,
      count: 0,
      error: 'An unexpected error occurred during push',
    };
  }
};

/**
 * Pulls workspaces from YOUR Supabase database
 * 
 * Due to Row Level Security (RLS) policies, users can only access
 * their own workspaces, not other users' data.
 * 
 * @returns Promise with array of workspaces from cloud
 */
export const pullWorkspaces = async (): Promise<{
  success: boolean;
  workspaces: Workspace[];
  error?: string;
}> => {
  try {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    
    if (!user) {
      return {
        success: false,
        workspaces: [],
        error: 'User not authenticated',
      };
    }
    
    // Fetch THIS user's workspaces from YOUR database
    // RLS ensures they can only see their own data
    const { data, error } = await supabase
      .from(SUPABASE.TABLES.WORKSPACES)
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('last_synced', { ascending: false });
    
    if (error) {
      logSupabase('PULL_ERROR', error);
      return {
        success: false,
        workspaces: [],
        error: error.message,
      };
    }
    
    // Convert database rows to Workspace objects
    const workspaces: Workspace[] = (data as WorkspaceRow[]).map(row => {
      const tabs = JSON.parse(decrypt(row.tabs, user.id));
      
      return {
        id: row.id,
        name: row.name,
        tabs,
        color: row.color,
        icon: row.icon,
        createdAt: new Date(row.created_at).getTime(),
        lastUsedAt: new Date(row.last_used_at).getTime(),
        isActive: row.is_active,
        isPaused: row.is_paused,
      };
    });
    
    logSupabase('PULL_SUCCESS', `Pulled ${workspaces.length} workspaces`);
    
    return {
      success: true,
      workspaces,
    };
  } catch (error) {
    console.error('Pull workspaces error:', error);
    return {
      success: false,
      workspaces: [],
      error: 'An unexpected error occurred during pull',
    };
  }
};

/**
 * Syncs workspaces bidirectionally (push local, pull remote, merge)
 * 
 * Strategy: Last-write-wins conflict resolution
 * 
 * @returns Promise with sync result
 */
export const syncWorkspaces = async (): Promise<SyncResult> => {
  try {
    logSupabase('SYNC_START');
    
    // Get local workspaces
    const localWorkspaces = await getWorkspaces();
    
    // Push local workspaces to YOUR database
    const pushResult = await pushWorkspaces(localWorkspaces);
    
    if (!pushResult.success) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        error: pushResult.error,
      };
    }
    
    // Pull workspaces from YOUR database
    const pullResult = await pullWorkspaces();
    
    if (!pullResult.success) {
      return {
        success: false,
        pushed: pushResult.count,
        pulled: 0,
        conflicts: 0,
        error: pullResult.error,
      };
    }
    
    // Merge cloud workspaces with local (last-write-wins)
    const cloudWorkspaces = pullResult.workspaces;
    const mergedWorkspaces = [...localWorkspaces];
    let conflicts = 0;
    
    for (const cloudWorkspace of cloudWorkspaces) {
      const localIndex = mergedWorkspaces.findIndex(w => w.id === cloudWorkspace.id);
      
      if (localIndex === -1) {
        // Workspace only exists in cloud, add it
        mergedWorkspaces.push(cloudWorkspace);
      } else {
        // Workspace exists in both, check which is newer
        const localWorkspace = mergedWorkspaces[localIndex];
        
        if (cloudWorkspace.lastUsedAt > localWorkspace.lastUsedAt) {
          // Cloud version is newer, replace local
          mergedWorkspaces[localIndex] = cloudWorkspace;
          conflicts++;
        }
        // Else: Local is newer, keep it (already pushed to cloud)
      }
    }
    
    // Save merged workspaces to local storage
    for (const workspace of mergedWorkspaces) {
      await saveWorkspace(workspace);
    }
    
    // Update last sync time
    await updateLastSyncTime();
    
    logSupabase('SYNC_COMPLETE', {
      pushed: pushResult.count,
      pulled: cloudWorkspaces.length,
      conflicts,
    });
    
    return {
      success: true,
      pushed: pushResult.count,
      pulled: cloudWorkspaces.length,
      conflicts,
    };
  } catch (error) {
    console.error('Sync error:', error);
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      error: 'An unexpected error occurred during sync',
    };
  }
};

/**
 * Deletes a workspace from YOUR cloud database
 * 
 * @param workspaceId - Workspace ID to delete
 * @returns Promise with operation result
 */
export const deleteCloudWorkspace = async (
  workspaceId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const supabase = getSupabaseClient();
    const user = await getCurrentUser();
    
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }
    
    // Soft delete (mark as deleted, don't actually remove)
    const { error } = await supabase
      .from(SUPABASE.TABLES.WORKSPACES)
      .update({ is_deleted: true })
      .eq('id', workspaceId)
      .eq('user_id', user.id);
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Delete cloud workspace error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
};

// =============================================================================
// PADDLE PAYMENT INTEGRATION
// =============================================================================

/**
 * Initializes Paddle checkout for premium subscription
 * 
 * PADDLE SETUP REQUIRED:
 * 1. Create account at paddle.com
 * 2. Create product: "FocusFlow Premium"
 * 3. Create pricing plans (monthly/yearly)
 * 4. Get your Vendor ID and Product IDs
 * 5. Set up webhook endpoint to receive subscription events
 * 
 * @param plan - 'monthly' or 'yearly'
 * @returns Promise with checkout result
 */
export const initiatePaddleCheckout = async (
  plan: 'monthly' | 'yearly'
): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return {
        success: false,
        error: 'User must be logged in to upgrade',
      };
    }
    
    // Paddle product IDs (you'll get these from paddle.com dashboard)
    const PADDLE_VENDOR_ID = 'YOUR_PADDLE_VENDOR_ID'; // Replace with your Paddle Vendor ID
    const PRODUCT_IDS = {
      monthly: 'YOUR_MONTHLY_PRODUCT_ID', // Replace with your monthly plan ID
      yearly: 'YOUR_YEARLY_PRODUCT_ID',   // Replace with your yearly plan ID
    };
    
    // Initialize Paddle.js (load script if not already loaded)
    if (typeof (window as any).Paddle === 'undefined') {
      await loadPaddleScript(PADDLE_VENDOR_ID);
    }
    
    const Paddle = (window as any).Paddle;
    
    // Open Paddle checkout
    Paddle.Checkout.open({
      product: PRODUCT_IDS[plan],
      email: user.email,
      passthrough: JSON.stringify({
        user_id: user.id,
        plan: plan,
      }),
      successCallback: (data: any) => {
        console.log('Paddle checkout success:', data);
        // Paddle webhook will update subscription status in YOUR database
      },
      closeCallback: () => {
        console.log('Paddle checkout closed');
      },
    });
    
    return { success: true };
  } catch (error) {
    console.error('Paddle checkout error:', error);
    return {
      success: false,
      error: 'Failed to initiate checkout',
    };
  }
};

/**
 * Loads Paddle.js script dynamically
 * 
 * @param vendorId - Your Paddle vendor ID
 */
const loadPaddleScript = (vendorId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).Paddle !== 'undefined') {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.onload = () => {
      (window as any).Paddle.Setup({ vendor: parseInt(vendorId) });
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

/**
 * Handles Paddle webhook events
 * 
 * NOTE: This function should be called by YOUR backend server
 * when it receives webhook events from Paddle, not directly from the extension.
 * 
 * Paddle will send webhooks to YOUR server, which then updates YOUR Supabase database.
 * 
 * @param webhookData - Data from Paddle webhook
 */
export const handlePaddleWebhook = async (webhookData: {
  alert_name: string;
  user_id: string;
  subscription_id: string;
  status: string;
  next_payment_date?: string;
  cancellation_effective_date?: string;
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const supabase = getSupabaseClient();
    
    // Parse passthrough data (contains user_id)
    const passthrough = JSON.parse(webhookData.user_id);
    const userId = passthrough.user_id;
    
    // Handle different webhook events
    switch (webhookData.alert_name) {
      case 'subscription_created':
      case 'subscription_updated':
        // Upgrade user to premium in YOUR database
        await supabase
          .from(SUPABASE.TABLES.USERS)
          .update({
            subscription_tier: 'premium',
            paddle_subscription_id: webhookData.subscription_id,
            subscription_status: 'active',
            subscription_expires_at: webhookData.next_payment_date,
          })
          .eq('id', userId);
        break;
      
      case 'subscription_cancelled':
        // Mark subscription as canceled (access continues until expiry)
        await supabase
          .from(SUPABASE.TABLES.USERS)
          .update({
            subscription_status: 'canceled',
            subscription_expires_at: webhookData.cancellation_effective_date,
          })
          .eq('id', userId);
        break;
      
      case 'subscription_payment_failed':
        // Handle payment failure
        await supabase
          .from(SUPABASE.TABLES.USERS)
          .update({
            subscription_status: 'expired',
            subscription_tier: 'free',
          })
          .eq('id', userId);
        break;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Paddle webhook error:', error);
    return {
      success: false,
      error: 'Failed to process webhook',
    };
  }
};

// =============================================================================
// PREMIUM SUBSCRIPTION MANAGEMENT
// =============================================================================

/**
 * Gets user's subscription tier from YOUR Supabase database
 * 
 * @returns Promise with subscription tier
 */
export const getSubscriptionTier = async (): Promise<SubscriptionTier> => {
  try {
    const profile = await getUserProfile();
    
    if (!profile) {
      return 'free';
    }
    
    // Check if subscription has expired
    if (profile.subscription_tier === 'premium' || profile.subscription_tier === 'team') {
      if (profile.subscription_status === 'expired') {
        return 'free';
      }
      
      if (profile.subscription_expires_at) {
        const expiryDate = new Date(profile.subscription_expires_at);
        if (expiryDate < new Date()) {
          // Expired, downgrade to free
          return 'free';
        }
      }
    }
    
    return profile.subscription_tier || 'free';
  } catch (error) {
    console.error('Get subscription tier error:', error);
    return 'free';
  }
};

/**
 * Checks if user has premium access
 * 
 * @returns Promise with boolean
 */
export const isPremiumUser = async (): Promise<boolean> => {
  const tier = await getSubscriptionTier();
  return tier === 'premium' || tier === 'team';
};

/**
 * Updates user's subscription tier in YOUR database
 * (Called by YOUR backend after Paddle webhook)
 * 
 * @param userId - User ID
 * @param tier - New subscription tier
 * @returns Promise with operation result
 */
export const updateSubscriptionTier = async (
  userId: string,
  tier: SubscriptionTier
): Promise<{ success: boolean; error?: string }> => {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from(SUPABASE.TABLES.USERS)
      .update({ subscription_tier: tier })
      .eq('id', userId);
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Update subscription tier error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
};

/**
 * Gets user's subscription status details
 * 
 * @returns Promise with subscription details
 */
export const getSubscriptionStatus = async (): Promise<{
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt?: Date;
  isPremium: boolean;
  deviceName?: string;
  totalWorkspaces?: number;
}> => {
  const profile = await getUserProfile();
  const tier = await getSubscriptionTier();
  const isPremium = await isPremiumUser();
  
  return {
    tier,
    status: (profile?.subscription_status as SubscriptionStatus) || 'active',
    expiresAt: profile?.subscription_expires_at ? new Date(profile.subscription_expires_at) : undefined,
    isPremium,
    deviceName: await getDeviceName(),
    totalWorkspaces: profile?.total_workspaces,
  };
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generates or retrieves a unique device ID for this browser
 * Used to track which device made changes to workspaces
 * 
 * @returns Promise with device ID
 */
const getDeviceId = async (): Promise<string> => {
  const DEVICE_ID_KEY = 'focusflow_device_id';
  
  // Check if device ID already exists
  const result = await chrome.storage.local.get(DEVICE_ID_KEY);
  
  if (result[DEVICE_ID_KEY]) {
    return result[DEVICE_ID_KEY];
  }
  
  // Generate new device ID
  const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId });
  
  return deviceId;
};

/**
 * Generates or retrieves a human-readable device name
 * Used to help users identify which device made changes
 * 
 * @returns Promise with device name
 */
const getDeviceName = async (): Promise<string> => {
  const DEVICE_NAME_KEY = 'focusflow_device_name';
  
  // Check if device name already exists
  const result = await chrome.storage.local.get(DEVICE_NAME_KEY);
  
  if (result[DEVICE_NAME_KEY]) {
    return result[DEVICE_NAME_KEY];
  }
  
  // Generate device name based on platform
  let deviceName = 'Unknown Device';
  
  try {
    // Get platform info from Chrome API
    const platformInfo = await chrome.runtime.getPlatformInfo();
    const os = platformInfo.os; // 'mac', 'win', 'linux', 'chromeos', 'android'
    
    // Create friendly name
    const osNames: Record<string, string> = {
      'mac': 'Mac',
      'win': 'Windows PC',
      'linux': 'Linux PC',
      'chromeos': 'Chromebook',
      'android': 'Android Phone',
    };
    
    const baseName = osNames[os] || 'Computer';
    const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    deviceName = `${baseName} (${timestamp})`;
  } catch (error) {
    console.warn('Failed to get platform info:', error);
    deviceName = `Device ${new Date().toLocaleDateString()}`;
  }
  
  await chrome.storage.local.set({ [DEVICE_NAME_KEY]: deviceName });
  
  return deviceName;
};

/**
 * Tests connection to YOUR Supabase database
 * Useful for debugging connectivity issues
 * 
 * @returns Promise with connection status
 */
export const testConnection = async (): Promise<{
  success: boolean;
  latency?: number;
  error?: string;
}> => {
  try {
    const startTime = Date.now();
    const supabase = getSupabaseClient();
    
    // Simple query to test connection
    const { error } = await supabase
      .from(SUPABASE.TABLES.USERS)
      .select('id')
      .limit(1);
    
    const latency = Date.now() - startTime;
    
    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }
    
    return {
      success: true,
      latency,
    };
  } catch (error) {
    console.error('Connection test error:', error);
    return {
      success: false,
      error: 'Failed to connect to Supabase',
    };
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Export all Supabase functions as a single object
 */
export const supabase = {
  // Client
  getClient: getSupabaseClient,
  
  // Auth
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getCurrentSession,
  isAuthenticated,
  resetPassword,
  getUserProfile,
  
  // Sync
  pushWorkspaces,
  pullWorkspaces,
  syncWorkspaces,
  deleteCloudWorkspace,
  
  // Payment (Paddle)
  initiatePaddleCheckout,
  handlePaddleWebhook,
  
  // Premium
  getSubscriptionTier,
  isPremiumUser,
  updateSubscriptionTier,
  getSubscriptionStatus,
  
  // Utilities
  testConnection,
};