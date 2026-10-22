#!/usr/bin/env bash
# Invoked automatically by GitHub Actions on the target Debian/Ubuntu VM.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
IMAGE=${1:?Immutable image required}
[[ "$IMAGE" =~ ^[a-z0-9-]+-docker.pkg.dev/[a-z0-9-]+/kwonnet/kwonserver@sha256:[a-f0-9]{64}$ ]] || { echo 'Unexpected image reference' >&2; exit 2; }
BUNDLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Serialize image cleanup and releases across both applications on this VM.
exec 8>/var/lock/kwonnet-compute-deploy.lock
flock -w 1800 8
ROOT=/opt/kwonnet
mkdir -p "$ROOT/env" "$ROOT/history"
chmod 700 "$ROOT" "$ROOT/env" "$ROOT/history"
exec 9>"$ROOT/.deploy.lock"
flock -w 1800 9
if ! command -v docker >/dev/null; then
  source /etc/os-release
  case "$ID" in debian|ubuntu) ;; *) echo 'Automatic Docker installation supports Debian/Ubuntu only.' >&2; exit 1 ;; esac
  apt-get update
  apt-get install -y ca-certificates curl python3
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$(dpkg --print-architecture)" "$ID" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io
fi
command -v python3 >/dev/null || { apt-get update; apt-get install -y python3; }
systemctl enable --now docker
WORK=$(mktemp -d "$ROOT/.release.XXXXXX")
trap 'rm -rf "$WORK"; rm -f "$BUNDLE/registry-token" "$BUNDLE/app.env"' EXIT
ENV_FILE="$ROOT/env/kwonserver.env"
OLD_API=kwonserver
if [[ -f "$ROOT/active-api" ]]; then OLD_API=$(cat "$ROOT/active-api"); fi
[[ "$OLD_API" =~ ^kwonserver(-blue|-green)?$ ]] || { echo 'Invalid active API slot' >&2; exit 1; }
NEXT_API=kwonserver-blue
[[ "$OLD_API" != kwonserver-blue ]] || NEXT_API=kwonserver-green
export TARGET_API="$NEXT_API"
if [[ -s "$BUNDLE/app.env" ]]; then
  install -m 600 "$BUNDLE/app.env" "$WORK/app.env"
elif [[ -s "$ENV_FILE" ]]; then
  install -m 600 "$ENV_FILE" "$WORK/app.env"
else
  echo 'Set GitHub production secret KWONSERVER_ENV with the application runtime environment.' >&2
  exit 1
fi
# Validate without printing credentials. Env files use Docker KEY=value syntax.
python3 - "$WORK/app.env" "$WORK" <<'PY'
import os, pathlib, re, sys
values = {}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'): continue
    key, sep, value = line.partition('=')
    if not sep or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
        raise SystemExit('KWONSERVER_ENV requires KEY=value lines without export or spaces around keys')
    if value.startswith(('"', "'")):
        raise SystemExit('Remove surrounding quotes from KWONSERVER_ENV values (Docker env-file syntax)')
    values[key] = value
for key in ('DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'API_DOMAIN', 'ACME_EMAIL'):
    if not values.get(key): raise SystemExit('Missing runtime setting: '+key)
domain = values['API_DOMAIN']
if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', domain) or '.' not in domain:
    raise SystemExit('API_DOMAIN must be a hostname without scheme/path')
if not re.fullmatch(r'[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+', values['ACME_EMAIL']):
    raise SystemExit('ACME_EMAIL is invalid')
pathlib.Path(sys.argv[2], 'Caddyfile').write_text('{\n email '+values['ACME_EMAIL']+'\n}\n'+domain+' {\n header X-Robots-Tag \"noindex, nofollow, nosnippet\"\n reverse_proxy '+os.environ['TARGET_API']+':8000\n}\n')
PY
export DOCKER_CONFIG="$WORK/docker"
mkdir -p "$DOCKER_CONFIG"
docker login "${IMAGE%%/*}" --username oauth2accesstoken --password-stdin < "$BUNDLE/registry-token" >/dev/null
rm -f "$BUNDLE/registry-token"
# Verify the VM identity (not the GitHub identity) before replacing containers.
python3 "$BUNDLE/check-cloud-logging.py"
docker pull "$IMAGE"
docker pull caddy:2-alpine
# Validate the release before pausing writers for schema changes.
docker run --rm -v "$WORK/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
# Keep the active API serving while the database release and candidate start.
# Destructive pending migrations are rejected before changing the live schema.
echo 'Applying compatible database migrations and reference seeds.'
if docker run --rm --env-file "$WORK/app.env" -e ROLLING_DEPLOYMENT=true "$IMAGE" sh -c 'if [ -n "$DATABASE_MIGRATION_URL" ]; then export DATABASE_URL="$DATABASE_MIGRATION_URL"; fi; exec npm run db:deploy'; then
  echo 'Database release complete; preparing the replacement API.'
else
  release_status=$?
  echo 'Database release failed. Existing API and worker remain running; repair the release and rerun deployment.' >&2
  exit "$release_status"
fi
docker network inspect kwonserver-production >/dev/null 2>&1 || docker network create kwonserver-production >/dev/null
COMMON=(--detach --init --restart unless-stopped --network kwonserver-production
  --log-driver gcplogs --log-opt mode=non-blocking --log-opt max-buffer-size=4m
  --log-opt cache-disabled=false --log-opt cache-max-size=10m --log-opt cache-max-file=3
  --stop-timeout 30)
switched=false
worker_replaced=false
worker_started=false
cleanup_release() {
  result=$?
  if [[ "$switched" == false ]]; then
    docker rm --force "$NEXT_API" >/dev/null 2>&1 || true
    if [[ "$worker_started" == true ]]; then docker rm --force kwonserver-worker >/dev/null 2>&1 || true; fi
    if [[ "$worker_replaced" == true ]]; then
      docker rename kwonserver-worker-previous kwonserver-worker >/dev/null 2>&1 || true
      docker start kwonserver-worker >/dev/null 2>&1 || true
    fi
  fi
  rm -rf "$WORK"
  rm -f "$BUNDLE/registry-token" "$BUNDLE/app.env"
  exit "$result"
}
trap cleanup_release EXIT
# Only remove an inactive slot left by a previous interrupted deployment.
if docker container inspect "$NEXT_API" >/dev/null 2>&1; then docker rm --force "$NEXT_API" >/dev/null; fi
docker run "${COMMON[@]}" --name "$NEXT_API" --env-file "$WORK/app.env" -e NODE_ENV=production -e PORT=8000 -e RUN_BACKGROUND_JOBS=false "$IMAGE" >/dev/null
deployment_failure() {
  echo "$1" >&2
  python3 "$BUNDLE/diagnostics.py" "$WORK/app.env" "$NEXT_API" >&2 || echo 'Could not collect startup diagnostics.' >&2
  exit 1
}
healthy=false
for attempt in $(seq 1 60); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$NEXT_API")" == healthy ]]; then healthy=true; break; fi
  sleep 3
done
[[ "$healthy" == true ]] || deployment_failure 'API health check failed; previous API remains active.'
docker exec "$NEXT_API" node -e 'async function check(){try{const r=await fetch("http://127.0.0.1:8000/socket.io/?EIO=4&transport=polling");if(!r.ok||!(await r.text()).startsWith("0{"))process.exit(1)}catch{process.exit(1)}}check()'
# Replace the worker only after the candidate API is healthy; retain a restartable
# previous worker until cutover succeeds. Do not run two sets of background jobs.
if docker container inspect kwonserver-worker-previous >/dev/null 2>&1; then docker rm --force kwonserver-worker-previous >/dev/null; fi
if docker container inspect kwonserver-worker >/dev/null 2>&1; then
  docker stop --time 30 kwonserver-worker >/dev/null
  docker rename kwonserver-worker kwonserver-worker-previous
  worker_replaced=true
fi
worker_started=true
docker run "${COMMON[@]}" --name kwonserver-worker -v kwonserver_model_cache:/app/model-cache -e TRANSFORMERS_CACHE=/app/model-cache --env-file "$WORK/app.env" -e NODE_ENV=production -e RUN_BACKGROUND_JOBS=true --no-healthcheck "$IMAGE" npm run start:worker >/dev/null
sleep 3
[[ "$(docker inspect --format '{{.State.Running}}' kwonserver-worker)" == true ]] || deployment_failure 'Worker is not running.'
[[ "$(docker inspect --format '{{.RestartCount}}' kwonserver-worker)" == 0 ]] || deployment_failure 'Worker restarted during deployment.'
# Reload the existing proxy in place. A rejected reload keeps its old configuration.
if docker container inspect kwonserver-proxy >/dev/null 2>&1; then
  docker cp "$WORK/Caddyfile" kwonserver-proxy:/tmp/release.Caddyfile
  docker exec kwonserver-proxy caddy reload --config /tmp/release.Caddyfile --adapter caddyfile
else
  cat "$WORK/Caddyfile" > "$ROOT/Caddyfile"
  docker run "${COMMON[@]}" --name kwonserver-proxy -p 80:80 -p 443:443 -v "$ROOT/Caddyfile:/etc/caddy/Caddyfile:ro" -v kwonserver_caddy_data:/data -v kwonserver_caddy_config:/config caddy:2-alpine >/dev/null
  docker exec kwonserver-proxy caddy validate --config /etc/caddy/Caddyfile
fi
switched=true
# Preserve the bind-mounted inode so proxy restarts use the newly selected slot.
cat "$WORK/Caddyfile" > "$ROOT/Caddyfile"
printf '%s\n' "$NEXT_API" > "$ROOT/active-api"
if [[ -f "$ENV_FILE" ]]; then install -m 600 "$ENV_FILE" "$ROOT/history/$(date -u +%Y%m%dT%H%M%S)-runtime.env"; fi
install -m 600 "$WORK/app.env" "$ENV_FILE"
# Allow in-flight HTTP requests to finish before retiring the previous API.
sleep 20
if docker container inspect "$OLD_API" >/dev/null 2>&1; then docker stop --time 30 "$OLD_API" >/dev/null; docker rm "$OLD_API" >/dev/null; fi
if docker container inspect kwonserver-worker-previous >/dev/null 2>&1; then docker rm kwonserver-worker-previous >/dev/null; fi
if [[ -f "$ROOT/image" ]]; then cp "$ROOT/image" "$ROOT/history/$(date -u +%Y%m%dT%H%M%S)-image"; fi
printf '%s\n' "$IMAGE" > "$ROOT/image"
# Reclaim the old release only after the new containers have passed validation.
# Image pruning preserves images referenced by any container and never prunes volumes.
if ! docker image prune --all --force; then
  echo 'Warning: release succeeded, but unused image cleanup failed; check VM disk space.' >&2
fi
echo 'API and worker deployed. Verify public HTTPS and authenticated Socket.IO flows after first deployment.'
