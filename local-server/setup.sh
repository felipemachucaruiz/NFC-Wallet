#!/usr/bin/env bash
set -euo pipefail

COMPOSE_URL="https://raw.githubusercontent.com/felipemachucaruiz/NFC-Wallet/master/local-server/docker-compose.yml"
WORKDIR="${TAPEE_WORKDIR:-$HOME/tapee-local}"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
die()     { echo -e "${RED}✘ $*${NC}" >&2; exit 1; }

prompt() {
  local var="$1" label="$2" default="${3:-}" secret="${4:-}"
  local value=""
  if [[ -n "$default" ]]; then
    echo -e "${CYAN}$label${NC} [default: $default]: \c" >&2
  else
    echo -e "${CYAN}$label${NC}: \c" >&2
  fi
  if [[ "$secret" == "secret" ]]; then
    read -rs value; echo >&2
  else
    read -r value
  fi
  echo "${value:-$default}"
}

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Tapee Local Server — Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
docker info >/dev/null 2>&1       || die "Docker daemon is not running. Start Docker Desktop and try again."

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  die "docker compose not found. Update Docker Desktop to a recent version."
fi

success "Docker is running  ($($COMPOSE_CMD version --short 2>/dev/null || echo 'ok'))"

# ── 2. Working directory ──────────────────────────────────────────────────────
info "Working directory: $WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# ── 3. Download docker-compose.yml ────────────────────────────────────────────
if [[ -f docker-compose.yml ]]; then
  warn "docker-compose.yml already exists — skipping download."
else
  info "Downloading docker-compose.yml …"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$COMPOSE_URL" -o docker-compose.yml
  else
    wget -qO docker-compose.yml "$COMPOSE_URL"
  fi
  success "docker-compose.yml downloaded."
fi

# ── 4. .env setup ─────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  warn ".env already exists."
  echo -e "  Re-configure? [y/N]: \c"; read -r RECONFIGURE
  if [[ ! "$RECONFIGURE" =~ ^[Yy]$ ]]; then
    info "Keeping existing .env."
    SKIP_ENV=1
  fi
fi

if [[ -z "${SKIP_ENV:-}" ]]; then
  echo ""
  info "Configuring environment variables …"
  echo "(Press Enter to accept defaults where shown)"
  echo ""

  # SESSION_SECRET — auto-generate
  if command -v openssl >/dev/null 2>&1; then
    AUTO_SESSION=$(openssl rand -hex 32)
  else
    AUTO_SESSION=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 64)
  fi
  SESSION_SECRET=$(prompt SESSION_SECRET "SESSION_SECRET (auto-generated if blank)" "$AUTO_SESSION")

  # HMAC_SECRET — must match Railway
  echo ""
  warn "HMAC_SECRET must match the value configured on Railway for NFC verification to work."
  HMAC_SECRET=$(prompt HMAC_SECRET "HMAC_SECRET" "" secret)
  while [[ -z "$HMAC_SECRET" ]]; do
    warn "HMAC_SECRET is required."
    HMAC_SECRET=$(prompt HMAC_SECRET "HMAC_SECRET" "" secret)
  done

  # HMAC_MASTER_KEY — required for KDF events
  echo ""
  warn "HMAC_MASTER_KEY is required if your events use KDF-based NFC signing (most do)."
  warn "Without it, top-ups and transactions will fail with 'clave de firma no disponible'."
  warn "Copy this value from Railway → Variables → HMAC_MASTER_KEY."
  HMAC_MASTER_KEY=$(prompt HMAC_MASTER_KEY "HMAC_MASTER_KEY (leave blank only if events do NOT use KDF)" "" secret)

  # DEMO_SECRET — optional
  echo ""
  info "DEMO_SECRET enables the demo login panel in the mobile app (optional)."
  DEMO_SECRET=$(prompt DEMO_SECRET "DEMO_SECRET (leave blank to disable)" "")

  # LOCAL_SERVER_NAME — optional, shown in admin console
  echo ""
  info "LOCAL_SERVER_NAME is the display name shown in the admin console for this server."
  info "If left blank, the Docker container ID will be used (not recommended)."
  LOCAL_SERVER_NAME=$(prompt LOCAL_SERVER_NAME "LOCAL_SERVER_NAME (e.g. Tapee Medellín, Bar Principal)" "")

  # RAILWAY_SYNC_URL — optional but recommended
  echo ""
  warn "RAILWAY_SYNC_URL enables automatic sync of event data and balances from Railway."
  warn "Without it, the server starts empty. Format: postgres://user:pass@host:port/db"
  RAILWAY_SYNC_URL=$(prompt RAILWAY_SYNC_URL "RAILWAY_SYNC_URL (leave blank to run offline)" "" secret)

  cat > .env <<EOF
SESSION_SECRET=${SESSION_SECRET}
HMAC_SECRET=${HMAC_SECRET}
HMAC_MASTER_KEY=${HMAC_MASTER_KEY}
DEMO_SECRET=${DEMO_SECRET}
LOCAL_SERVER_NAME=${LOCAL_SERVER_NAME}
RAILWAY_SYNC_URL=${RAILWAY_SYNC_URL}
EOF

  success ".env created."
fi

# ── 5. Pull & start ───────────────────────────────────────────────────────────
echo ""
info "Pulling latest image …"
$COMPOSE_CMD pull

echo ""
info "Starting services …"
$COMPOSE_CMD up -d

# ── 6. Health check ───────────────────────────────────────────────────────────
echo ""
info "Waiting for API to become healthy …"
MAX_WAIT=60
ELAPSED=0
until curl -sf http://localhost:3001/api/healthz >/dev/null 2>&1; do
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    warn "API did not respond within ${MAX_WAIT}s. Check logs with:"
    echo "  cd $WORKDIR && $COMPOSE_CMD logs -f api"
    exit 0
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  echo -ne "  ${ELAPSED}s …\r"
done

echo ""
success "Tapee Local Server is running!"
echo ""
echo -e "  API: ${GREEN}http://localhost:3001${NC}"
echo ""
echo "  To view logs:    cd $WORKDIR && $COMPOSE_CMD logs -f api"
echo "  To stop:         cd $WORKDIR && $COMPOSE_CMD down"
echo "  To update image: cd $WORKDIR && $COMPOSE_CMD pull && $COMPOSE_CMD up -d"
echo ""
