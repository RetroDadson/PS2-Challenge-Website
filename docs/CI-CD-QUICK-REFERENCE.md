# GitHub Actions CI/CD - Quick Reference

## ?? What Happens When

### On Every Push/PR
? Code is checked out  
? .NET 9 SDK is installed  
? Dependencies are restored  
? Solution is built  
? All tests are run (Backend, Main, Integration)  
? Test results are published  
? Code coverage is calculated  

### On Push to Master Only
? All of the above, PLUS:  
? Docker image is built  
? Image is pushed to GitHub Container Registry  
? Multiple tags are created (latest, master, commit-sha)  
? Multi-architecture support (amd64, arm64)  

## ?? Docker Image Location

```
ghcr.io/<your-github-username>/ps2-challenge-website:latest
```

## ?? Quick Commands

### Pull Latest Image
```bash
docker pull ghcr.io/<username>/ps2-challenge-website:latest
```

### Run Container
```bash
docker run -d \
  -p 5001:5001 \
  -e DATABASE_CONNECTION_STRING="Host=localhost;Database=ps2;Username=user;Password=pass" \
  -e TWITCH_CLIENT_ID="your-id" \
  -e TWITCH_CLIENT_SECRET="your-secret" \
  -e ADMIN_API_KEY="your-key" \
  ghcr.io/<username>/ps2-challenge-website:latest
```

### Check Container Health
```bash
docker ps
docker logs <container-id>
curl http://localhost:5001/api/games
```

## ?? Viewing Results

### Test Results
1. Go to GitHub Actions tab
2. Click on the workflow run
3. See "Test Results" in the summary
4. Download artifacts for detailed reports

### Docker Images
1. Go to your repository
2. Click "Packages" on the right sidebar
3. View all published images and tags

### Code Coverage
- Automatically posted as PR comments
- Visible in workflow summary
- Downloadable from artifacts

## ??? Troubleshooting

### Workflow Not Running?
- Check if you pushed to `master`/`main`/`develop`
- Check branch protection rules
- Look at Actions tab for errors

### Docker Build Failing?
- Check Dockerfile syntax
- Ensure all project references are correct
- Review build logs in Actions tab

### Tests Failing?
- Review test output in workflow
- Download test artifacts for detailed logs
- Check if environment-specific issues exist

## ?? Security Notes

- Docker image runs as non-root user
- Secrets are managed via environment variables
- Never commit secrets to repository
- Use GitHub Secrets for sensitive data

## ?? Configuration Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci-cd.yml` | Main workflow definition |
| `Dockerfile` | Container build instructions |
| `.dockerignore` | Files to exclude from image |
| `docs/CI-CD-PIPELINE.md` | Full documentation |

## ?? Next Steps

1. **First Time Setup:**
   - Push to master branch
   - Wait for workflow to complete
   - Check that Docker image is published

2. **Configure Secrets** (if deploying):
   - Add environment-specific secrets in GitHub Settings
   - Update deployment configurations

3. **Monitor Pipeline:**
   - Enable notifications for failed builds
   - Review test coverage trends
   - Keep dependencies updated

## ?? Tips

- **Speed up builds:** Use caching (already configured)
- **Save costs:** Skip Docker build on feature branches
- **Better tests:** Maintain >80% code coverage
- **Security:** Regularly update base images

## ?? Useful Links

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [.NET Testing Best Practices](https://docs.microsoft.com/en-us/dotnet/core/testing/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
