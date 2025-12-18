# PS2 Challenge Website
[![Build and deploy ASP.Net Core app to Azure Web App - retrodadsonchallenge](https://github.com/RobinDadswell/PS2-Challenge-Website/actions/workflows/main_retrodadsonchallenge.yml/badge.svg)](https://github.com/RobinDadswell/PS2-Challenge-Website/actions/workflows/main_retrodadsonchallenge.yml)
## Architecture

- **Blazor Server**: Interactive UI with SignalR for real-time updates
- **ASP.NET Core Web API**: RESTful endpoints for admin operations
- **PostgreSQL**: Database with Entity Framework Core + Dapper
- **Twitch OAuth**: Authentication integration

## Running the Application

### Local Development

```bash
cd src/PS2Challenge.Main
dotnet run
```

Navigate to http://localhost:5001

### Docker Deployment

Pull and run the latest image:

```bash
docker pull ghcr.io/robindadswell/ps2-challenge-website:latest
docker run -d -p 5001:8080 \
  -e ConnectionStrings__DefaultConnection="Host=postgres;Database=ps2challenge;Username=postgres;Password=yourpassword" \
  -e TwitchAuth__ClientId="your_client_id" \
  -e TwitchAuth__ClientSecret="your_client_secret" \
  ghcr.io/robindadswell/ps2-challenge-website:latest
```

Or use Docker Compose (recommended):

```bash
docker-compose up -d
```

See `docker-compose.yml` for full configuration example.

## Features

- ✅ Game library management
- ✅ Progress tracking
- ✅ Vote history
- ✅ Twitch authentication
- ✅ Admin panel for data management

## Benefits of Blazor Server Architecture

- **No CORS configuration**: Everything runs on the same server
- **Direct service injection**: No HTTP calls for data access
- **Seamless authentication**: Cookies work naturally
- **Smaller payload**: Only SignalR connection needed
- **Server-side rendering**: Better SEO and initial load

## Development

The application uses:

- **Blazor Server** for interactive UI (`/Frontend` folder)
- **Web API** controllers for admin operations (`/Api/Controllers` folder)
- **Shared backend** services and data access (`PS2Challenge.Backend` project)

## Troubleshooting

If you encounter issues:

- Ensure PostgreSQL is running
- Check connection string in environment variables
- Verify Twitch OAuth credentials are configured
- Check browser console for SignalR connection errors
