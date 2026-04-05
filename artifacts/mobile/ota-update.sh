#!/bin/bash
# OTA publish script — always uses production env vars so the bundle
# doesn't accidentally point to the Replit dev API server.
#
# With the fingerprint runtime version policy, EAS will only deliver this
# OTA update to devices whose native binary fingerprint matches the one
# this bundle was built against. Devices running a different native binary
# will skip the update instead of crashing.
set -e

BRANCH="${1:-preview}"
MESSAGE="${2:-OTA update}"

echo "Publishing OTA to branch: $BRANCH"
echo "Message: $MESSAGE"

EXPO_PUBLIC_DOMAIN=prod.tapee.app \
EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
EXPO_PUBLIC_SSL_CERTS=isrg_root_x1 \
GOOGLE_MAPS_API_KEY=AIzaSyCyI7QJ3J5_Peqnr4bqFXAIqaeac1DuT_c \
eas update --branch "$BRANCH" --message "$MESSAGE" --non-interactive
