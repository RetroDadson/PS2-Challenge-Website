# Azure App Service Deployment Guide

## Overview

This guide covers deploying the PS2 Challenge application to Azure App Service using GitHub Actions. The pipeline automatically builds, tests, and deploys to Azure on every push to the master branch.

## Prerequisites

- Azure subscription
- Azure App Service instance
- PostgreSQL database (Azure Database for PostgreSQL or external)
- GitHub repository with Actions enabled

## Azure Setup

### 1. Create Azure App Service

#### Option A: Using Azure Portal

1. **Go to Azure Portal** (https://portal.azure.com)
2. **Create Resource** ? **Web App**
3. **Configure:**
   - **Subscription:** Your subscription
   - **Resource Group:** Create new or use existing
   - **Name:** `ps2challenge-app` (or your preferred name)
   - **Publish:** Code
   - **Runtime stack:** .NET 9 (latest)
   - **Operating System:** Linux
   - **Region:** Choose nearest region
   - **Pricing:** B1 or higher (F1 won't work for .NET 9)

4. **Create** and wait for deployment

#### Option B: Using Azure CLI

```bash
# Login to Azure
az login

# Create resource group
az group create \
  --name ps2challenge-rg \
  --location eastus

# Create App Service plan
az appservice plan create \
  --name ps2challenge-plan \
  --resource-group ps2challenge-rg \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --resource-group ps2challenge-rg \
  --plan ps2challenge-plan \
  --name ps2challenge-app \
  --runtime "DOTNET:9.0"
```

### 2. Create PostgreSQL Database

#### Option A: Azure Database for PostgreSQL

```bash
# Create PostgreSQL server
az postgres flexible-server create \
  --resource-group ps2challenge-rg \
  --name ps2challenge-db \
  --location eastus \
  --admin-user ps2admin \
  --admin-password "YourSecurePassword123!" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --storage-size 32

# Create database
az postgres flexible-server db create \
  --resource-group ps2challenge-rg \
  --server-name ps2challenge-db \
  --database-name ps2challenge

# Configure firewall to allow Azure services
az postgres flexible-server firewall-rule create \
  --resource-group ps2challenge-rg \
  --name ps2challenge-db \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

#### Option B: Use External PostgreSQL

You can use any PostgreSQL database (Heroku, DigitalOcean, AWS RDS, etc.)

### 3. Configure App Service

#### Set Application Settings (Environment Variables)

**Using Azure Portal:**

1. Go to your App Service
2. **Configuration** ? **Application settings**
3. Add the following settings:

| Name | Value | Example |
|------|-------|---------|
| `DATABASE_CONNECTION_STRING` | PostgreSQL connection string | `Host=ps2challenge-db.postgres.database.azure.com;Database=ps2challenge;Username=ps2admin;Password=YourPassword;SSL Mode=Require` |
| `TWITCH_CLIENT_ID` | Your Twitch client ID | `abc123def456` |
| `TWITCH_CLIENT_SECRET` | Your Twitch client secret | `xyz789uvw012` |
| `ADMIN_API_KEY` | Secure admin API key | `generate-with-openssl-rand-base64-32` |
| `ASPNETCORE_ENVIRONMENT` | Environment name | `Production` |
| `WEBSITES_PORT` | Application port | `5001` |

**Using Azure CLI:**

```bash
# Set environment variables
az webapp config appsettings set \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app \
  --settings \
    DATABASE_CONNECTION_STRING="Host=ps2challenge-db.postgres.database.azure.com;Database=ps2challenge;Username=ps2admin;Password=YourPassword;SSL Mode=Require" \
    TWITCH_CLIENT_ID="your-twitch-client-id" \
    TWITCH_CLIENT_SECRET="your-twitch-client-secret" \
    ADMIN_API_KEY="your-admin-api-key" \
    ASPNETCORE_ENVIRONMENT="Production" \
    WEBSITES_PORT="5001"
```

### 4. Get Publish Profile

**Using Azure Portal:**

1. Go to your App Service
2. Click **Get publish profile** (top toolbar)
3. Save the downloaded `.PublishSettings` file
4. Copy the entire contents of the file

**Using Azure CLI:**

```bash
az webapp deployment list-publishing-profiles \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app \
  --xml
```

## GitHub Setup

### 1. Add Azure Publish Profile Secret

1. Go to your GitHub repository
2. **Settings** ? **Secrets and variables** ? **Actions**
3. Click **New repository secret**
4. **Name:** `AZURE_WEBAPP_PUBLISH_PROFILE`
5. **Value:** Paste the entire contents of the publish profile
6. Click **Add secret**

### 2. Update Workflow Configuration

The workflow file (`.github/workflows/ci-cd.yml`) already includes Azure deployment.

Update the Azure Web App name if different:

```yaml
env:
  AZURE_WEBAPP_NAME: ps2challenge-app  # Change to your app name
```

### 3. Configure GitHub Environment (Optional)

For additional protection:

1. **Settings** ? **Environments**
2. Create environment named **production**
3. Add protection rules:
   - Required reviewers
   - Wait timer
   - Deployment branches (master only)

## Pipeline Workflow

### What Happens on Push to Master:

1. **Build and Test** (runs first)
   - Checkout code
   - Setup .NET 9
   - Restore dependencies
   - Build solution
   - Run all tests
   - Publish test results
   - Generate code coverage
   - Publish application for Azure

2. **Deploy to Azure** (runs after tests pass)
   - Download published artifact
   - Deploy to Azure App Service
   - Test deployment health

3. **Build Docker Image** (runs after tests pass)
   - Build multi-arch Docker image
   - Push to GitHub Container Registry
   - Generate attestation

### Deployment Options

You now have **two deployment methods**:

| Method | When | URL |
|--------|------|-----|
| Azure App Service | Every push to master | `https://<your-app-name>.azurewebsites.net` |
| Docker Container | Every push to master | Pull from `ghcr.io/<username>/ps2-challenge-website:latest` |

## Testing Deployment

### 1. Check Deployment Status

**GitHub:**
- Go to **Actions** tab
- View latest workflow run
- Check "Deploy to Azure App Service" job

**Azure Portal:**
- Go to your App Service
- **Deployment Center** ? View deployment logs

### 2. Test Application

```bash
# Test health endpoint
curl https://ps2challenge-app.azurewebsites.net/api/games

# Test Swagger UI
open https://ps2challenge-app.azurewebsites.net/swagger

# Test main application
open https://ps2challenge-app.azurewebsites.net
```

### 3. View Logs

**Azure Portal:**
1. Go to App Service
2. **Monitoring** ? **Log stream**

**Azure CLI:**
```bash
az webapp log tail \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app
```

## Database Migrations

Migrations run automatically on application startup. To run manually:

**Using Azure Portal:**
1. **Development Tools** ? **Console**
2. Run: `dotnet /home/site/wwwroot/PS2Challenge.Main.dll`

**Using Azure CLI:**
```bash
az webapp ssh \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app
```

## Custom Domain and SSL

### 1. Add Custom Domain

```bash
# Add custom domain
az webapp config hostname add \
  --resource-group ps2challenge-rg \
  --webapp-name ps2challenge-app \
  --hostname ps2challenge.yourdomain.com
```

### 2. Configure SSL

Azure provides free managed certificates:

1. **App Service** ? **Custom domains**
2. Click **Add binding** next to your domain
3. Select **App Service Managed Certificate**
4. Click **Add**

## Scaling

### Vertical Scaling (Bigger instance)

```bash
az appservice plan update \
  --resource-group ps2challenge-rg \
  --name ps2challenge-plan \
  --sku P1V2
```

### Horizontal Scaling (More instances)

```bash
az appservice plan update \
  --resource-group ps2challenge-rg \
  --name ps2challenge-plan \
  --number-of-workers 3
```

### Auto-scaling

**Azure Portal:**
1. App Service Plan ? **Scale out (App Service plan)**
2. **Enable autoscale**
3. Configure rules (CPU, memory, etc.)

## Monitoring

### Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app ps2challenge-insights \
  --location eastus \
  --resource-group ps2challenge-rg \
  --application-type web

# Link to App Service
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app ps2challenge-insights \
  --resource-group ps2challenge-rg \
  --query instrumentationKey -o tsv)

az webapp config appsettings set \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app \
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=$INSTRUMENTATION_KEY"
```

### Metrics to Monitor

- **Response Time:** < 200ms
- **HTTP Success Rate:** > 99%
- **CPU Usage:** < 70%
- **Memory Usage:** < 80%
- **Failed Requests:** < 1%

## Cost Optimization

### Development/Staging

Use cheaper tiers:
- **App Service:** B1 Basic (~$13/month)
- **Database:** Burstable B1ms (~$12/month)

### Production

Recommended:
- **App Service:** P1V2 Premium (~$96/month)
- **Database:** General Purpose 2 vCores (~$140/month)

### Cost-Saving Tips

1. **Stop non-production apps when not in use**
2. **Use reserved instances** (1-3 year commitment, up to 65% savings)
3. **Enable auto-scaling** (scale down during low traffic)
4. **Use Azure Hybrid Benefit** (if you have Windows Server licenses)

## Troubleshooting

### Common Issues

**Issue: Deployment succeeds but app doesn't start**

**Solution:**
```bash
# Check logs
az webapp log tail --resource-group ps2challenge-rg --name ps2challenge-app

# Common causes:
# - Missing environment variables
# - Database connection failed
# - Wrong .NET version
```

**Issue: Database connection timeout**

**Solution:**
1. Check firewall rules allow Azure services
2. Verify connection string is correct
3. Enable SSL in connection string: `SSL Mode=Require`

**Issue: 502 Bad Gateway**

**Solution:**
1. App is starting up (wait 30-60 seconds)
2. Check `WEBSITES_PORT` is set to `5001`
3. Check application logs for startup errors

**Issue: High memory usage**

**Solution:**
1. Scale up to larger instance
2. Enable garbage collection server mode
3. Check for memory leaks in code

### Debug Deployment

**Enable detailed logging:**

```bash
az webapp config appsettings set \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app \
  --settings \
    Logging__LogLevel__Default="Debug" \
    ASPNETCORE_DETAILEDERRORS="true"
```

**Access Kudu console:**

https://ps2challenge-app.scm.azurewebsites.net

## Rollback

### Quick Rollback

```bash
# List deployments
az webapp deployment list \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app

# Rollback to previous
az webapp deployment slot swap \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app \
  --slot staging
```

### Manual Rollback

1. Go to GitHub Actions
2. Find previous successful deployment
3. Click **Re-run jobs**

## Best Practices

### 1. Use Deployment Slots

Create staging slot:
```bash
az webapp deployment slot create \
  --resource-group ps2challenge-rg \
  --name ps2challenge-app \
  --slot staging
```

Deploy to staging first, then swap to production.

### 2. Health Checks

Already configured in workflow:
- Tests health endpoint after deployment
- 30-second warmup period
- Retries on failure

### 3. Backup Strategy

```bash
# Enable automatic backups
az webapp config backup update \
  --resource-group ps2challenge-rg \
  --webapp-name ps2challenge-app \
  --backup-name ps2challenge-backup \
  --container-url "<storage-sas-url>" \
  --frequency 1d \
  --retain-one true \
  --retention 30
```

### 4. Security

- Use **Managed Identity** instead of connection strings
- Enable **Azure Key Vault** for secrets
- Configure **Network restrictions**
- Enable **Authentication** (Azure AD)

## Additional Resources

- [Azure App Service Documentation](https://docs.microsoft.com/azure/app-service/)
- [GitHub Actions Azure Deploy](https://github.com/Azure/webapps-deploy)
- [Azure Database for PostgreSQL](https://docs.microsoft.com/azure/postgresql/)
- [Application Insights](https://docs.microsoft.com/azure/azure-monitor/app/app-insights-overview)

## Support

For issues:
1. Check Azure Activity Log
2. Review Application Insights
3. Check deployment logs in GitHub Actions
4. Review App Service logs
5. Open Azure support ticket
