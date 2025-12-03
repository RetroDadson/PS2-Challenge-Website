using Microsoft.AspNetCore.SignalR;

namespace PS2Challenge.Main.Api.Hubs;

public class GamesHub : Hub
{
    public async Task NotifyGamesUpdated()
    {
        await Clients.All.SendAsync("GamesUpdated");
    }
}
