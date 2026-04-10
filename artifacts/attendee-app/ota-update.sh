#!/usr/bin/env bash
set -euo pipefail

export EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app
export EXPO_PUBLIC_SSL_CERTS=attendee_api

BRANCH="${1:-production}"
MESSAGE="${2:-OTA update}"

echo "=== Tapee Attendee OTA Update ==="
echo "Branch:  $BRANCH"
echo "Domain:  $EXPO_PUBLIC_ATTENDEE_DOMAIN"
echo ""

eas update --branch "$BRANCH" --message "$MESSAGE"
