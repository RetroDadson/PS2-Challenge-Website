# CI/CD Pipeline Documentation

## Overview

This repository uses GitHub Actions for continuous integration and deployment. The pipeline automatically builds, tests, and (on master branch) creates Docker containers for the PS2 Challenge application.

## Pipeline Stages

### 1. Build and Test (All Branches)

**Triggers:**
- Push to `master`, `main`, or `develop` branches
- Pull requests to `master` or `main`
- Manual workflow dispatch

**Steps:**
1. **Checkout Code** - Retrieves the repository code
2. **Setup .NET 9** - Installs .NET 9 SDK
3. **Cache NuGet Packages** - Speeds up builds by caching dependencies
4. **Restore Dependencies** - Downloads required NuGet packages
5. **Build Solution** - Compiles all projects in Release configuration
6. **Run Tests** - Executes three test suites:
   - Backend Tests (`PS2Challenge.Backend.Tests`)
   - Main Tests (`PS2Challenge.Main.Tests`)
   - Integration Tests (`PS2Challenge.IntegrationTests`)
7. **Publish Test Results** - Creates test result reports
8. **Upload Test Results** - Stores test results as artifacts (30-day retention)
9. **Code Coverage Report** - Generates code coverage statistics
10. **Add Coverage PR Comment** - Posts coverage results to pull requests
11. **Publish for Azure** - Creates deployment package for Azure App Service (master only)
12. **Upload Artifact** - Stores Azure package for deployment job (master only)

### 2. Deploy to Azure App Service (Master Branch Only)

**Triggers:**
- Push to `master` branch only
- Requires successful build-and-test job

**Steps:**
1. **Download Artifact** - Retrieves published application package
2. **Deploy to Azure** - Deploys to Azure App Service using publish profile
3. **Test Deployment** - Verifies deployment health endpoint

**Environment:** `production` (can be configured for approval gates)

### 3. Docker Build and Push (Master Branch Only)

**Triggers:**
- Push to `master` branch only
- Requires successful build-and-test job

**Steps:**
1. **Checkout Code** - Retrieves the repository code
2. **Set up Docker Buildx** - Enables multi-platform builds
3. **Log in to Container Registry** - Authenticates with GitHub Container Registry
4. **Extract Metadata** - Generates Docker tags and labels
5. **Build and Push** - Creates and publishes Docker image with multiple tags:
   - `latest` (for master branch)
   - `master-<short-sha>` (commit-specific tag)
   - `<branch-name>` (branch tag)
6. **Generate Attestation** - Creates build provenance for security

### 4. Summary (Always Runs)

**Steps:**
1. **Check Job Statuses** - Creates a pipeline summary in GitHub Actions UI

## Docker Image

### Image Tags

The Docker image is published to GitHub Container Registry (GHCR) with multiple tags:

```
ghcr.io/<username>/ps2-challenge-website:latest
ghcr.io/<username>/ps2-challenge-website:master
ghcr.io/<username>/ps2-challenge-website:master-abc1234
```

### Multi-Architecture Support

The Docker image is built for:
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

### Image Details

**Base Images:**
- Build: `mcr.microsoft.com/dotnet/sdk:9.0`
- Runtime: `mcr.microsoft.com/dotnet/aspnet:9.0`

**Exposed Port:** 5001

**Health Check:** `http://localhost:5001/api/games`

**User:** Non-root user (`appuser`, UID 1000)

## Running the Docker Container

### Pull the Image

```bash
docker pull ghcr.io/<username>/ps2-challenge-website:latest
```

### Run Locally

```bash
docker run -d \
  --name ps2challenge \
  -p 5001:5001 \
  -e DATABASE_CONNECTION_STRING="your-connection-string" \
  -e TWITCH_CLIENT_ID="your-twitch-client-id" \
  -e TWITCH_CLIENT_SECRET="your-twitch-client-secret" \
  -e ADMIN_API_KEY="your-admin-api-key" \
  ghcr.io/<username>/ps2-challenge-website:latest
```

### Required Environment Variables

The application requires these environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_CONNECTION_STRING` | PostgreSQL connection string | Yes |
| `TWITCH_CLIENT_ID` | Twitch OAuth client ID | Yes |
| `TWITCH_CLIENT_SECRET` | Twitch OAuth client secret | Yes |
| `ADMIN_API_KEY` | API key for admin operations | Yes |
| `ASPNETCORE_ENVIRONMENT` | Environment name (Production/Development) | No |

### Docker Compose Example

The repository includes ready-to-use Docker Compose configurations:

#### Production (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  ps2challenge:
    image: ghcr.io/<username>/ps2-challenge-website:latest
    ports:
      - "5001:5001"
    environment:
      - DATABASE_CONNECTION_STRING=Host=postgres;Database=ps2challenge;Username=postgres;Password=yourpassword
      - TWITCH_CLIENT_ID=your-twitch-client-id
      - TWITCH_CLIENT_SECRET=your-twitch-client-secret
      - ADMIN_API_KEY=your-admin-api-key
      - ASPNETCORE_ENVIRONMENT=Production
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=ps2challenge
      - POSTGRES_PASSWORD=yourpassword
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres-data:
```

#### Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your values
nano .env

# 3. Start the stack
docker-compose up -d

# 4. View logs
docker-compose logs -f

# 5. Access application
curl http://localhost:5001/api/games
```

#### Development Setup

For development with hot reload and additional tools:

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Includes:
# - PostgreSQL database
# - pgAdmin (http://localhost:5050)
# - Seq log viewer (http://localhost:5341)
# - Redis cache
# - Source code hot reload
```

**See [Docker Compose Usage Guide](DOCKER-COMPOSE-GUIDE.md) for complete documentation.**

## Test Results

### Viewing Test Results

Test results are available in multiple ways:

1. **GitHub Actions Summary**
   - Navigate to Actions tab ? Select workflow run
   - View "Test Results" in the summary

2. **Pull Request Comments**
   - Test results are automatically commented on PRs
   - Code coverage summary is included

3. **Artifacts**
   - Download test results from workflow artifacts
   - Includes TRX files and coverage reports
   - Retained for 30 days

### Code Coverage

Code coverage is collected for all test runs:

- **Format:** Cobertura XML
- **Thresholds:** 60% (warning), 80% (good)
- **Reports:** Automatically posted to PRs

## GitHub Secrets

### Required Secrets

#### For Docker Deployment (Automatic)
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions
  - Used for publishing Docker images to GHCR
  - Used for posting test results and comments

#### For Azure Deployment (Must Configure)
- `AZURE_WEBAPP_PUBLISH_PROFILE` - Azure App Service publish profile
  - Download from Azure Portal or use Azure CLI
  - See [Azure Deployment Guide](AZURE-DEPLOYMENT.md) for details

### How to Get Azure Publish Profile

**Option 1: Azure Portal**
1. Go to your App Service in Azure Portal
2. Click **Get publish profile** in the toolbar
3. Copy entire contents of downloaded file
4. Add to GitHub Secrets as `AZURE_WEBAPP_PUBLISH_PROFILE`

**Option 2: Azure CLI**
```bash
az webapp deployment list-publishing-profiles \
  --resource-group your-resource-group \
  --name your-app-name \
  --xml
```

### Optional Secrets

For deployment to external registries (Docker Hub, etc.), add:

- `DOCKER_USERNAME` - Docker Hub username
- `DOCKER_PASSWORD` - Docker Hub password/token

## Workflow Customization

### Modify Trigger Branches

Edit `.github/workflows/ci-cd.yml`:

```yaml
on:
  push:
    branches: [ master, main, develop, feature/* ]  # Add branches here
  pull_request:
    branches: [ master, main ]
```

### Change Docker Registry

To use Docker Hub instead of GHCR:

```yaml
env:
  REGISTRY: docker.io
  IMAGE_NAME: yourusername/ps2-challenge-website
```

Then update login step:

```yaml
- name: Log in to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}
```

### Modify Test Configuration

To change test parameters:

```yaml
- name: Run Tests
  run: |
    dotnet test \
      --filter "Category!=LongRunning" \  # Add test filters
      --logger "trx" \
      --collect:"XPlat Code Coverage" \
      --settings coverlet.runsettings    # Add custom settings
```

## Performance Optimizations

The pipeline includes several optimizations:

1. **NuGet Package Caching** - Speeds up dependency restoration
2. **Docker Layer Caching** - Reuses unchanged layers (GitHub Actions Cache)
3. **Multi-stage Builds** - Minimizes final image size
4. **Parallel Test Execution** - Runs test projects concurrently

## Troubleshooting

### Build Failures

**Problem:** Build fails with NuGet restore errors

**Solution:**
```bash
# Clear NuGet cache
dotnet nuget locals all --clear
# Restore with diagnostics
dotnet restore --verbosity detailed
```

**Problem:** Docker build fails

**Solution:**
```bash
# Build locally to test
docker build -t ps2challenge:test .
# Check logs
docker logs ps2challenge:test
```

### Test Failures

**Problem:** Integration tests fail in CI but pass locally

**Solution:**
- Check test environment setup
- Ensure test projects don't depend on local resources
- Review test isolation and cleanup

**Problem:** Flaky tests

**Solution:**
- Add retry logic to integration tests
- Increase timeouts
- Use `[Retry]` attribute from xUnit

### Docker Issues

**Problem:** Container fails to start

**Solution:**
```bash
# Check environment variables
docker run --rm ps2challenge:latest env

# Check logs
docker logs ps2challenge

# Run interactively
docker run -it --entrypoint /bin/bash ps2challenge:latest
```

## Monitoring

### Pipeline Status Badge

Add to your README.md:

```markdown
![CI/CD Pipeline](https://github.com/<username>/ps2-challenge-website/actions/workflows/ci-cd.yml/badge.svg)
```

### Container Health

The Docker image includes a health check:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' ps2challenge

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' ps2challenge
```

## Security

### Image Scanning

Consider adding vulnerability scanning:

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tags }}
    format: 'sarif'
    output: 'trivy-results.sarif'

- name: Upload Trivy results to GitHub Security
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: 'trivy-results.sarif'
```

### Best Practices

1. **Non-root User** - Container runs as `appuser` (UID 1000)
2. **Minimal Base Image** - Uses official .NET runtime (not SDK)
3. **Attestation** - Build provenance for supply chain security
4. **Secrets Management** - Never hardcode secrets in Dockerfile

## Cost Optimization

### GitHub Actions Minutes

- **Free Tier:** 2,000 minutes/month for public repos
- **Optimization Tips:**
  - Use caching to reduce build times
  - Skip Docker build on non-master branches
  - Cancel redundant workflow runs

### Storage

- **Test Artifacts:** Retained for 30 days
- **Docker Images:** Use GHCR's free tier for public repos
- **Optimization:** Clean up old image versions

## Support

For issues or questions:

1. Check GitHub Actions logs
2. Review this documentation
3. Open an issue in the repository
4. Contact the development team

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01 | Initial CI/CD pipeline setup |
