#!/usr/bin/env bash
# Gravitas Campus — remove EVERYTHING the local test created on this Mac.
# Usage (from the project folder):  bash scripts/mac-cleanup.sh
# Only Gravitas items are removed. Other Docker containers/projects are not touched.
set -uo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "This will permanently delete:"
echo "  • the Gravitas database container and all its test data (gravitas-pg)"
echo "  • the downloaded database image (postgres:16), if nothing else uses it"
echo "  • the project folder: $PROJECT_DIR"
read -r -p "Type YES to continue: " ok
[ "$ok" = "YES" ] || { echo "Cancelled. Nothing was deleted."; exit 0; }

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker rm -f gravitas-pg >/dev/null 2>&1 && echo "✓ Removed database container"
  docker volume rm gravitas-pg-data >/dev/null 2>&1 && echo "✓ Removed database data"
  if [ -z "$(docker ps -a --filter ancestor=postgres:16 -q)" ]; then
    docker image rm postgres:16 >/dev/null 2>&1 && echo "✓ Removed postgres:16 image"
  else
    echo "• Kept postgres:16 image (another container uses it)"
  fi
  docker volume prune -f >/dev/null 2>&1 || true
else
  echo "• Docker/Colima is not running — start it with 'colima start' and run this again to remove the database."
fi

cd ~ && rm -rf "$PROJECT_DIR" && echo "✓ Removed project folder (code, packages, build files)"
npm cache clean --force >/dev/null 2>&1 && echo "✓ Cleared npm download cache"

echo ""
echo "Done. Optional extra space:"
echo "  colima stop            # stop the Colima virtual machine"
echo "  colima delete          # ⚠ deletes the whole Colima VM (ALL Docker containers, not just Gravitas)"
echo "Your code is safe on GitHub — clone it again any time."
