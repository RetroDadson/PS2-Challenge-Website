using Microsoft.AspNetCore.Mvc;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Services;

namespace PS2Challenge.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GamesController : ControllerBase
{
    private readonly GameService _gameService;

    public GamesController(GameService gameService)
    {
        _gameService = gameService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<GameDto>>> GetGames([FromQuery] string? title = null)
    {
        if (!string.IsNullOrWhiteSpace(title))
        {
            var searchResults = await _gameService.SearchGamesByTitleAsync(title);
            return Ok(searchResults);
        }

        var games = await _gameService.GetAllGamesAsync();
        return Ok(games);
    }

    [HttpPost]
    public async Task<ActionResult<GameDto>> CreateGame([FromBody] GameDto gameDto)
    {
        if (gameDto == null)
        {
            return BadRequest("Game data is required");
        }

        // Validate required fields
        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(gameDto.Title))
        {
            validationErrors.Add("Title is required");
        }
        else if (gameDto.Title.Length > 150)
        {
            validationErrors.Add("Title cannot exceed 150 characters");
        }

        if (string.IsNullOrWhiteSpace(gameDto.Developer))
        {
            validationErrors.Add("Developer is required");
        }
        else if (gameDto.Developer.Length > 100)
        {
            validationErrors.Add("Developer cannot exceed 100 characters");
        }

        if (string.IsNullOrWhiteSpace(gameDto.Publisher))
        {
            validationErrors.Add("Publisher is required");
        }
        else if (gameDto.Publisher.Length > 100)
        {
            validationErrors.Add("Publisher cannot exceed 100 characters");
        }

        if (string.IsNullOrWhiteSpace(gameDto.RegionFirstReleasedIn))
        {
            validationErrors.Add("Region first released in is required");
        }
        else if (gameDto.RegionFirstReleasedIn.Length > 100)
        {
            validationErrors.Add("Region first released in cannot exceed 100 characters");
        }

        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var createdGame = await _gameService.AddGameAsync(gameDto);
            return CreatedAtAction(nameof(GetGames), new { id = createdGame.Id }, createdGame);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }
}
