using Microsoft.AspNetCore.SignalR;

namespace PS2Challenge.Main.Api.Hubs;

public class VotesHub : Hub
{
    public async Task NotifyVotesUpdated()
    {
        await Clients.All.SendAsync("VotesUpdated");
    }
}
