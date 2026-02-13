# FocusFlow Extension - Environment Variables Template
# =====================================================
# Copy this file to .env and fill in your actual values
# 
# IMPORTANT: Never commit .env to Git! It's protected by .gitignore
# Only commit this .env.example file (with placeholder values)

# =====================================================
# SUPABASE CONFIGURATION (Required for Premium Features)
# =====================================================
# Get these values from: https://app.supabase.com/project/YOUR_PROJECT/settings/api
#
# Project URL format: https://[project-id].supabase.co
# Find your project ID in Supabase dashboard → Settings → General
PLASMO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co

# Anon/Public Key (safe to use in client-side code)
# This key has Row Level Security (RLS) restrictions
# Find it in: Supabase dashboard → Settings → API → Project API keys → anon/public
PLASMO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# =====================================================
# NOTES & SETUP INSTRUCTIONS
# =====================================================
# 
# 1. Create a Supabase account at https://supabase.com (free tier available)
# 2. Create a new project
# 3. Go to Settings → API
# 4. Copy your Project URL and anon/public key
# 5. Paste them above (replacing the placeholder values)
# 6. Save this file as .env (without .example)
# 
# Security Note:
# - The "anon" key is safe to use in browser extensions
# - It's protected by Row Level Security (RLS) policies
# - Never use the "service_role" key in the extension (it bypasses RLS)
#
# =====================================================
# OPTIONAL: DEVELOPMENT SETTINGS
# =====================================================
# Uncomment these if you want to customize development behavior

# Enable debug logging (shows detailed extension logs)
# PLASMO_PUBLIC_DEBUG=true

# API request timeout in milliseconds (default: 10000)
# PLASMO_PUBLIC_API_TIMEOUT=10000

# Maximum workspaces for free tier (default: 5)
# PLASMO_PUBLIC_MAX_FREE_WORKSPACES=5

# =====================================================
# FOR REFERENCE: Current Supabase Project (Do NOT use these)
# =====================================================
# These are example values from the project documentation
# DO NOT copy these - they won't work for your setup
# 
# Example URL: https://bdtoctmhyylusvutswea.supabase.co
# Example Key: sb_publishable_dXf0R39HDz01g3ytcx5Oiw_r39AkTGr
#
# You must create your OWN Supabase project and use your OWN credentials!