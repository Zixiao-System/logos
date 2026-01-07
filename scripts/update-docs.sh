#!/bin/bash
set -euo pipefail

# Update documentation and create PR for a new release
# Required environment variables:
#   VERSION - Release version (e.g., 2026.1.1)
#   GH_TOKEN - GitHub token for gh CLI

if [[ -z "${VERSION:-}" ]]; then
  echo "Error: VERSION environment variable is required"
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "Error: GH_TOKEN environment variable is required"
  exit 1
fi

REPO="Zixiao-System/logos"
BASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}"
BRANCH="docs/release-v${VERSION}"

echo "Updating documentation for v${VERSION}..."

# Configure git
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Make sure we're on main and up to date
git checkout main
git pull origin main

# Check if branch already exists remotely
if git ls-remote --exit-code --heads origin "${BRANCH}" >/dev/null 2>&1; then
  echo "Branch ${BRANCH} already exists, deleting it first..."
  git push origin --delete "${BRANCH}" || true
fi

# Create new branch
git checkout -b "${BRANCH}"

# Update README download links
echo "Updating README.md..."
sed -i "s|\[Download\](#)|\[Download\](${BASE_URL}/Logos-${VERSION}-arm64.dmg)|g" README.md
sed -i "s|version-[0-9.]*-|version-${VERSION}-|g" README.md

# Update package.json version
echo "Updating package.json..."
npm version "${VERSION}" --no-git-tag-version --allow-same-version || true

# Check if there are any changes
if git diff --quiet; then
  echo "No changes to commit"
  exit 0
fi

# Commit changes
git add -A
git commit -m "docs: update download links and version to v${VERSION}"

# Push branch
git push origin "${BRANCH}"

# Create PR using gh CLI
echo "Creating pull request..."
gh pr create \
  --title "docs: Update for release v${VERSION}" \
  --body "## Automated Documentation Update

This PR updates the documentation for release v${VERSION}:

- Updated download links in README.md
- Updated version references

---
*This PR was automatically created by the Release workflow.*" \
  --base main \
  --head "${BRANCH}" \
  --label "documentation" \
  --label "automated" || {
    # PR might already exist
    echo "PR creation failed, it might already exist"
    gh pr view "${BRANCH}" --json url --jq '.url' || true
  }

echo "Done!"