#!/bin/bash

set -e

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

if [ -f ".env" ]; then
    docker compose down -v --remove-orphans
else
    echo "No .env found, using default environment for docker compose down..."
    docker compose --env-file .env down -v --remove-orphans
fi

echo "===> Cleaning up bind-mounted directories..."
BIND_MOUNTS="./volumes/db/data ./volumes/storage"

for dir in $BIND_MOUNTS; do
    if [ -d "$dir" ]; then
        echo "Removing $dir..."
        confirm
        rm -rf "$dir"
    else
        echo "$dir not found."
    fi
done

echo "Cleanup complete!"
echo "Re-run 'docker compose pull' to update images."
echo ""