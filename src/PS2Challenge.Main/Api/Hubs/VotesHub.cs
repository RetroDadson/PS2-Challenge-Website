using Microsoft.AspNetCore.SignalR;

namespace PS2Challenge.Main.Api.Hubs;

public class VotesHub : Hub
{
	private readonly ILogger<VotesHub> _logger;

	public VotesHub(ILogger<VotesHub> logger)
	{
		_logger = logger;
	}

	public string GetConnectionId()
	{
		if (_logger.IsEnabled(LogLevel.Debug))
		{
			_logger.LogDebug("VotesHub connection requested: {ConnectionId}", Context.ConnectionId);
		}

		return Context.ConnectionId;
	}

	public Task Ping()
	{
		if (_logger.IsEnabled(LogLevel.Debug))
		{
			_logger.LogDebug("VotesHub ping from: {ConnectionId}", Context.ConnectionId);
		}

		return Clients.Caller.SendAsync("Pong");
	}
}
