#!/bin/bash
# OTA publish script for attendee app — always preview branch, always production domain.
set -e

MESSAGE="${1:-OTA update}"

echo "Publishing attendee app OTA to branch: preview"
echo "Message: $MESSAGE"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
EXPO_PUBLIC_SSL_CERTS=attendee_api \
eas update --branch preview --message "$MESSAGE" --non-interactive
