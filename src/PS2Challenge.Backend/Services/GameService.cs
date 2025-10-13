using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PS2Challenge.Backend.Data;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Services;

public class GameService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public GameService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<IEnumerable<GameDto>> GetAllGamesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        var games = await dbContext.Games
            .OrderBy(g => g.Title)
            .ToListAsync();

        var excludedIds = await dbContext.ExcludedGames.Select(x => x.GameId).ToListAsync();
        var ownedIds = await dbContext.GamesOwned.Select(x => x.GameId).ToListAsync();

        foreach (var game in games)
        {
            game.IsExcluded = excludedIds.Contains(game.Id);
            game.IsOwned = ownedIds.Contains(game.Id);
        }

        return games;
    }

    public async Task<GameDto> AddGameAsync(GameDto gameDto)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Check if game already exists by title
        var existingGame = await dbContext.Games
            .FirstOrDefaultAsync(g => g.Title == gameDto.Title);

        if (existingGame != null)
        {
            throw new InvalidOperationException($"A game with the title '{gameDto.Title}' already exists with ID {existingGame.Id}");
        }

        // Create new game entity
        var newGame = new GameDto
        {
            Title = gameDto.Title,
            Developer = gameDto.Developer,
            Publisher = gameDto.Publisher,
            FirstReleased = gameDto.FirstReleased,
            RegionFirstReleasedIn = gameDto.RegionFirstReleasedIn,
            ReleasedInEuPalOrNa = gameDto.ReleasedInEuPalOrNa
        };

        dbContext.Games.Add(newGame);
        await dbContext.SaveChangesAsync();

        return newGame;
    }

    public async Task<IEnumerable<GameDto>> SearchGamesByTitleAsync(string title)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Ps2ChallengeDbContext>();

        // Search for games with title containing the search term (case-insensitive)
        var games = await dbContext.Games
            .Where(g => EF.Functions.ILike(g.Title, $"%{title}%"))
            .ToListAsync();

        var excludedIds = await dbContext.ExcludedGames.Select(x => x.GameId).ToListAsync();
        var ownedIds = await dbContext.GamesOwned.Select(x => x.GameId).ToListAsync();

        foreach (var game in games)
        {
            game.IsExcluded = excludedIds.Contains(game.Id);
            game.IsOwned = ownedIds.Contains(game.Id);
        }

        return games;
    }

}

public class ExcludedGame
{
    public int GameId { get; set; }
}

public class GameOwned
{
    public int GameId { get; set; }
}