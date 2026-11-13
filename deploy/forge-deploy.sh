# Forge → Site → Settings → Deployments → Deploy script (zero-downtime).
# Turn ON "Make .env variables available to deployment script" (the build reads FRONTEND_URL).
# Laravel lives in backend/, Astro in frontend/. Forge keeps the site's .env at <site>/.env;
# Laravel's storage is kept across releases in <site>/backend-storage.
$CREATE_RELEASE()
cd $FORGE_RELEASE_DIRECTORY
# The site's folder (/home/forge/<site>), worked out from the release folder (<site>/releases/<id>).
# Not FORGE_SITE_PATH: in zero-downtime mode that is <site>/current, which points at the OLD release.
SITE_ROOT="$(cd "$FORGE_RELEASE_DIRECTORY/../.." && pwd)"

# --- Shared files: the environment and Laravel's storage survive every release ---
ln -sfn "$SITE_ROOT/.env" backend/.env
# Forge's Composer credentials (Site > Settings > Composer) live in <site>/auth.json; Composer
# only reads auth.json next to composer.json, which is in backend/.
if [ -f "$SITE_ROOT/auth.json" ]; then ln -sfn "$SITE_ROOT/auth.json" backend/auth.json; fi
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
$FORGE_PHP artisan gimme:picture-sizes   # small WebP copies for any picture that lacks them (quick when none are missing)
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
# Not Forge's restart-queues macro: it runs <site>/current/artisan, and ours is in backend/.
$FORGE_PHP "$SITE_ROOT/current/backend/artisan" queue:restart
# The Astro background process restarts itself from the new release.
pkill -x -f "node $SITE_ROOT/current/frontend/dist/server/entry.mjs" || true
