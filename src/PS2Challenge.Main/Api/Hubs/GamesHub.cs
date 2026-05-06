using Microsoft.AspNetCore.SignalR;

namespace PS2Challenge.Main.Api.Hubs;

public class GamesHub : Hub
{
	private readonly ILogger<GamesHub> _logger;

	public GamesHub(ILogger<GamesHub> logger)
	{
		_logger = logger;
	}

	public string GetConnectionId()
	{
		if (_logger.IsEnabled(LogLevel.Debug))
		{
			_logger.LogDebug("GamesHub connection requested: {ConnectionId}", Context.ConnectionId);
		}

		return Context.ConnectionId;
	}

	public Task Ping()
	{
		if (_logger.IsEnabled(LogLevel.Debug))
		{
			_logger.LogDebug("GamesHub ping from: {ConnectionId}", Context.ConnectionId);
		}

		return Clients.Caller.SendAsync("Pong");
	}
}
