#!/bin/sh
# Reset database - run from project root
# Usage: ./latta-csbot-database/reset.sh
# Or:    cd .. && ./latta-csbot-database/reset.sh

set -e

# Run from project root (parent of latta-csbot-database)
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

auto_confirm=0

confirm () {
    if [ "$auto_confirm" = "1" ]; then
        return 0
    fi

    printf "Are you sure you want to proceed? (y/N) "
    read -r REPLY
    case "$REPLY" in
        [Yy])
            ;;
        *)
            echo "Script canceled."
            exit 1
            ;;
    esac
}

if [ "$1" = "-y" ]; then
    auto_confirm=1
fi

echo ""
echo "*** WARNING: This will remove all containers and container data ***"
echo ""

confirm

echo "===> Stopping and removing all containers..."

COMPOSE_FILES="-f docker-compose.yml"
[ -f "docker-compose.dev.yml" ] && COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"

if [ -f ".env" ]; then
    docker compose $COMPOSE_FILES down -v --remove-orphans
elif [ -f ".env.example" ]; then
    echo "No .env found, using .env.example..."
    docker compose --env-file .env.example $COMPOSE_FILES down -v --remove-orphans
else
    echo "Skipping 'docker compose down' - no .env or .env.example."
fi

echo "===> Removing postgres_data volume (fixes Auth/Realtime migration errors)..."
docker volume rm latta-csbot-unified_postgres_data 2>/dev/null || true
docker volume rm latta-csbot-dev_postgres_data 2>/dev/null || true

echo "===> Cleaning up bind-mounted directories..."
BIND_MOUNTS="./latta-csbot-database/volumes/db/data ./latta-csbot-database/volumes/storage ./latta-csbot-database/volumes/mongodb/data ./latta-csbot-database/volumes/redis/data"

for dir in $BIND_MOUNTS; do
    if [ -d "$dir" ]; then
        echo "Removing $dir..."
        confirm
        rm -rf "$dir"
    fi
done

echo "Cleanup complete!"
echo "Re-run: docker compose up -d"
echo "(or: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d for dev)"
echo ""
