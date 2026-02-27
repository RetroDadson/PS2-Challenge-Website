using Microsoft.AspNetCore.SignalR;

namespace PS2Challenge.Main.Api.Hubs;

public class VotesHub : Hub
{
	public string GetConnectionId()
	{
		return Context.ConnectionId;
	}

	public Task Ping()
	{
		return Clients.Caller.SendAsync("Pong");
	}
}
