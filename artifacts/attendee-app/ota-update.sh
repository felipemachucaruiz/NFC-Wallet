#!/bin/bash
# OTA publish script for attendee app — always pushes to BOTH preview AND production.
#
# Env vars must match what EAS Build uses in eas.json (production-apk profile).
# SSL pinning is handled at the native/OS level via withNetworkSecurityConfig plugin —
# no JS-level SSL env var is needed.
set -e

MESSAGE="${1:-OTA update}"

echo "Publishing attendee app OTA to branch: preview"
echo "Message: $MESSAGE"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
eas update --branch preview --message "$MESSAGE" --non-interactive

echo ""
echo "Publishing attendee app OTA to branch: production"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
eas update --branch production --message "$MESSAGE" --non-interactive
