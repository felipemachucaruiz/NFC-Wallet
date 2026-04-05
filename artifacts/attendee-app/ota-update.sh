#!/bin/bash
# OTA publish script for attendee app — always pushes to BOTH preview AND production.
# Uses the same SSL cert env var as the native builds (tapee_api,attendee_api) to
# prevent a native/JS mismatch that would crash the app on launch.
#
# With the fingerprint runtime version policy, EAS gates OTA delivery to devices
# whose native binary fingerprint matches. Do NOT pass EAS_SKIP_AUTO_FINGERPRINT
# here — bypassing fingerprint gating defeats the crash-prevention mechanism.
set -e

MESSAGE="${1:-OTA update}"

echo "Publishing attendee app OTA to branch: preview"
echo "Message: $MESSAGE"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
EXPO_PUBLIC_SSL_CERTS=isrg_root_x1 \
eas update --branch preview --message "$MESSAGE" --non-interactive

echo ""
echo "Publishing attendee app OTA to branch: production"

EXPO_PUBLIC_ATTENDEE_DOMAIN=attendee.tapee.app \
EXPO_PUBLIC_SSL_CERTS=isrg_root_x1 \
eas update --branch production --message "$MESSAGE" --non-interactive
