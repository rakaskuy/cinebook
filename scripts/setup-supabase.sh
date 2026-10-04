#!/usr/bin/env bash
set -e

# Cinemanik 2026 - Supabase Provisioning Helper
# Usage: ./scripts/setup-supabase.sh <sbp_access_token> <project_ref_or_url>

TOKEN="$1"
PROJECT="$2"

if [ -z "$TOKEN" ]; then
  echo "Masukkan Supabase Personal Access Token:"
  read -r TOKEN
fi

if [ -z "$PROJECT" ]; then
  echo "Masukkan Supabase Project ID / URL (contoh: jylapjrkedpbrtobvkvb):"
  read -r PROJECT
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$DIR/setup-supabase.mjs" --token "$TOKEN" --project "$PROJECT"
