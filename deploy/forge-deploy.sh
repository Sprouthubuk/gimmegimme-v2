# Forge → Site → Settings → Deployments → Deploy script (zero-downtime).
# Turn ON "Make .env variables available to deployment script" (the build reads FRONTEND_URL).
# Laravel lives in backend/, Astro in frontend/. Forge keeps the site's .env at <site>/.env;
# Laravel's storage is kept across releases in <site>/backend-storage.
$CREATE_RELEASE()
cd $FORGE_RELEASE_DIRECTORY
# The site's folder (/home/forge/<site>), worked out from the release folder (<site>/releases/<id>).
SITE_ROOT="${FORGE_SITE_PATH:-$(cd "$FORGE_RELEASE_DIRECTORY/../.." && pwd)}"

# --- Shared files: the environment and Laravel's storage survive every release ---
ln -sfn "$SITE_ROOT/.env" backend/.env
SHARED_STORAGE="$SITE_ROOT/backend-storage"
if [ ! -d "$SHARED_STORAGE" ]; then
  cp -r backend/storage "$SHARED_STORAGE"
fi
mkdir -p "$SHARED_STORAGE"/{app/public,framework/cache/data,framework/sessions,framework/views,logs}
rm -rf backend/storage
ln -sfn "$SHARED_STORAGE" backend/storage

# --- Laravel ---
cd backend
$FORGE_COMPOSER install --no-dev --no-interaction --prefer-dist --optimize-autoloader
$FORGE_PHP artisan storage:link
$FORGE_PHP artisan vendor:publish --tag=verity-assets --force
$FORGE_PHP artisan migrate --force
$FORGE_PHP artisan optimize
$FORGE_PHP artisan filament:optimize || true
{ echo "=== verity:check $(date -u +%FT%TZ)"; $FORGE_PHP artisan verity:check 2>&1; echo "exit $?"; } | tee -a storage/logs/verity-check-deploy.log || true
cd ..

# --- Astro (built for this site's public address) ---
cd frontend
echo "Node $(node -v) / npm $(npm -v)"
npm ci --no-audit --no-fund
PUBLIC_SITE_URL="$FRONTEND_URL" npm run build
cd ..

$ACTIVATE_RELEASE()
$RESTART_QUEUES()
# The Astro background process restarts itself from the new release.
pkill -x -f "node $SITE_ROOT/current/frontend/dist/server/entry.mjs" || true
