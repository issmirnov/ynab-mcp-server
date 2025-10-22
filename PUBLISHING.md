# Publishing Guide

This guide covers how to publish the YNAB MCP Server to various distribution channels.

## Prerequisites

Before publishing, ensure:
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Version is updated in `package.json`
- [ ] CHANGELOG is updated (if applicable)
- [ ] README is up to date
- [ ] You have necessary access rights to publish

## Publishing to npm

### First-time Setup

1. **Create an npm account** (if you don't have one):
   ```bash
   npm adduser
   ```

2. **Login to npm**:
   ```bash
   npm login
   ```

### Publishing Options

Since the original `ynab-mcp-server` package is owned by `calebl`, you have two options:

#### Option A: Publish under a scoped name (Recommended)
This allows you to publish without conflicts:

1. Update `package.json` name to:
   ```json
   {
     "name": "@issmirnov/ynab-mcp-server"
   }
   ```

2. Publish:
   ```bash
   npm publish --access public
   ```

#### Option B: Request transfer of original package
Contact the original author to request package transfer or publishing rights.

#### Option C: Use a different package name
Change the package name to something unique:
```json
{
  "name": "ynab-mcp-server-enhanced"
}
```

### Publishing Steps

1. **Clean build**:
   ```bash
   npm run build
   ```

2. **Test the package locally**:
   ```bash
   npm pack
   # This creates a .tgz file you can test with:
   npm install -g ./ynab-mcp-server-0.1.3.tgz
   ```

3. **Dry run** (see what will be published):
   ```bash
   npm publish --dry-run
   ```

4. **Publish**:
   ```bash
   # For unscoped packages (requires ownership):
   npm publish

   # For scoped packages:
   npm publish --access public
   ```

5. **Verify publication**:
   ```bash
   npm view ynab-mcp-server  # or your package name
   ```

### Version Management

Follow semantic versioning (semver):
- **Patch** (0.1.3 → 0.1.4): Bug fixes
- **Minor** (0.1.3 → 0.2.0): New features (backward compatible)
- **Major** (0.1.3 → 1.0.0): Breaking changes

Update version:
```bash
npm version patch  # or minor, or major
npm publish
```

## Publishing to Smithery

Smithery automatically indexes packages from npm, GitHub, and other sources.

### Prerequisites
- Package must be published to npm first
- `smithery.json` file must be present in the repository (✓ already created)

### Manual Submission

1. **Visit Smithery**: https://smithery.ai/submit

2. **Submit your package**:
   - Package name: `ynab-mcp-server` (or your chosen name)
   - Repository: `https://github.com/issmirnov/ynab-mcp-server`
   - Description: Auto-filled from package.json

3. **Verify listing**: Your package should appear at `https://smithery.ai/server/ynab-mcp-server`

### Automatic Discovery
Once published to npm, Smithery may automatically discover your package if it:
- Has `mcp` in keywords
- Has a valid `smithery.json` file
- Follows MCP conventions

## Publishing Docker Images

Docker images are published via GitHub Actions to GitHub Container Registry (GHCR).

### Current Setup
Images are automatically built and published to:
```
ghcr.io/issmirnov/ynab-mcp-server:latest
ghcr.io/issmirnov/ynab-mcp-server:v0.1.3
```

### Manual Docker Build and Push

1. **Build the image**:
   ```bash
   docker build -t ghcr.io/issmirnov/ynab-mcp-server:latest .
   docker build -t ghcr.io/issmirnov/ynab-mcp-server:v0.1.3 .
   ```

2. **Test the image**:
   ```bash
   docker run --rm -e YNAB_API_TOKEN=test ghcr.io/issmirnov/ynab-mcp-server:latest
   ```

3. **Login to GHCR**:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

4. **Push the image**:
   ```bash
   docker push ghcr.io/issmirnov/ynab-mcp-server:latest
   docker push ghcr.io/issmirnov/ynab-mcp-server:v0.1.3
   ```

### Automated Publishing via GitHub Actions

The repository should have a GitHub Action workflow that automatically builds and publishes Docker images on:
- Push to `main` branch
- New version tags (e.g., `v0.1.3`)

Example workflow (`.github/workflows/docker-publish.yml`):
```yaml
name: Docker Build and Publish

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v3

      - name: Log in to GHCR
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: ghcr.io/${{ github.repository }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

## Publishing Checklist

Before each release:

- [ ] Update version in `package.json`
- [ ] Update version in `smithery.json`
- [ ] Update version in CLAUDE.md (Project Status section)
- [ ] Run all tests: `npm test`
- [ ] Build the project: `npm run build`
- [ ] Test locally: `npm link && ynab-mcp-server`
- [ ] Test Docker image: `docker build -t test . && docker run --rm -e YNAB_API_TOKEN=test test`
- [ ] Update README if needed
- [ ] Commit all changes
- [ ] Create a git tag: `git tag v0.1.3 && git push origin v0.1.3`
- [ ] Publish to npm: `npm publish`
- [ ] Verify npm package: `npx ynab-mcp-server@latest`
- [ ] Verify Docker image: `docker pull ghcr.io/issmirnov/ynab-mcp-server:latest`
- [ ] Update Smithery listing (if needed)
- [ ] Create GitHub release with release notes

## Troubleshooting

### npm publish fails with "forbidden"
- Ensure you're logged in: `npm whoami`
- Check package ownership: `npm owner ls ynab-mcp-server`
- Consider using a scoped package name: `@yourusername/ynab-mcp-server`

### Docker push fails with "unauthorized"
- Login to GHCR: `echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin`
- Ensure you have write permissions to the repository

### Package not appearing on Smithery
- Ensure package is published to npm
- Ensure `smithery.json` is present
- Submit manually at https://smithery.ai/submit
- Wait 24-48 hours for automatic indexing

### Users can't install via npx
- Verify package is public: `npm view ynab-mcp-server`
- Check that `bin` field is correctly set in package.json
- Ensure `dist/index.js` has a shebang: `#!/usr/bin/env node`
- Test with: `npx ynab-mcp-server@latest`

## Post-Publication

After publishing a new version:

1. **Test installation**:
   ```bash
   # Test npm
   npx -y ynab-mcp-server

   # Test Docker
   docker pull ghcr.io/issmirnov/ynab-mcp-server:latest

   # Test Smithery
   npx -y @smithery/cli install ynab-mcp-server --client claude
   ```

2. **Update documentation**:
   - Update README badges if version changed
   - Update any example code with new version numbers

3. **Announce**:
   - Create GitHub release with release notes
   - Post in relevant communities (if applicable)
   - Update any related blog posts or documentation

## Resources

- [npm Documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [Smithery Documentation](https://smithery.ai/docs)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [MCP Documentation](https://modelcontextprotocol.io/)
