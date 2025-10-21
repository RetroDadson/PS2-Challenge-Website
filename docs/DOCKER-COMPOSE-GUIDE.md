# Docker Compose Usage Guide

## Quick Start

### 1. Production Setup (Using Pre-built Image)

```bash
# Copy environment template
cp .env.example .env

# Edit .env and fill in your values
nano .env  # or use your preferred editor

# Start the stack
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the stack
docker-compose down
```

### 2. Development Setup (With Additional Tools)

```bash
# Copy environment template
cp .env.example .env

# Edit .env with development values
nano .env

# Start development stack
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f ps2challenge-dev

# Stop development stack
docker-compose -f docker-compose.dev.yml down
```

## Available Compose Files

### `docker-compose.yml` - Production

**Services:**
- `postgres` - PostgreSQL 16 database
- `ps2challenge` - Main application (from GHCR)
- `nginx` - Reverse proxy with HTTPS (optional, use profile)

**Usage:**
```bash
# Standard production
docker-compose up -d

# With Nginx reverse proxy
docker-compose --profile production up -d
```

### `docker-compose.dev.yml` - Development

**Services:**
- `postgres` - PostgreSQL 16 database (development)
- `ps2challenge-dev` - Application with source mount
- `pgadmin` - Database management UI (http://localhost:5050)
- `seq` - Log aggregation (http://localhost:5341)
- `redis` - Caching service (optional)

**Usage:**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

## Environment Configuration

### Required Variables

Edit `.env` file with these values:

```bash
# GitHub Container Registry
GITHUB_USERNAME=your-github-username
IMAGE_TAG=latest

# Database
DB_PASSWORD=secure-password-here

# Twitch OAuth
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret

# Admin API
ADMIN_API_KEY=your-secure-api-key
```

### Generate Secure Keys

```bash
# Generate Admin API Key
openssl rand -base64 32

# Generate Database Password
openssl rand -base64 24
```

## Common Commands

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d postgres

# Start with rebuild
docker-compose up -d --build

# Start without daemon mode (see logs)
docker-compose up
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data!)
docker-compose down -v

# Stop specific service
docker-compose stop ps2challenge
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ps2challenge

# Last 100 lines
docker-compose logs --tail=100 ps2challenge

# Since timestamp
docker-compose logs --since 2024-01-01T00:00:00
```

### Service Management

```bash
# Restart service
docker-compose restart ps2challenge

# View running services
docker-compose ps

# Execute command in container
docker-compose exec ps2challenge /bin/bash

# View resource usage
docker-compose stats
```

## Database Management

### Access Database

```bash
# Using psql in container
docker-compose exec postgres psql -U postgres -d ps2challenge

# Using pgAdmin (dev environment)
# Navigate to http://localhost:5050
# Username: admin@ps2challenge.local
# Password: admin (or your PGADMIN_PASSWORD)
```

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres ps2challenge > backup.sql

# Or use mounted backup directory
docker-compose exec postgres pg_dump -U postgres ps2challenge > /backups/backup_$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T postgres psql -U postgres ps2challenge < backup.sql
```

### Database Migrations

```bash
# Migrations run automatically on startup
# To run manually:
docker-compose exec ps2challenge dotnet run --project /src/src/PS2Challenge.Main
```

## Development Workflow

### Hot Reload Development

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Source code is mounted, changes are reflected automatically
# Edit files locally and the container will rebuild

# View application logs
docker-compose -f docker-compose.dev.yml logs -f ps2challenge-dev
```

### Access Development Tools

| Tool | URL | Credentials |
|------|-----|-------------|
| Application | http://localhost:5001 | - |
| Swagger | http://localhost:5001/swagger | - |
| pgAdmin | http://localhost:5050 | See .env |
| Seq Logs | http://localhost:5341 | - |
| PostgreSQL | localhost:5432 | postgres / ${DB_PASSWORD} |
| Redis | localhost:6379 | - |

### Run Tests in Container

```bash
# Run all tests
docker-compose -f docker-compose.dev.yml exec ps2challenge-dev \
  dotnet test /src/PS2Challenge.sln

# Run specific test project
docker-compose -f docker-compose.dev.yml exec ps2challenge-dev \
  dotnet test /src/src/PS2Challenge.Backend.Tests
```

## Production Deployment

### With Nginx Reverse Proxy

1. **Generate SSL Certificates:**

```bash
# Using Let's Encrypt (recommended)
# Install certbot first
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

2. **Update nginx.conf:**

```bash
# Edit nginx/nginx.conf
# Change server_name from _ to your-domain.com
```

3. **Start with Nginx:**

```bash
docker-compose --profile production up -d
```

### Health Checks

```bash
# Application health
curl http://localhost:5001/api/games

# Container health status
docker-compose ps

# Detailed health info
docker inspect ps2challenge-app | grep -A 10 Health
```

## Scaling

### Horizontal Scaling

```bash
# Scale application instances
docker-compose up -d --scale ps2challenge=3

# Note: Requires load balancer (Nginx) to distribute traffic
```

### Resource Limits

Edit `docker-compose.yml` to add resource constraints:

```yaml
services:
  ps2challenge:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          memory: 1G
```

## Troubleshooting

### Check Service Status

```bash
# All services
docker-compose ps

# Specific service health
docker-compose exec postgres pg_isready -U postgres

# Container resource usage
docker-compose stats
```

### View Container Logs

```bash
# Application logs
docker-compose logs ps2challenge

# Database logs
docker-compose logs postgres

# Nginx logs
docker-compose logs nginx
```

### Connect to Container

```bash
# Interactive shell in application
docker-compose exec ps2challenge /bin/bash

# Interactive shell in database
docker-compose exec postgres /bin/sh

# Run single command
docker-compose exec ps2challenge ls -la /app
```

### Common Issues

**Issue: Port already in use**
```bash
# Find process using port
sudo lsof -i :5001

# Kill process or change port in docker-compose.yml
```

**Issue: Database connection failed**
```bash
# Check database is healthy
docker-compose exec postgres pg_isready

# Check connection string in .env
# Ensure DATABASE_CONNECTION_STRING uses service name 'postgres' as host
```

**Issue: Permission denied**
```bash
# Fix volume permissions
sudo chown -R 1000:1000 ./nginx

# Or run container as root (not recommended)
```

## Monitoring

### Resource Usage

```bash
# Real-time stats
docker-compose stats

# Detailed container info
docker-compose ps -a
```

### Log Aggregation (Development)

Access Seq at http://localhost:5341 to view structured logs with:
- Filtering and search
- Real-time updates
- Log levels and filtering
- Query language

## Backup and Restore

### Full Backup

```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres ps2challenge > db_backup.sql

# Backup volumes
docker run --rm -v ps2challenge-postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data
```

### Full Restore

```bash
# Restore database
docker-compose exec -T postgres psql -U postgres ps2challenge < db_backup.sql

# Restore volumes
docker run --rm -v ps2challenge-postgres-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-backup.tar.gz -C /
```

## Cleanup

### Remove Everything

```bash
# Stop and remove containers, networks
docker-compose down

# Remove volumes (WARNING: deletes all data!)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

### Prune Unused Resources

```bash
# Remove unused containers, networks, images
docker system prune -a

# Remove unused volumes
docker volume prune
```

## Security Best Practices

1. **Never commit `.env` file** - Use `.env.example` as template
2. **Use strong passwords** - Generate with `openssl rand -base64 32`
3. **Update regularly** - Pull latest images: `docker-compose pull`
4. **Limit network exposure** - Use internal networks for database
5. **Monitor logs** - Check for unauthorized access attempts
6. **Backup regularly** - Automate database and volume backups
7. **Use HTTPS in production** - Configure Nginx with valid SSL certificates

## Performance Tuning

### PostgreSQL Tuning

Edit docker-compose.yml:

```yaml
postgres:
  command:
    - postgres
    - -c
    - shared_buffers=256MB
    - -c
    - max_connections=200
    - -c
    - effective_cache_size=1GB
```

### Application Tuning

```yaml
ps2challenge:
  environment:
    # Increase Kestrel limits
    - Kestrel__Limits__MaxConcurrentConnections=100
    - Kestrel__Limits__MaxConcurrentUpgradedConnections=100
```

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Documentation](https://hub.docker.com/_/postgres)
- [Nginx Docker Documentation](https://hub.docker.com/_/nginx)
- [ASP.NET Core Docker Documentation](https://docs.microsoft.com/en-us/aspnet/core/host-and-deploy/docker/)
