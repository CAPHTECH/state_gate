---
name: release
description: Execute state_gate release process including version bumping (major/minor/patch), CHANGELOG updates, git tagging, GitHub release creation, and npm publication. Use when the user asks to "release", "publish a new version", "create a release", "bump version", or mentions releasing state_gate to npm.
---

# Release Process Skill

Guide Claude through the complete release process for state_gate following semantic versioning.

## Version Selection

Determine the appropriate version bump based on changes:

- **PATCH** (0.0.x): Bug fixes, documentation corrections, minor performance improvements
- **MINOR** (0.x.0): New features, new guard types, new MCP tools, non-breaking enhancements
- **MAJOR** (x.0.0): Breaking API changes, Process DSL format changes, removal of deprecated features

Ask the user which version type if unclear from context.

## Release Workflow

### 1. Pre-Release Validation

Run all checks to ensure quality:

```bash
npm run build && npm test && npm run typecheck && npm run lint
```

If any checks fail, stop and fix issues before proceeding.

### 2. Create Release Branch

```bash
git checkout -b release/v{VERSION}
```

### 3. Update Version Numbers

Update version in three locations:

```bash
# 1. Update package.json
npm version {major|minor|patch} --no-git-tag-version

# 2. Read and show current versions to user
cat package.json | grep '"version"'
cat plugin/.claude-plugin/plugin.json | grep '"version"'
cat marketplace.json | grep '"version"'
```

Then update `plugin/.claude-plugin/plugin.json` and `marketplace.json` to match the new version from package.json.

### 4. Update CHANGELOG.md

Read the existing CHANGELOG.md and add a new entry at the top:

```markdown
## [{VERSION}] - {YYYY-MM-DD}

### Added
- List new features

### Changed
- List changes to existing functionality

### Fixed
- List bug fixes

### Breaking Changes (for major versions only)
- List breaking changes
```

Ask the user for the changelog content if not already provided.

### 5. Commit Version Bump

```bash
git add package.json plugin/.claude-plugin/plugin.json marketplace.json CHANGELOG.md
git commit -m "chore: bump version to {VERSION}"
```

### 6. Final Validation

Run all checks again:

```bash
npm run build && npm test && npm run lint && npm run typecheck
```

### 7. Merge to Main

```bash
git checkout main
git merge release/v{VERSION}
git push origin main
```

### 8. Create Git Tag

```bash
git tag -a v{VERSION} -m "Release v{VERSION}"
git push origin v{VERSION}
```

### 9. Publish to npm

Check npm login status and publish:

```bash
npm whoami || npm login
npm publish
```

### 10. Create GitHub Release

Provide instructions to the user:

1. Go to https://github.com/CAPHTECH/state_gate/releases
2. Click "Draft a new release"
3. Select the tag `v{VERSION}`
4. Title: `v{VERSION}`
5. Description: Copy the changelog entry for this version
6. Click "Publish release"

### 11. Verify Installation

Test the published package:

```bash
# Test global installation
npm install -g state-gate@{VERSION}
state-gate --version

# Test npx
npx state-gate@{VERSION} --version
```

### 12. Post-Release Cleanup

```bash
# Delete release branch
git branch -d release/v{VERSION}
git push origin --delete release/v{VERSION}
```

## Hotfix Process

For critical bugs requiring immediate patch:

1. Create hotfix branch from main:
   ```bash
   git checkout -b hotfix/v{VERSION} main
   ```

2. Fix the bug with minimal changes and add regression test

3. Update version (patch only):
   ```bash
   npm version patch --no-git-tag-version
   ```

4. Update CHANGELOG.md with fix description

5. Follow steps 5-12 from the regular release workflow

## Common Issues

### npm Login Required

If `npm whoami` fails, run `npm login` (opens browser for authentication).

### Version Conflict

If the version already exists on npm, increment to the next patch version.

### Test Failures

Do not proceed with release if tests fail. Fix issues first.

### Git Push Rejected

If push is rejected, pull latest changes and resolve conflicts.

## Rollback (Emergency Only)

If a release causes critical issues (within 72 hours):

1. Unpublish from npm:
   ```bash
   npm unpublish state-gate@{VERSION}
   ```

2. Delete git tag:
   ```bash
   git tag -d v{VERSION}
   git push origin :refs/tags/v{VERSION}
   ```

3. Delete GitHub release (manual via web UI)

4. Fix issues and release new patch version

## Notes

- Always update all three version locations: package.json, plugin/.claude-plugin/plugin.json, marketplace.json
- CHANGELOG.md entries must include date in YYYY-MM-DD format
- Git commit messages follow conventional commits: `chore: bump version to {VERSION}`
- npm publish requires authentication - ensure user is logged in
- GitHub release must be created manually via web UI
