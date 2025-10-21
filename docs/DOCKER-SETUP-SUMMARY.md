# Docker Compose - Quick Setup Summary

## ?? Files Created

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production configuration |
| `docker-compose.dev.yml` | Development with tools |
| `.env.example` | Environment variables template |
| `nginx/nginx.conf` | Nginx reverse proxy config |
| `docs/DOCKER-COMPOSE-GUIDE.md` | Complete usage guide |

## ? Quick Start (30 seconds)

```bash
# 1. Setup environment
cp .env.example .env
nano .env  # Add your credentials

# 2. Start everything
docker-compose up -d

# 3. Check status
docker-compose ps

# 4. View logs
docker-compose logs -f

# Done! Access at http://localhost:5001
```

## ?? Production Stack

**Services:**
- ? **PostgreSQL 16** - Database (port 5432)
- ? **PS2 Challenge App** - Main application (port 5001)
- ? **Nginx** - Optional HTTPS proxy (ports 80, 443)

**Features:**
- Health checks on all services
- Automatic restarts
- Volume persistence
- Multi-architecture support (amd64, arm64)

## ??? Development Stack

**Additional Services:**
- ?? **pgAdmin** - Database UI (port 5050)
- ?? **Seq** - Log aggregation (port 5341)
- ?? **Redis** - Caching (port 6379)

**Development Features:**
- Source code hot reload
- Debug logging
- Database management UI
- Structured log viewer
- NuGet package caching

## ?? Environment Variables

**Required:**
```bash
GITHUB_USERNAME=your-github-username
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
ADMIN_API_KEY=your-secure-api-key
DB_PASSWORD=your-db-password
```

**Generate Secure Keys:**
```bash
# Admin API Key
openssl rand -base64 32

# Database Password
openssl rand -base64 24
```

## ?? Common Commands

### Start/Stop

```bash
# Production
docker-compose up -d              # Start
docker-compose down               # Stop
docker-compose restart            # Restart

# Development
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml down
```

### View Logs

```bash
docker-compose logs -f              # All services
docker-compose logs -f ps2challenge # Specific service
docker-compose logs --tail=100      # Last 100 lines
```

### Database

```bash
# Access psql
docker-compose exec postgres psql -U postgres -d ps2challenge

# Backup
docker-compose exec postgres pg_dump -U postgres ps2challenge > backup.sql

# Restore
docker-compose exec -T postgres psql -U postgres ps2challenge < backup.sql
```

## ?? Access Points

### Production
| Service | URL | Notes |
|---------|-----|-------|
| Application | http://localhost:5001 | Main app |
| API | http://localhost:5001/api | REST API |
| Swagger | http://localhost:5001/swagger | API docs |
| Database | localhost:5432 | PostgreSQL |

### Development
| Service | URL | Credentials |
|---------|-----|-------------|
| Application | http://localhost:5001 | - |
| pgAdmin | http://localhost:5050 | See .env |
| Seq Logs | http://localhost:5341 | - |
| Redis | localhost:6379 | - |

## ?? Troubleshooting

**Container won't start:**
```bash
docker-compose logs <service-name>
docker-compose ps
```

**Database connection issues:**
```bash
docker-compose exec postgres pg_isready
# Check .env DATABASE_CONNECTION_STRING
```

**Port already in use:**
```bash
# Change port in docker-compose.yml
ports:
  - "5002:5001"  # Use 5002 instead
```

**Reset everything:**
```bash
docker-compose down -v  # WARNING: Deletes data!
docker-compose up -d
```

## ?? Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Never commit `.env` to git
- [ ] Use HTTPS in production (Nginx)
- [ ] Keep images updated (`docker-compose pull`)
- [ ] Enable firewall rules
- [ ] Regular database backups
- [ ] Monitor logs for suspicious activity

## ?? Monitoring

**Check Health:**
```bash
# Container status
docker-compose ps

# Resource usage
docker-compose stats

# Health checks
curl http://localhost:5001/api/games
```

**Development Logs:**
- Seq: http://localhost:5341
- Structured filtering and search
- Real-time updates

## ?? Deployment

### Option 1: Using Pre-built Image (Recommended)

```bash
# Pull latest from GitHub Container Registry
docker-compose pull
docker-compose up -d
```

### Option 2: Build Locally

```bash
# Build from source
docker-compose build
docker-compose up -d
```

### Option 3: With HTTPS (Production)

```bash
# 1. Get SSL certificates
sudo certbot certonly --standalone -d yourdomain.com

# 2. Copy certs to nginx/ssl/
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem

# 3. Start with Nginx
docker-compose --profile production up -d
```

## ?? Full Documentation

For complete details, see:
- **[Docker Compose Usage Guide](DOCKER-COMPOSE-GUIDE.md)** - Complete reference
- **[CI/CD Pipeline](CI-CD-PIPELINE.md)** - Automated deployment
- **[Quick Reference](CI-CD-QUICK-REFERENCE.md)** - Command cheat sheet

## ?? Tips

- Use `docker-compose.dev.yml` for development
- Use `docker-compose.yml` for production
- Always set strong passwords in `.env`
- Enable HTTPS with Nginx in production
- Regular backups prevent data loss
- Monitor logs with Seq (development)
- Use health checks to ensure uptime

## ?? Getting Help

1. Check logs: `docker-compose logs`
2. Review documentation in `docs/`
3. Verify `.env` configuration
4. Check GitHub Issues
5. Review container health: `docker-compose ps`

---

## ? Pre-flight Checklist

Before deploying to production:

- [ ] `.env` file created with real values
- [ ] Database password is secure
- [ ] Twitch OAuth credentials configured
- [ ] Admin API key generated (32+ characters)
- [ ] SSL certificates obtained (if using HTTPS)
- [ ] Firewall rules configured
- [ ] Backup strategy in place
- [ ] Monitoring solution configured
- [ ] Health check endpoint verified
- [ ] Resource limits set (if needed)

## ?? Next Steps

1. **Setup:** Create `.env` from template
2. **Configure:** Add your credentials
3. **Start:** Run `docker-compose up -d`
4. **Verify:** Check `docker-compose ps`
5. **Test:** Access http://localhost:5001
6. **Monitor:** Watch logs with Seq
7. **Backup:** Setup automated backups
8. **Scale:** Add more instances if needed

Your complete Docker environment is ready to deploy! ??
