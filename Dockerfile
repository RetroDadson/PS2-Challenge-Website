# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy solution and project files
COPY ["PS2Challenge.sln", "./"]
COPY ["src/PS2Challenge.Main/PS2Challenge.Main.csproj", "src/PS2Challenge.Main/"]
COPY ["src/PS2Challenge.Backend/PS2Challenge.Backend.csproj", "src/PS2Challenge.Backend/"]

# Restore dependencies
RUN dotnet restore "src/PS2Challenge.Main/PS2Challenge.Main.csproj"

# Copy source files
COPY src/ ./src/

# Build and publish the application
WORKDIR "/src/src/PS2Challenge.Main"
RUN dotnet build "PS2Challenge.Main.csproj" -c Release -o /app/build
RUN dotnet publish "PS2Challenge.Main.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy published application
COPY --from=build /app/publish .

# Create a non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl --fail http://localhost:5001/api/games || exit 1

# Set environment variables
ENV ASPNETCORE_URLS=http://+:5001
ENV ASPNETCORE_ENVIRONMENT=Production

# Run the application
ENTRYPOINT ["dotnet", "PS2Challenge.Main.dll"]
