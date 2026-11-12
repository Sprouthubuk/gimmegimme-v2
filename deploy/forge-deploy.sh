# Forge → Site → Deployments → Deploy Script. Zero-downtime deployments assumed
# ($FORGE_RELEASE_DIRECTORY etc.); see deploy/README.md for the one-off setup.
set -e
cd $FORGE_RELEASE_DIRECTORY

# --- Laravel ---
cd backend
$FORGE_COMPOSER install --no-dev --no-interaction --prefer-dist --optimize-autoloader
$FORGE_PHP artisan migrate --force
$FORGE_PHP artisan optimize
$FORGE_PHP artisan filament:optimize || true
$FORGE_PHP artisan vendor:publish --tag=verity-assets --force
$FORGE_PHP artisan storage:link || true
cd ..

# --- Astro ---
cd frontend
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev
cd ..

# Activate, then restart the long-running processes on the new release.
$ACTIVATE_RELEASE()
( flock -w 10 9 || exit 1
    echo 'Restarting FPM...'; sudo -S service $FORGE_PHP_FPM reload ) 9>/tmp/fpmlock
$FORGE_PHP $FORGE_SITE_PATH/current/backend/artisan queue:restart
sudo supervisorctl restart gimme-astro:* || true
