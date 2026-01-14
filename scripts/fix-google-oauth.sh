#!/bin/bash

# Google OAuth Fix - Environment Variable Setup
# The issue: Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment

echo "🔧 Google OAuth Authentication Fix"
echo "===================================="
echo ""
echo "Issue: Google login was failing due to missing NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo ""
echo "✅ LOCAL: Fixed in .env.vercel.local"
echo ""
echo "⚠️  VERCEL: You need to add this environment variable in Vercel dashboard:"
echo ""
echo "1. Go to: https://vercel.com/dashboard"
echo "2. Select your Slurpy project"
echo "3. Go to Settings → Environment Variables"
echo "4. Add a new variable:"
echo "   - Key: NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "   - Value: (same value as SUPABASE_ANON_KEY)"
echo "   - Environments: Production, Preview, Development"
echo ""
echo "5. Redeploy after adding the variable"
echo ""
echo "The local dev server should now work with Google OAuth."
echo "Test at: http://localhost:3000/sign-in"
