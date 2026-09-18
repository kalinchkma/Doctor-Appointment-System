#!/usr/bin/env bash
# Deploy Payload CMS (public), Go RAG (internal), and packed Ollama (llama3.2 +
# nomic-embed-text) behind nginx.
#
# Usage:
#   ./infrastructure/nginx/deploy.sh              # Compose stack (auto-detects EC2)
#   ./infrastructure/nginx/deploy.sh --ec2        # Force EC2 overlay (no published DB ports)
#   ./infrastructure/nginx/deploy.sh --bootstrap  # Install Docker, then start the stack
#   ./infrastructure/nginx/deploy.sh --host       # Host nginx → 127.0.0.1:3000
#   ./infrastructure/nginx/deploy.sh --status
#   ./infrastructure/nginx/deploy.sh --down
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_BASE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/infrastructure/docker/docker-compose.yml")
EC2_OVERLAY="$ROOT/infrastructure/docker/docker-compose.ec2.yml"
HOST_SITE_NAME="doctor-appointment"

mode="docker"
action="up"
force_ec2=0
bootstrap=0

usage() {
  cat <<'EOF'
Deploy Payload + Go RAG + Ollama with nginx as the public edge.

  ./infrastructure/nginx/deploy.sh              Start/update Compose (cms, rag, ollama, nginx)
  ./infrastructure/nginx/deploy.sh --ec2        Same, plus hide Mongo/Redis/Payload host ports
  ./infrastructure/nginx/deploy.sh --bootstrap  Install Docker Engine, then start the stack
  ./infrastructure/nginx/deploy.sh --host       Install/reload host nginx → 127.0.0.1:3000
  ./infrastructure/nginx/deploy.sh --status
  ./infrastructure/nginx/deploy.sh --down

Default LLM (pulled on first boot):
  chat       llama3.2
  embeddings nomic-embed-text (768)

The Go RAG process stays on the Compose network (http://rag:8080). nginx does
not proxy it, and /api/internal/* is denied from the public listener.
EOF
}

is_ec2() {
  curl -fsS --max-time 1 -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" >/dev/null 2>&1
}

ec2_public_ip() {
  local token
  token="$(curl -fsS --max-time 2 -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)"
  if [[ -z "$token" ]]; then
    return 0
  fi
  curl -fsS --max-time 2 -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true
}

lan_ip() {
  local aws
  aws="$(ec2_public_ip || true)"
  if [[ -n "${aws:-}" ]]; then
    printf '%s\n' "$aws"
    return 0
  fi
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  elif command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

compose() {
  if [[ "$force_ec2" -eq 1 ]] || is_ec2; then
    "${COMPOSE_BASE[@]}" -f "$EC2_OVERLAY" "$@"
  else
    "${COMPOSE_BASE[@]}" "$@"
  fi
}

require_env() {
  if [[ ! -f "$ROOT/.env" ]]; then
    echo "Missing $ROOT/.env — copy .env.example and fill the secrets first." >&2
    echo "On EC2 set PAYLOAD_PUBLIC_URL=http://<elastic-ip> (no :3000)." >&2
    exit 1
  fi
}

warn_public_url() {
  local url
  url="$(grep -E '^PAYLOAD_PUBLIC_URL=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"'")"
  if [[ "$url" == *':3000'* ]]; then
    echo "PAYLOAD_PUBLIC_URL is $url" >&2
    echo "Behind nginx, drop :3000 (EC2 overlay does not publish Payload on 3000):" >&2
    echo "  PAYLOAD_PUBLIC_URL=http://<elastic-ip>" >&2
    echo "Then: recreate the cms container so Payload picks up the URL." >&2
  fi
}

require_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi
  echo "Docker Engine + Compose v2 are required." >&2
  echo "Re-run with --bootstrap on Ubuntu/Amazon Linux, or install Docker manually." >&2
  exit 1
}

# Packed Ollama (~4 GiB image + ~2.5 GiB models) plus Atlas Local (JDK/mongot)
# need far more than the default 8 GiB Ubuntu AMI volume.
require_disk_space() {
  local min_gb="${1:-20}"
  local docker_root path avail_kb need_kb
  docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  path="${docker_root:-/var/lib/docker}"
  [[ -d "$path" ]] || path="/"
  avail_kb="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
  need_kb=$((min_gb * 1024 * 1024))
  if [[ -z "$avail_kb" ]]; then
    return 0
  fi
  if ((avail_kb < need_kb)); then
    echo "Not enough disk for Atlas Local + packed Ollama." >&2
    echo "Need ~${min_gb} GiB free on $path; have $((avail_kb / 1024 / 1024)) GiB." >&2
    df -h "$path" >&2 || true
    echo >&2
    echo "The default Ubuntu AMI is 8 GiB. In AWS Console: EC2 → Volumes → this instance's" >&2
    echo "root volume → Actions → Modify volume → 40 GiB. Then on the instance:" >&2
    echo "  sudo growpart /dev/nvme0n1 1    # or /dev/xvda 1" >&2
    echo "  sudo resize2fs /dev/nvme0n1p1   # or xfs_growfs /" >&2
    echo "  sudo docker system prune -af    # drop the failed incomplete pull" >&2
    echo "Then re-run: ./infrastructure/nginx/deploy.sh --ec2" >&2
    exit 1
  fi
}

cmd_bootstrap() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker already installed."
    return 0
  fi
  if [[ "$(id -u)" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
    echo "Need root or sudo to install Docker." >&2
    exit 1
  fi
  echo "Installing Docker Engine…"
  curl -fsSL https://get.docker.com | sh
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now docker
  fi
  if [[ "$(id -u)" -ne 0 ]]; then
    sudo usermod -aG docker "$USER" || true
    echo "Log out and back in (or run: newgrp docker) so this user can run docker without sudo."
  fi
}

print_urls() {
  local ip
  ip="$(lan_ip)"
  echo
  echo "Public edge (nginx → Payload):"
  echo "  Admin     http://127.0.0.1/admin"
  echo "  API       http://127.0.0.1/api"
  if [[ -n "${ip:-}" ]]; then
    echo "  Public    http://$ip/admin"
    echo "  Public    http://$ip/api"
    echo
    echo "Point the APK at nginx (no :3000):"
    echo "  VITE_PAYLOAD_URL=http://$ip"
    echo "  PAYLOAD_PUBLIC_URL=http://$ip"
    echo "Then rebuild: pnpm --filter @doctor-app/mobile build:apk"
  fi
  echo
  echo "Packed LLM: Ollama llama3.2 (chat) + nomic-embed-text (embeddings)."
  echo "Go RAG remains internal. These should fail from the internet:"
  echo "  curl http://$ip:8080/healthz"
  echo "  curl http://$ip/api/internal/rag-settings"
}

wait_http() {
  local url="$1"
  local tries="${2:-30}"
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

wait_ollama_models() {
  echo "Waiting for Ollama to finish pulling llama3.2 and nomic-embed-text…"
  local i
  for i in $(seq 1 120); do
    if compose exec -T ollama ollama list 2>/dev/null | grep -q 'nomic-embed-text' \
      && compose exec -T ollama ollama list 2>/dev/null | grep -q 'llama3.2'; then
      echo "Default Ollama models are present."
      compose exec -T ollama ollama list
      return 0
    fi
    sleep 10
  done
  echo "Timed out waiting for Ollama models. Check: docker compose logs ollama-pull" >&2
  return 1
}

cmd_up_docker() {
  require_env
  warn_public_url
  require_docker
  require_disk_space 20
  if [[ "$force_ec2" -eq 1 ]] || is_ec2; then
    echo "Starting EC2 stack (nginx :80 only; Ollama packed inside Compose)…"
  else
    echo "Starting mongodb, redis, ollama, rag, cms, nginx…"
  fi
  compose up -d --build
  echo "Waiting for Payload through nginx…"
  wait_http "http://127.0.0.1/healthz" 60
  wait_ollama_models || true
  echo "nginx is serving Payload."
  print_urls
}

cmd_status() {
  require_docker
  compose ps
  echo
  curl -fsS --max-time 5 http://127.0.0.1/healthz >/dev/null && echo "nginx /healthz: ok" || echo "nginx /healthz: down"
  compose exec -T ollama ollama list 2>/dev/null || echo "ollama list: unavailable"
  print_urls
}

cmd_down() {
  require_docker
  compose down
  echo "Stack stopped. Host nginx (if installed with --host) is unchanged."
}

install_host_linux() {
  local src="$ROOT/infrastructure/nginx/nginx.host.conf"
  local available="/etc/nginx/sites-available/$HOST_SITE_NAME"
  local enabled="/etc/nginx/sites-enabled/$HOST_SITE_NAME"
  sudo cp "$src" "$available"
  sudo ln -sfn "$available" "$enabled"
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  sudo nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable nginx
    sudo systemctl reload nginx || sudo systemctl restart nginx
  else
    sudo nginx -s reload
  fi
}

install_host_macos() {
  local prefix
  prefix="$(brew --prefix nginx 2>/dev/null || brew --prefix)"
  local servers="$prefix/etc/nginx/servers"
  mkdir -p "$servers"
  cp "$ROOT/infrastructure/nginx/nginx.host.conf" "$servers/$HOST_SITE_NAME.conf"
  nginx -t
  brew services restart nginx
}

cmd_up_host() {
  if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx is not installed." >&2
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "Install with: brew install nginx" >&2
    else
      echo "Install with: sudo apt-get update && sudo apt-get install -y nginx" >&2
    fi
    exit 1
  fi
  echo "Installing host nginx site (proxies 80 → 127.0.0.1:3000)…"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    install_host_macos
  else
    install_host_linux
  fi
  echo "Host nginx reloaded. Payload must already be listening on 127.0.0.1:3000."
  print_urls
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --host)
      mode="host"
      ;;
    --ec2)
      force_ec2=1
      ;;
    --bootstrap)
      bootstrap=1
      ;;
    --status)
      action="status"
      ;;
    --down)
      action="down"
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "$bootstrap" -eq 1 ]]; then
  cmd_bootstrap
fi

case "$action" in
  status) cmd_status ;;
  down) cmd_down ;;
  up)
    if [[ "$mode" == "host" ]]; then
      cmd_up_host
    else
      cmd_up_docker
    fi
    ;;
esac
