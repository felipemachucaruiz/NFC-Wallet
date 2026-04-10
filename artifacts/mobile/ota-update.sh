#!/usr/bin/env bash
set -euo pipefail

export EXPO_PUBLIC_DOMAIN=prod.tapee.app
export EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app
export EXPO_PUBLIC_SSL_CERTS=tapee_api,attendee_api

BRANCH="${1:-production}"
MESSAGE="${2:-OTA update}"

echo "=== Tapee Staff OTA Update ==="
echo "Branch:  $BRANCH"
echo "Domain:  $EXPO_PUBLIC_DOMAIN"
echo "Attendee Domain: $EXPO_PUBLIC_ATTENDEE_DOMAIN"
echo ""

eas update --branch "$BRANCH" --message "$MESSAGE"
