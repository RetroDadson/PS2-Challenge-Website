using Microsoft.AspNetCore.Mvc;
using PS2Challenge.Backend.Services;

namespace PS2Challenge.Api.Api.Controllers;

[ApiController]
[Route("api/games")]
public class GameOwnedController : ControllerBase
{
    private readonly GameService _gameService;

    public GameOwnedController(GameService gameService)
    {
        _gameService = gameService;
    }

    [HttpGet("owned-types")]
    public async Task<IActionResult> GetOwnedTypes()
    {
        var map = await _gameService.GetOwnedTypesAsync();
        return Ok(map);
    }
}
