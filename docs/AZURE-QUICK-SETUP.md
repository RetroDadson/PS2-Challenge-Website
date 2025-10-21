# Azure Deployment - Quick Setup Guide

## ?? 5-Minute Azure Setup

### Prerequisites
- Azure account with active subscription
- Azure CLI installed (or use Azure Portal)
- GitHub repository with Actions enabled

---

## Step 1: Create Azure Resources (5 minutes)

### Using Azure CLI (Recommended)

```bash
# 1. Login to Azure
az login

# 2. Set variables
RESOURCE_GROUP="ps2challenge-rg"
LOCATION="eastus"
APP_NAME="ps2challenge-app"  # Must be globally unique
DB_SERVER="ps2challenge-db"  # Must be globally unique
DB_PASSWORD="$(openssl rand -base64 24)"

# 3. Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 4. Create App Service Plan (B1 tier)
az appservice plan create \
  --name ${APP_NAME}-plan \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# 5. Create Web App (.NET 9)
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan ${APP_NAME}-plan \
  --name $APP_NAME \
  --runtime "DOTNET:9.0"

# 6. Create PostgreSQL Database
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --location $LOCATION \
  --admin-user ps2admin \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B1ms \
  --version 16 \
  --public-access 0.0.0.0

# 7. Create database
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $DB_SERVER \
  --database-name ps2challenge

# 8. Configure App Service
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings \
    DATABASE_CONNECTION_STRING="Host=${DB_SERVER}.postgres.database.azure.com;Database=ps2challenge;Username=ps2admin;Password=${DB_PASSWORD};SSL Mode=Require" \
    TWITCH_CLIENT_ID="CHANGE_ME" \
    TWITCH_CLIENT_SECRET="CHANGE_ME" \
    ADMIN_API_KEY="$(openssl rand -base64 32)" \
    ASPNETCORE_ENVIRONMENT="Production" \
    WEBSITES_PORT="5001"

echo ""
echo "? Azure resources created!"
echo ""
echo "?? SAVE THESE VALUES:"
echo "Database Password: $DB_PASSWORD"
echo "App URL: https://${APP_NAME}.azurewebsites.net"
echo ""
echo "??  Update Twitch credentials in Azure Portal:"
echo "https://portal.azure.com ? ${APP_NAME} ? Configuration"
```

### Using Azure Portal

1. **Create Web App:**
   - Portal ? Create Resource ? Web App
   - Name: `ps2challenge-app`
   - Runtime: .NET 9
   - OS: Linux
   - Region: East US
   - Plan: B1 Basic

2. **Create PostgreSQL:**
   - Create Resource ? Azure Database for PostgreSQL
   - Flexible Server
   - Version 16
   - Compute: Burstable B1ms
   - Database name: `ps2challenge`

3. **Configure App Settings:**
   - App Service ? Configuration ? Application settings
   - Add the required environment variables (see below)

---

## Step 2: Configure GitHub (2 minutes)

### Get Publish Profile

```bash
# Download publish profile
az webapp deployment list-publishing-profiles \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --xml > publish-profile.xml

# View content
cat publish-profile.xml
```

### Add to GitHub Secrets

1. Go to GitHub repository
2. **Settings** ? **Secrets and variables** ? **Actions**
3. **New repository secret**:
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Value: (paste entire publish profile XML)
4. **Add secret**

---

## Step 3: Update Workflow (1 minute)

Edit `.github/workflows/ci-cd.yml`:

```yaml
env:
  AZURE_WEBAPP_NAME: ps2challenge-app  # ?? Change to your app name
```

Commit and push:

```bash
git add .github/workflows/ci-cd.yml
git commit -m "Configure Azure deployment"
git push origin master
```

---

## Step 4: Deploy! (Automatic)

Push to master triggers deployment:

1. Tests run
2. App deploys to Azure
3. Docker image builds

Check status:
- **GitHub:** Actions tab
- **Azure:** App Service ? Deployment Center

---

## ?? Access Your App

```bash
# Get app URL
az webapp show \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --query defaultHostName -o tsv

# Test deployment
curl https://${APP_NAME}.azurewebsites.net/api/games
```

**URLs:**
- Application: `https://ps2challenge-app.azurewebsites.net`
- Swagger: `https://ps2challenge-app.azurewebsites.net/swagger`

---

## ?? Monitor Deployment

### GitHub Actions

1. Go to **Actions** tab
2. Click latest workflow run
3. Expand **Deploy to Azure App Service**

### Azure Portal

1. Go to App Service
2. **Deployment Center** ? Logs
3. **Monitoring** ? Log stream

---

## ?? Required Environment Variables

Add these in Azure Portal ? App Service ? Configuration:

| Variable | Get From | Example |
|----------|----------|---------|
| `DATABASE_CONNECTION_STRING` | Azure PostgreSQL connection | `Host=....postgres.database.azure.com;...` |
| `TWITCH_CLIENT_ID` | https://dev.twitch.tv/console | `abc123xyz` |
| `TWITCH_CLIENT_SECRET` | https://dev.twitch.tv/console | `secret123` |
| `ADMIN_API_KEY` | `openssl rand -base64 32` | Generate secure key |
| `ASPNETCORE_ENVIRONMENT` | Manual | `Production` |
| `WEBSITES_PORT` | Manual | `5001` |

### Update Twitch Credentials

```bash
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings \
    TWITCH_CLIENT_ID="your-actual-client-id" \
    TWITCH_CLIENT_SECRET="your-actual-client-secret"
```

---

## ??? Troubleshooting

### Check Logs

```bash
# Real-time logs
az webapp log tail \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME

# Download logs
az webapp log download \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --log-file logs.zip
```

### Common Issues

**502 Bad Gateway:**
- App is starting (wait 30-60 seconds)
- Check `WEBSITES_PORT=5001` is set

**Database Connection Failed:**
- Check connection string in Configuration
- Verify firewall allows Azure services
- Ensure `SSL Mode=Require` in connection string

**Deployment Failed:**
- Check GitHub Actions logs
- Verify `AZURE_WEBAPP_PUBLISH_PROFILE` secret is set
- Ensure app name matches in workflow

---

## ?? Cost Estimate

**Development/Testing:**
- App Service (B1): ~$13/month
- PostgreSQL (B1ms): ~$12/month
- **Total: ~$25/month**

**Production:**
- App Service (P1V2): ~$96/month
- PostgreSQL (GP 2 vCore): ~$140/month
- **Total: ~$236/month**

**Free Options:**
- GitHub Actions: 2,000 minutes/month (free tier)
- Container Registry (GHCR): Unlimited for public repos

---

## ?? Security Checklist

Before going to production:

- [ ] Change all default passwords
- [ ] Configure custom domain with SSL
- [ ] Enable Application Insights
- [ ] Set up automatic backups
- [ ] Configure network restrictions
- [ ] Enable Azure AD authentication
- [ ] Review and limit CORS policies
- [ ] Enable diagnostic logging

---

## ?? Next Steps

### 1. Custom Domain

```bash
# Add custom domain
az webapp config hostname add \
  --resource-group $RESOURCE_GROUP \
  --webapp-name $APP_NAME \
  --hostname ps2challenge.yourdomain.com

# Add SSL (free managed certificate)
# Portal ? App Service ? Custom domains ? Add binding
```

### 2. Enable Monitoring

```bash
# Create Application Insights
az monitor app-insights component create \
  --app ${APP_NAME}-insights \
  --location $LOCATION \
  --resource-group $RESOURCE_GROUP
```

### 3. Set Up Staging Slot

```bash
# Create staging slot
az webapp deployment slot create \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --slot staging

# Deploy to staging first, then swap
az webapp deployment slot swap \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --slot staging
```

### 4. Configure Auto-scaling

Portal ? App Service Plan ? Scale out ? Enable autoscale

---

## ?? Resources

- **Full Guide:** [docs/AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md)
- **CI/CD Pipeline:** [docs/CI-CD-PIPELINE.md](CI-CD-PIPELINE.md)
- **Docker Guide:** [docs/DOCKER-COMPOSE-GUIDE.md](DOCKER-COMPOSE-GUIDE.md)

---

## ? Quick Commands Reference

```bash
# View app URL
az webapp show -g $RESOURCE_GROUP -n $APP_NAME --query defaultHostName -o tsv

# View logs
az webapp log tail -g $RESOURCE_GROUP -n $APP_NAME

# Restart app
az webapp restart -g $RESOURCE_GROUP -n $APP_NAME

# Scale up
az appservice plan update -g $RESOURCE_GROUP -n ${APP_NAME}-plan --sku P1V2

# View metrics
az monitor metrics list -g $RESOURCE_GROUP --resource $APP_NAME --metric-names "CpuPercentage,MemoryPercentage"

# Delete everything (CAUTION!)
az group delete -g $RESOURCE_GROUP --yes
```

---

Your Azure deployment is ready! ??

Access your app at: `https://ps2challenge-app.azurewebsites.net`
