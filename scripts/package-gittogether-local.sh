#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_TRIPLE="aarch64-apple-darwin"
TARGET_DIR="$ROOT_DIR/target/gittogether-local"
TAURI_DIR="$ROOT_DIR/crates/gitbutler-tauri"
INJECTED_ASKPASS="$TAURI_DIR/gitbutler-git-askpass-$TARGET_TRIPLE"
MCP_WORKSPACE="$ROOT_DIR/crates/but/src/command/mcp/workspace.html"
MCP_REVIEW="$ROOT_DIR/crates/but/src/command/mcp/review.html"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gittogether-package.XXXXXX")"
TEMP_CONFIG="$TEMP_DIR/tauri.conf.json"
TASK_BIN="$TEMP_DIR/bin"

ASKPASS_EXISTED=false
WORKSPACE_APP_EXISTED=false
REVIEW_APP_EXISTED=false
[[ -e "$INJECTED_ASKPASS" ]] && ASKPASS_EXISTED=true
[[ -e "$MCP_WORKSPACE" ]] && WORKSPACE_APP_EXISTED=true
[[ -e "$MCP_REVIEW" ]] && REVIEW_APP_EXISTED=true

cleanup() {
	if [[ "$ASKPASS_EXISTED" == false ]]; then
		rm -f -- "$INJECTED_ASKPASS"
	fi
	if [[ "$WORKSPACE_APP_EXISTED" == false ]]; then
		rm -f -- "$MCP_WORKSPACE"
	fi
	if [[ "$REVIEW_APP_EXISTED" == false ]]; then
		rm -f -- "$MCP_REVIEW"
	fi
	rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
	echo "GitTogether local packaging currently requires an Apple Silicon Mac." >&2
	exit 1
fi

VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "VERSION must contain one semantic version, received: $VERSION" >&2
	exit 1
fi

if ! rustup target list --installed | grep -qx "$TARGET_TRIPLE"; then
	echo "The Rust target $TARGET_TRIPLE is not installed." >&2
	exit 1
fi

mkdir -p "$TASK_BIN"
/opt/homebrew/opt/node@22/bin/corepack enable --install-directory "$TASK_BIN" >/dev/null
export PATH="$TASK_BIN:/opt/homebrew/opt/node@22/bin:$PATH"

DESKTOP_DIR="${1:-$(osascript -e 'POSIX path of (path to desktop folder)' | sed 's:/$::')}"
if [[ ! -d "$DESKTOP_DIR" ]]; then
	echo "Desktop output directory does not exist: $DESKTOP_DIR" >&2
	exit 1
fi

jq \
	--arg version "$VERSION" \
	'
	.version = $version
	| .bundle.active = true
	| .bundle.targets = ["app", "dmg"]
	| .bundle.createUpdaterArtifacts = false
	| .bundle.externalBin = ["gitbutler-git-askpass"]
	| .bundle.macOS = ((.bundle.macOS // {}) + {
		"signingIdentity": "-",
		"hardenedRuntime": false
	})
	| if .plugins then .plugins |= del(.updater) else . end
	' \
	"$TAURI_DIR/tauri.conf.release.json" > "$TEMP_CONFIG"

export CHANNEL="release"
export VERSION
export OS="macos"
export CARGO_BUILD_TARGET="$TARGET_TRIPLE"
export CARGO_TARGET_DIR="$TARGET_DIR"
export GITBUTLER_REQUIRE_MCP_APP=1

cd "$ROOT_DIR"
pnpm --filter @gitbutler/but-mcp-app build
pnpm tauri-for-release build \
	--features "builtin-but disable-auto-updates" \
	--config "$TEMP_CONFIG" \
	--target "$TARGET_TRIPLE"

BUNDLE_DIR="$TARGET_DIR/$TARGET_TRIPLE/release/bundle"
shopt -s nullglob
APP_CANDIDATES=("$BUNDLE_DIR/macos/"*.app)
DMG_CANDIDATES=("$BUNDLE_DIR/dmg/"*.dmg)
if [[ "${#APP_CANDIDATES[@]}" -ne 1 || "${#DMG_CANDIDATES[@]}" -ne 1 ]]; then
	echo "Expected one .app and one .dmg under $BUNDLE_DIR." >&2
	exit 1
fi

SUFFIX=""
BASE_NAME="GitTogether-$VERSION-arm64"
if [[ -e "$DESKTOP_DIR/$BASE_NAME.app" || -e "$DESKTOP_DIR/$BASE_NAME.dmg" ]]; then
	SUFFIX="-$(date +%Y%m%d-%H%M%S)"
fi
OUTPUT_BASE="$BASE_NAME$SUFFIX"
OUTPUT_APP="$DESKTOP_DIR/$OUTPUT_BASE.app"
OUTPUT_DMG="$DESKTOP_DIR/$OUTPUT_BASE.dmg"
OUTPUT_CHECKSUMS="$DESKTOP_DIR/$OUTPUT_BASE.sha256"

ditto "${APP_CANDIDATES[0]}" "$OUTPUT_APP"
ditto "${DMG_CANDIDATES[0]}" "$OUTPUT_DMG"

codesign --verify --deep --strict "$OUTPUT_APP"
hdiutil verify "$OUTPUT_DMG"

APP_EXECUTABLE="$OUTPUT_APP/Contents/MacOS/gitbutler-tauri"
if [[ ! -x "$APP_EXECUTABLE" ]]; then
	echo "Packaged application executable is missing: $APP_EXECUTABLE" >&2
	exit 1
fi
{
	shasum -a 256 "$OUTPUT_DMG"
	shasum -a 256 "$APP_EXECUTABLE"
} > "$OUTPUT_CHECKSUMS"

echo "GitTogether $VERSION packaged successfully:"
echo "$OUTPUT_APP"
echo "$OUTPUT_DMG"
echo "$OUTPUT_CHECKSUMS"
