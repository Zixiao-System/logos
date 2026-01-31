#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor/vscode"

VSCODE_SRC=""
BUILD_OUT=0
CLONE_REF="main"
CLONE_URL="https://github.com/microsoft/vscode.git"

usage() {
  cat <<USAGE
Usage: ./update.sh [--source <path>] [--build] [--clone] [--ref <ref>] [--url <repo>]

Options:
  --source <path>  Path to a local VS Code repo (default: ../vscode)
  --build          Build VS Code out/ if missing
  --clone          Clone VS Code into a temp directory when no local source is present
  --ref <ref>      Git ref to checkout when cloning (default: main)
  --url <repo>     Git repo to clone (default: https://github.com/microsoft/vscode.git)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      VSCODE_SRC="$2"
      shift 2
      ;;
    --build)
      BUILD_OUT=1
      shift
      ;;
    --clone)
      CLONE=1
      shift
      ;;
    --ref)
      CLONE_REF="$2"
      shift 2
      ;;
    --url)
      CLONE_URL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$VSCODE_SRC" ]]; then
  if [[ -d "$ROOT_DIR/../vscode" ]]; then
    VSCODE_SRC="$ROOT_DIR/../vscode"
  else
    VSCODE_SRC=""
  fi
fi

if [[ -z "${VSCODE_SRC:-}" ]]; then
  if [[ "${CLONE:-0}" -eq 1 ]]; then
    TMP_DIR="${TMPDIR:-/tmp}/logos-vscode-src"
    rm -rf "$TMP_DIR"
    git clone --depth 1 --branch "$CLONE_REF" "$CLONE_URL" "$TMP_DIR"
    VSCODE_SRC="$TMP_DIR"
  else
    echo "VS Code source not found. Use --source <path> or --clone." >&2
    exit 1
  fi
fi

if [[ ! -d "$VSCODE_SRC" ]]; then
  echo "VS Code source path does not exist: $VSCODE_SRC" >&2
  exit 1
fi

REQUIRED_NODE=""
if [[ -f "$VSCODE_SRC/.nvmrc" ]]; then
  REQUIRED_NODE="$(cat "$VSCODE_SRC/.nvmrc" | tr -d '[:space:]')"
fi

OUT_DIR="$VSCODE_SRC/out"
if [[ ! -d "$OUT_DIR/vs" ]]; then
  if [[ "$BUILD_OUT" -eq 1 ]]; then
    echo "[update] out/ missing. Building VS Code..."
    pushd "$VSCODE_SRC" >/dev/null
    export CXXFLAGS="${CXXFLAGS:-} -std=c++20"
    export npm_config_cxxflags="${npm_config_cxxflags:-} -std=c++20"
    if [[ -n "$REQUIRED_NODE" ]]; then
      CURRENT_NODE="$(node -p "process.versions.node" 2>/dev/null || echo "")"
      if [[ "$CURRENT_NODE" != "$REQUIRED_NODE" ]]; then
        echo "[update] VS Code recommends Node $REQUIRED_NODE (current: ${CURRENT_NODE:-unknown})." >&2
      fi
    fi
    set +e
    npm install
    npm run compile
    BUILD_STATUS=$?
    set -e
    if [[ "$BUILD_STATUS" -ne 0 ]]; then
      NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "")
      if [[ -n "$REQUIRED_NODE" ]]; then
        echo "[update] Build failed. VS Code expects Node $REQUIRED_NODE. Try: nvm use $REQUIRED_NODE" >&2
      elif [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && [[ "$NODE_MAJOR" -ge 23 ]]; then
        echo "[update] Build failed. Detected Node $NODE_MAJOR. VS Code build is more reliable on Node 22.x." >&2
        echo "[update] Please try: nvm use 22 (or install Node 22), then rerun update.sh." >&2
      else
        echo "[update] Build failed even with C++20 flags. Consider switching to Node 22 and retry." >&2
      fi
      exit "$BUILD_STATUS"
    fi
    popd >/dev/null
  else
    echo "VS Code out/ not found. Re-run with --build to compile." >&2
    exit 1
  fi
fi

mkdir -p "$VENDOR_DIR/src/vs/workbench/api/node"
mkdir -p "$VENDOR_DIR/out"

cp "$VSCODE_SRC/src/vs/workbench/api/node/extensionHostProcess.ts" "$VENDOR_DIR/src/vs/workbench/api/node/extensionHostProcess.ts"
cp "$VSCODE_SRC/LICENSE.txt" "$VENDOR_DIR/LICENSE.txt"
cp "$VSCODE_SRC/ThirdPartyNotices.txt" "$VENDOR_DIR/ThirdPartyNotices.txt"

rm -rf "$VENDOR_DIR/out/vs"
cp -R "$OUT_DIR/vs" "$VENDOR_DIR/out/"

VSCODE_COMMIT="unknown"
if git -C "$VSCODE_SRC" rev-parse HEAD >/dev/null 2>&1; then
  VSCODE_COMMIT="$(git -C "$VSCODE_SRC" rev-parse HEAD)"
fi

echo "$VSCODE_COMMIT" > "$VENDOR_DIR/VERSION"

echo "[update] VS Code vendor synced. Commit: $VSCODE_COMMIT"
