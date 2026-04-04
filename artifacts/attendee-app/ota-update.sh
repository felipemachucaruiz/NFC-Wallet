#!/bin/bash
# OTA publish script for attendee app — always pushes to BOTH preview AND production.
set -e

MESSAGE="${1:-OTA update}"

echo "Publishing attendee app OTA to branch: preview"
echo "Message: $MESSAGE"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
EXPO_PUBLIC_SSL_CERTS=attendee_api \
EAS_SKIP_AUTO_FINGERPRINT=1 \
eas update --branch preview --message "$MESSAGE" --non-interactive

echo ""
echo "Publishing attendee app OTA to branch: production"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
EXPO_PUBLIC_SSL_CERTS=attendee_api \
EAS_SKIP_AUTO_FINGERPRINT=1 \
eas update --branch production --message "$MESSAGE" --non-interactive
