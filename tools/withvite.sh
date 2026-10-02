#!/usr/bin/env bash
# Run a command with the Vite dev server up for exactly as long as the command runs.
#   tools/withvite.sh node tools/compare.mjs ...
cd "$(dirname "$0")/.."
npx vite --port 5173 --strictPort > /tmp/withvite.log 2>&1 &
VP=$!
trap 'kill $VP 2>/dev/null; wait $VP 2>/dev/null' EXIT
for i in $(seq 1 80); do
  curl -s -o /dev/null http://localhost:5173/lab.html && break
  sleep 0.25
done
"$@"
