#!/bin/bash
# OTA publish script — always uses production env vars so the bundle
# doesn't accidentally point to the Replit dev API server.
#
# SSL pinning is handled at the native/OS level via withNetworkSecurityConfig plugin —
# no JS-level SSL env var is needed.
set -e

BRANCH="${1:-preview}"
MESSAGE="${2:-OTA update}"

echo "Publishing OTA to branch: $BRANCH"
echo "Message: $MESSAGE"

EXPO_PUBLIC_DOMAIN=prod.tapee.app \
EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
GOOGLE_MAPS_API_KEY=AIzaSyCyI7QJ3J5_Peqnr4bqFXAIqaeac1DuT_c \
eas update --branch "$BRANCH" --message "$MESSAGE" --non-interactive
