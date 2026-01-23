# Release Process

This document describes the release process for state_gate.

## Versioning Strategy

state_gate follows [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (x.0.0): Breaking changes to public API or process DSL
- **MINOR** (0.x.0): New features, backward-compatible
- **PATCH** (0.0.x): Bug fixes, backward-compatible

### Examples
- `0.1.0` → `0.2.0`: Add new MCP tool
- `0.1.0` → `0.1.1`: Fix bug in state transition
- `0.1.0` → `1.0.0`: Remove deprecated features, change DSL format

## Release Types

### 1. Patch Release (Bug Fixes)
Frequency: As needed
- Bug fixes
- Documentation corrections
- Minor performance improvements

### 2. Minor Release (New Features)
Frequency: Monthly or when feature set is ready
- New features
- New guard types
- New MCP tools
- Non-breaking enhancements

### 3. Major Release (Breaking Changes)
Frequency: When necessary
- Breaking API changes
- Process DSL format changes
- Removal of deprecated features

## Release Checklist

### Pre-Release (Development Phase)

- [ ] All tests passing (`npm test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Update CHANGELOG.md with changes
- [ ] Update version in package.json
- [ ] Update version in plugin/.claude-plugin/plugin.json
- [ ] Update version in marketplace.json
- [ ] Review and update documentation if needed

### Release (Publication Phase)

1. **Create Release Branch**
   ```bash
   git checkout -b release/v0.x.0
   ```

2. **Update Version Numbers**
   ```bash
   # Update package.json
   npm version <major|minor|patch> --no-git-tag-version

   # Update plugin version to match
   # Edit plugin/.claude-plugin/plugin.json
   # Edit marketplace.json
   ```

3. **Update CHANGELOG.md**
   ```markdown
   ## [0.x.0] - YYYY-MM-DD

   ### Added
   - New feature description

   ### Changed
   - Changed behavior description

   ### Fixed
   - Bug fix description

   ### Breaking Changes (for major versions only)
   - Breaking change description
   ```

4. **Commit Version Bump**
   ```bash
   git add package.json plugin/.claude-plugin/plugin.json marketplace.json CHANGELOG.md
   git commit -m "chore: bump version to 0.x.0"
   ```

5. **Run Final Checks**
   ```bash
   npm run build
   npm test
   npm run lint
   npm run typecheck
   ```

6. **Merge to Main**
   ```bash
   git checkout main
   git merge release/v0.x.0
   git push origin main
   ```

7. **Create Git Tag**
   ```bash
   git tag -a v0.x.0 -m "Release v0.x.0"
   git push origin v0.x.0
   ```

8. **Publish to npm**
   ```bash
   npm login  # If not already logged in
   npm publish
   ```

9. **Create GitHub Release**
   - Go to https://github.com/CAPHTECH/state_gate/releases
   - Click "Draft a new release"
   - Select the tag `v0.x.0`
   - Title: `v0.x.0`
   - Description: Copy from CHANGELOG.md
   - Click "Publish release"

10. **Verify Installation**
    ```bash
    # Test global installation
    npm install -g state-gate@0.x.0
    state-gate --version

    # Test npx
    npx state-gate@0.x.0 --version

    # Test Claude Code plugin (if possible)
    /plugin install https://github.com/CAPHTECH/state_gate/tree/main/plugin
    ```

### Post-Release

- [ ] Announce release (GitHub Discussions, if applicable)
- [ ] Update documentation site (if applicable)
- [ ] Close related GitHub issues with "Fixed in v0.x.0"
- [ ] Delete release branch
   ```bash
   git branch -d release/v0.x.0
   git push origin --delete release/v0.x.0
   ```

## Hotfix Process (Critical Bugs)

For critical bugs in production:

1. **Create Hotfix Branch from Main**
   ```bash
   git checkout -b hotfix/v0.x.1 main
   ```

2. **Fix the Bug**
   - Make minimal changes
   - Add regression test

3. **Update Version (Patch)**
   ```bash
   npm version patch --no-git-tag-version
   ```

4. **Update CHANGELOG.md**
   ```markdown
   ## [0.x.1] - YYYY-MM-DD

   ### Fixed
   - Critical bug description
   ```

5. **Follow Release Steps 4-10** (same as regular release)

## Deprecation Policy

When deprecating features:

1. **Mark as deprecated** in current version
   - Add deprecation warnings
   - Update documentation

2. **Keep for at least 2 minor versions**
   - v0.1.0: Feature marked deprecated
   - v0.2.0: Still available with warnings
   - v0.3.0: Can be removed (or in v1.0.0)

3. **Document migration path**
   - Provide clear upgrade instructions
   - Include code examples

## Breaking Changes Policy

Breaking changes are only allowed in:
- Major version releases (1.0.0, 2.0.0, etc.)
- Pre-1.0 minor releases (0.x.0) with clear notice

For breaking changes:
1. Document the change in CHANGELOG.md under "Breaking Changes"
2. Provide migration guide in documentation
3. Consider providing migration script/tool if possible

## Release Cadence

- **Patch releases**: As needed for critical bugs
- **Minor releases**: Every 2-4 weeks or when features are ready
- **Major releases**: When necessary, with advance notice

## Rollback Process

If a release causes critical issues:

1. **Unpublish from npm** (within 72 hours)
   ```bash
   npm unpublish state-gate@0.x.0
   ```

2. **Delete Git Tag**
   ```bash
   git tag -d v0.x.0
   git push origin :refs/tags/v0.x.0
   ```

3. **Delete GitHub Release**
   - Go to releases page
   - Delete the problematic release

4. **Investigate and Fix**
   - Fix the issue
   - Release new patch version

## Automation Opportunities

Future improvements:
- [ ] GitHub Actions for automated testing on PR
- [ ] GitHub Actions for automated npm publish on tag
- [ ] Automated CHANGELOG generation from commits
- [ ] Automated version bump based on commit messages

## Contact

For questions about releases:
- GitHub Issues: https://github.com/CAPHTECH/state_gate/issues
- Maintainer: CAPHTECH

---

Last Updated: 2026-01-23
