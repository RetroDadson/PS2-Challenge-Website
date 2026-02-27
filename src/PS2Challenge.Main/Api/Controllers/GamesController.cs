using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PS2Challenge.Api.Api.Models;
using PS2Challenge.Backend.Models;
using PS2Challenge.Backend.Models.Api;
using PS2Challenge.Backend.Services;
using System.Security.Claims;

namespace PS2Challenge.Api.Api.Controllers;

/// <summary>
/// Manages PS2 game catalog including game information, ownership, exclusions, and progress tracking
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class GamesController : ControllerBase
{
    private const string InternalServerErrorMessage = "Internal server error";
    private const string RequestDataRequiredMessage = "Request data is required";
    private const string TitleRequiredMessage = "Title is required";

    private readonly GameService _gameService;
    private readonly ILogger<GamesController> _logger;

    public GamesController(GameService gameService, ILogger<GamesController> logger)
    {
        _gameService = gameService;
        _logger = logger;
    }

    // ============================================================================
    // PUBLIC/ANONYMOUS ENDPOINTS
    // ============================================================================

    /// <summary>
    /// Get all games or search games by title
    /// </summary>
    /// <param name="title">Optional search term to filter games by title (case-insensitive partial match)</param>
    /// <returns>List of games matching the search criteria or all games if no search term provided</returns>
    /// <response code="200">Returns the list of games</response>
    /// <response code="500">Internal server error</response>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<GameDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<IEnumerable<GameDto>>> GetGames([FromQuery] string? title = null)
    {
        IEnumerable<GameDto> games;
        
        if (!string.IsNullOrWhiteSpace(title))
        {
            games = await _gameService.SearchGamesByTitleAsync(title);
        }
        else
        {
            games = await _gameService.GetAllGamesAsync();
        }

        return Ok(games);
    }

    /// <summary>
    /// Get available ownership types for games
    /// </summary>
    /// <returns>List of ownership type codes (e.g., "PAL", "NTSC", "NTSC-J")</returns>
    /// <response code="200">Returns the list of ownership types</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("ownership-types")]
    [ProducesResponseType(typeof(IEnumerable<string>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetOwnershipTypes()
    {
        try
        {
            var ownershipTypes = await _gameService.GetAllOwnershipTypesAsync();
            return Ok(ownershipTypes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ownership types");
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    /// <summary>
    /// Get all games with their progress status
    /// </summary>
    /// <returns>List of games with completion status, dates, and review information</returns>
    /// <response code="200">Returns games with progress information</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("progress")]
    [ProducesResponseType(typeof(IEnumerable<GameProgressDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<IEnumerable<GameProgressDto>>> GetAllProgress()
    {
        var gamesWithProgress = await _gameService.GetAllProgressAsync();
        return Ok(gamesWithProgress);
    }

    /// <summary>
    /// Get detailed information about a specific game by ID
    /// </summary>
    /// <param name="id">The unique identifier of the game</param>
    /// <returns>Complete game details including metadata, ownership, exclusion status, and progress</returns>
    /// <response code="200">Returns the game details</response>
    /// <response code="404">Game not found</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(GameDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetGameById(int id)
    {
        try
        {
            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            return Ok(game);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting game by ID {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    // ============================================================================
    // ADMIN ENDPOINTS - CREATE/UPDATE/DELETE
    // ============================================================================

    /// <summary>
    /// Create a new game in the catalog (Admin only)
    /// </summary>
    /// <param name="gameDto">Game details including title, developer, publisher, and release information</param>
    /// <returns>The newly created game with assigned ID</returns>
    /// <response code="201">Game created successfully</response>
    /// <response code="400">Invalid game data provided</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="409">Conflict - game with this title already exists</response>
    /// <remarks>
    /// Sample request:
    /// 
    ///     POST /api/games
    ///     {
    ///         "title": "Final Fantasy X",
    ///         "developer": "Square",
    ///         "publisher": "Square Enix",
    ///         "regionFirstReleasedIn": "JP",
    ///         "releasedInEuPalOrNa": true,
    ///         "releaseDateJp": "2001-07-19",
    ///         "releaseDateNa": "2001-12-17",
    ///         "releaseDatePal": "2002-05-24"
    ///     }
    /// </remarks>
    [HttpPost]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(typeof(GameDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<GameDto>> CreateGame([FromBody] GameDto gameDto)
    {
        if (gameDto == null)
        {
            return BadRequest(new { message = "Game data is required" });
        }

        // Validate required fields
        var validationErrors = ValidateGameDto(gameDto);
        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var createdGame = await _gameService.AddGameAsync(gameDto);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} created game ID {GameId}: {GameTitle}",
                adminUsername, createdGame.Id, createdGame.Title);

            return CreatedAtAction(nameof(GetGameById), new { id = createdGame.Id }, createdGame);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Update an existing game's information (Admin only)
    /// </summary>
    /// <param name="id">The ID of the game to update</param>
    /// <param name="gameDto">Updated game details</param>
    /// <returns>The updated game information</returns>
    /// <response code="200">Game updated successfully</response>
    /// <response code="400">Invalid game data provided</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="409">Conflict - title already exists for another game</response>
    [HttpPut("{id}")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(typeof(GameDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateGame(int id, [FromBody] GameDto gameDto)
    {
        try
        {
            if (gameDto == null)
            {
                return BadRequest(new { message = "Game data is required" });
            }

            // Validate required fields
            var validationErrors = ValidateGameDto(gameDto);
            if (validationErrors.Any())
            {
                return BadRequest(new { errors = validationErrors });
            }

            var updatedGame = await _gameService.UpdateGameAsync(id, gameDto);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} updated game ID {GameId}: {GameTitle}",
                adminUsername, id, gameDto.Title);

            return Ok(updatedGame);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    /// <summary>
    /// Delete a game from the catalog (Admin only)
    /// </summary>
    /// <param name="id">The ID of the game to delete</param>
    /// <returns>Confirmation message</returns>
    /// <response code="200">Game deleted successfully</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Warning: This action cannot be undone. All associated data (ownership, exclusions, progress) will also be removed.
    /// </remarks>
    [HttpDelete("{id}")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeleteGame(int id)
    {
        try
        {
            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            var success = await _gameService.DeleteGameAsync(id);
            if (!success)
            {
                return StatusCode(500, new { message = "Failed to delete game" });
            }

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} deleted game ID {GameId}: {GameTitle}",
                adminUsername, id, game.Title);

            return Ok(new { message = $"Game '{game.Title}' has been deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    // ============================================================================
    // ADMIN ENDPOINTS - EXCLUSION
    // ============================================================================

    /// <summary>
    /// Exclude a game from the challenge by title (Admin only) - Legacy endpoint
    /// </summary>
    /// <param name="request">Exclusion details including game title and reason</param>
    /// <returns>Exclusion confirmation with assigned ID</returns>
    /// <response code="200">Game excluded successfully</response>
    /// <response code="400">Invalid request data</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="409">Conflict - game not found or already excluded</response>
    /// <remarks>
    /// Note: Prefer using PUT /api/games/{id}/exclusion for better RESTful design.
    /// </remarks>
    [HttpPost("exclude")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ExcludedGame>> ExcludeGame([FromBody] ExcludeGameRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = RequestDataRequiredMessage });
        }

        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            validationErrors.Add(TitleRequiredMessage);
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            validationErrors.Add("Reason is required");
        }

        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var excludedGame = await _gameService.AddExcludedGameAsync(request.Title, request.Reason);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} excluded game ID {GameId}: {GameTitle}",
                adminUsername, excludedGame.GameId, request.Title);

            return Ok(new
            {
                exclusionId = excludedGame.ExclusionId,
                gameId = excludedGame.GameId,
                reason = excludedGame.Reason,
                message = $"Game '{request.Title}' has been excluded"
            });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Update exclusion status for a game by ID (Admin only)
    /// </summary>
    /// <param name="id">The ID of the game to update exclusion status for</param>
    /// <param name="request">Exclusion update details including status and reason</param>
    /// <returns>Confirmation message with updated exclusion status</returns>
    /// <response code="200">Exclusion status updated successfully</response>
    /// <response code="400">Invalid request data - reason required when excluding</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Set isExcluded to true to exclude a game (reason required) or false to include it back in the challenge.
    /// </remarks>
    [HttpPut("{id}/exclusion")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateExclusion(int id, [FromBody] UpdateExclusionRequest request)
    {
        try
        {
            if (request == null)
            {
                return BadRequest(new { message = "Request data is required" });
            }

            if (request.IsExcluded && string.IsNullOrWhiteSpace(request.Reason))
            {
                return BadRequest(new { message = "Reason is required when excluding a game" });
            }

            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            await _gameService.UpdateExclusionAsync(id, request.IsExcluded, request.Reason);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} {Action} game ID {GameId}: {GameTitle}",
                adminUsername,
                request.IsExcluded ? "excluded" : "included",
                id,
                game.Title);

            return Ok(new
            {
                message = request.IsExcluded
                    ? $"Game '{game.Title}' has been excluded"
                    : $"Game '{game.Title}' has been included",
                isExcluded = request.IsExcluded,
                reason = request.Reason
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating exclusion for game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    // ============================================================================
    // ADMIN ENDPOINTS - OWNERSHIP
    // ============================================================================

    /// <summary>
    /// Mark a game as owned by title (Admin only) - Legacy endpoint
    /// </summary>
    /// <param name="request">Ownership details including game title, physical copy status, and type owned</param>
    /// <returns>Ownership confirmation with assigned ID</returns>
    /// <response code="200">Game marked as owned successfully</response>
    /// <response code="400">Invalid request data</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="409">Conflict - game not found or already marked as owned</response>
    /// <remarks>
    /// Note: Prefer using PUT /api/games/{id}/ownership for better RESTful design.
    /// TypeOwned can be values like "Base", "Platinum", etc.
    /// </remarks>
    [HttpPost("owned")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<GameOwned>> AddGameOwned([FromBody] AddGameOwnedRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = RequestDataRequiredMessage });
        }

        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            validationErrors.Add(TitleRequiredMessage);
        }

        validationErrors.AddRange(ValidateOwnershipRequest(request));

        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var gameOwned = await _gameService.AddGameOwnedAsync(
                request.Title,
                request.OwnPhysicalCopy,
                request.TypeOwned);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} marked game ID {GameId}: {GameTitle} as owned",
                adminUsername, gameOwned.GameId, request.Title);

            return Ok(new
            {
                ownershipId = gameOwned.OwnershipId,
                gameId = gameOwned.GameId,
                ownPhysicalCopy = gameOwned.OwnPhysicalCopy,
                typeOwned = gameOwned.TypeOwned,
                message = $"Game '{request.Title}' has been marked as owned"
            });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Update ownership status for a game by ID (Admin only)
    /// </summary>
    /// <param name="id">The ID of the game to update ownership for</param>
    /// <param name="request">Ownership update details including physical copy status and type owned</param>
    /// <returns>Confirmation message with updated ownership status</returns>
    /// <response code="200">Ownership status updated successfully</response>
    /// <response code="400">Invalid request data</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Set both ownPhysicalCopy to false and typeOwned to empty/null to remove ownership status.
    /// </remarks>
    [HttpPut("{id}/ownership")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateOwnership(int id, [FromBody] UpdateOwnershipRequest request)
    {
        try
        {
            if (request == null)
            {
                return BadRequest(new { message = "Request data is required" });
            }

            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            await _gameService.UpdateOwnershipAsync(
                id,
                request.OwnPhysicalCopy,
                request.TypeOwned ?? string.Empty);

            // Determine ownership status based on physical copy or type owned
            bool isOwned = request.OwnPhysicalCopy || !string.IsNullOrWhiteSpace(request.TypeOwned);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} updated ownership for game ID {GameId}: {GameTitle} - Owned: {IsOwned}",
                adminUsername, id, game.Title, isOwned);

            return Ok(new
            {
                message = isOwned
                    ? $"Game '{game.Title}' has been marked as owned"
                    : $"Game '{game.Title}' ownership has been removed",
                isOwned = isOwned,
                ownPhysicalCopy = request.OwnPhysicalCopy,
                typeOwned = request.TypeOwned
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating ownership for game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    // ============================================================================
    // ADMIN ENDPOINTS - PROGRESS
    // ============================================================================

    /// <summary>
    /// Update or create progress tracking for a game (Admin only)
    /// </summary>
    /// <param name="request">Progress details including dates, completion time, criteria, review, and platform</param>
    /// <returns>Updated progress information with assigned ID</returns>
    /// <response code="200">Progress updated successfully</response>
    /// <response code="400">Invalid request data - title and platform required</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Use this endpoint to track when a game was started, completed, and to record reviews.
    /// CompletionTime should be in TimeSpan format (e.g., "25:30:00" for 25 hours 30 minutes).
    /// </remarks>
    [HttpPost("progress")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<GameProgress>> UpdateProgress([FromBody] UpdateProgressRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = RequestDataRequiredMessage });
        }

        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            validationErrors.Add(TitleRequiredMessage);
        }

        if (string.IsNullOrWhiteSpace(request.Platform))
        {
            validationErrors.Add("Platform is required");
        }

        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var progress = await _gameService.UpsertProgressAsync(
                request.Title,
                request.DateStarted,
                request.DateFinished,
                request.CompletionTime,
                request.BeatenCriteria,
                request.Review,
                request.Platform);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} updated progress for game ID {GameId}: {GameTitle}",
                adminUsername, progress.GameId, request.Title);

            return Ok(new
            {
                progressId = progress.ProgressId,
                gameId = progress.GameId,
                dateStarted = progress.DateStarted,
                dateFinished = progress.DateFinished,
                completionTime = progress.CompletionTime,
                beatenCriteria = progress.BeatenCriteria,
                review = progress.Review,
                platform = progress.Platform,
                message = $"Progress for '{request.Title}' has been updated"
            });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    // ============================================================================
    // ADMIN ENDPOINTS - SERIAL NUMBERS
    // ============================================================================

    /// <summary>
    /// Add a serial number for a game by title (Admin only)
    /// </summary>
    /// <param name="request">Serial number details including game title, serial number, region, and notes</param>
    /// <returns>Confirmation with serial number details and game information</returns>
    /// <response code="200">Serial number added successfully</response>
    /// <response code="400">Invalid request data - title and serial number required</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="409">Conflict - serial number already exists for another game</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Each serial number must be unique across all games in the database.
    /// If the serial number already exists, the response will include the game ID and title of the existing game.
    /// 
    /// Sample request:
    /// 
    ///     POST /api/games/serial-numbers
    ///     {
    ///         "title": "Final Fantasy X",
    ///         "serialNumber": "SLUS-20062",
    ///         "region": "NTSC-U",
    ///         "notes": "North American release"
    ///     }
    /// </remarks>
    [HttpPost("serial-numbers")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(typeof(AddSerialNumberResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(SerialNumberConflictResponse), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> AddSerialNumber([FromBody] AddSerialNumberRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = RequestDataRequiredMessage });
        }

        var validationErrors = ValidateAddSerialNumberRequest(request);

        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var serialNumber = await _gameService.AddSerialNumberAsync(
                request.Title,
                request.SerialNumber,
                request.Region,
                request.Notes);

            // Get the game title for the response
            var game = await _gameService.GetGameByIdAsync(serialNumber.GameId);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} added serial number '{SerialNumber}' to game ID {GameId}: {GameTitle}",
                adminUsername, serialNumber.SerialNumber, serialNumber.GameId, game?.Title ?? request.Title);

            var response = new AddSerialNumberResponse
            {
                SerialId = serialNumber.SerialId,
                GameId = serialNumber.GameId,
                GameTitle = game?.Title ?? request.Title,
                SerialNumber = serialNumber.SerialNumber,
                Region = serialNumber.Region,
                Notes = serialNumber.Notes,
                Message = $"Serial number '{serialNumber.SerialNumber}' added successfully to '{game?.Title ?? request.Title}'"
            };

            return Ok(response);
        }
        catch (InvalidOperationException ex)
        {
            return HandleAddSerialNumberInvalidOperation(ex, request);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding serial number for game '{GameTitle}'", request.Title);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    // ============================================================================
    // ADMIN ENDPOINTS - ALTERNATE TITLES
    // ============================================================================

    /// <summary>
    /// Get all alternate titles for a specific game by ID
    /// </summary>
    /// <param name="id">The ID of the game</param>
    /// <returns>List of alternate titles for the game</returns>
    /// <response code="200">Returns the list of alternate titles</response>
    /// <response code="404">Game not found</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("{id}/alternate-titles")]
    [ProducesResponseType(typeof(IEnumerable<AlternateTitle>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetAlternateTitles(int id)
    {
        try
        {
            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            var alternateTitles = await _gameService.GetAlternateTitlesForGameAsync(id);
            return Ok(alternateTitles);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting alternate titles for game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    /// <summary>
    /// Add an alternate title for a game by ID (Admin only)
    /// </summary>
    /// <param name="id">The ID of the game</param>
    /// <param name="request">Alternate title details including title and optional notes</param>
    /// <returns>Confirmation with alternate title details</returns>
    /// <response code="200">Alternate title added successfully</response>
    /// <response code="400">Invalid request data - title required</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game not found</response>
    /// <response code="409">Conflict - alternate title already exists for this game</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Add an alternate title for a game (e.g., regional release names).
    /// 
    /// Sample request:
    /// 
    ///     POST /api/games/1/alternate-titles
    ///     {
    ///         "title": "Ratchet &amp; Clank 2: Going Commando",
    ///         "notes": "North American release title"
    ///     }
    /// </remarks>
    [HttpPost("{id}/alternate-titles")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(typeof(AlternateTitle), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> AddAlternateTitle(int id, [FromBody] AddAlternateTitleRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { message = RequestDataRequiredMessage });
        }

        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            validationErrors.Add(TitleRequiredMessage);
        }
        else if (request.Title.Length > 150)
        {
            validationErrors.Add("Title cannot exceed 150 characters");
        }

        if (!string.IsNullOrWhiteSpace(request.Notes) && request.Notes.Length > 500)
        {
            validationErrors.Add("Notes cannot exceed 500 characters");
        }

        if (validationErrors.Any())
        {
            return BadRequest(new { errors = validationErrors });
        }

        try
        {
            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            var alternateTitle = await _gameService.AddAlternateTitleAsync(
                id,
                request.Title,
                request.Notes);

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} added alternate title '{AlternateTitle}' to game ID {GameId}: {GameTitle}",
                adminUsername, alternateTitle.Title, id, game.Title);

            return Ok(new
            {
                alternateTitleId = alternateTitle.AlternateTitleId,
                gameId = alternateTitle.GameId,
                title = alternateTitle.Title,
                notes = alternateTitle.Notes,
                message = $"Alternate title '{alternateTitle.Title}' added successfully to '{game.Title}'"
            });
        }
        catch (InvalidOperationException ex)
        {
            // Check if this is a duplicate alternate title error
            if (ex.Message.Contains("already exists for game"))
            {
                return Conflict(new { error = ex.Message });
            }
            
            // Otherwise it's a different error (shouldn't happen as we check game existence above)
            _logger.LogError(ex, "Error adding alternate title for game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding alternate title for game {GameId}", id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    /// <summary>
    /// Delete an alternate title by ID (Admin only)
    /// </summary>
    /// <param name="id">The ID of the game</param>
    /// <param name="alternateTitleId">The ID of the alternate title to delete</param>
    /// <returns>Confirmation message</returns>
    /// <response code="200">Alternate title deleted successfully</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">Game or alternate title not found</response>
    /// <response code="500">Internal server error</response>
    [HttpDelete("{id}/alternate-titles/{alternateTitleId}")]
    [Authorize(Policy = "AdminCookieOrApiKey")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> DeleteAlternateTitle(int id, int alternateTitleId)
    {
        try
        {
            var game = await _gameService.GetGameByIdAsync(id);
            if (game == null)
            {
                return NotFound(new { message = $"Game with ID {id} not found" });
            }

            var deleted = await _gameService.DeleteAlternateTitleAsync(id, alternateTitleId);
            if (!deleted)
            {
                return NotFound(new { message = $"Alternate title with ID {alternateTitleId} not found for game ID {id}" });
            }

            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;
            _logger.LogInformation(
                "AUDIT: Admin {AdminUser} deleted alternate title ID {AlternateTitleId} from game ID {GameId}: {GameTitle}",
                adminUsername, alternateTitleId, id, game.Title);

            return Ok(new { message = $"Alternate title deleted successfully from '{game.Title}'" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting alternate title {AlternateTitleId} for game {GameId}", alternateTitleId, id);
            return StatusCode(500, new { message = InternalServerErrorMessage, error = ex.Message });
        }
    }

    private static List<string> ValidateAddSerialNumberRequest(AddSerialNumberRequest request)
    {
        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            validationErrors.Add(TitleRequiredMessage);
        }

        if (string.IsNullOrWhiteSpace(request.SerialNumber))
        {
            validationErrors.Add("Serial number is required");
        }
        else if (request.SerialNumber.Length > 50)
        {
            validationErrors.Add("Serial number cannot exceed 50 characters");
        }

        if (!string.IsNullOrWhiteSpace(request.Region) && request.Region.Length > 50)
        {
            validationErrors.Add("Region cannot exceed 50 characters");
        }

        if (!string.IsNullOrWhiteSpace(request.Notes) && request.Notes.Length > 500)
        {
            validationErrors.Add("Notes cannot exceed 500 characters");
        }

        return validationErrors;
    }

    private IActionResult HandleAddSerialNumberInvalidOperation(InvalidOperationException exception, AddSerialNumberRequest request)
    {
        if (!exception.Message.Contains("already exists for game ID", StringComparison.Ordinal))
        {
            return NotFound(new { error = exception.Message });
        }

        var match = System.Text.RegularExpressions.Regex.Match(
            exception.Message,
            @"game ID (\d+) \('([^']+)'\)",
            System.Text.RegularExpressions.RegexOptions.None,
            TimeSpan.FromMilliseconds(250));

        if (match.Success && int.TryParse(match.Groups[1].Value, out var existingGameId))
        {
            var conflictResponse = new SerialNumberConflictResponse
            {
                Error = $"Serial number '{request.SerialNumber}' already exists",
                ExistingGameId = existingGameId,
                ExistingGameTitle = match.Groups[2].Value,
                SerialNumber = request.SerialNumber
            };

            return Conflict(conflictResponse);
        }

        return Conflict(new { error = exception.Message });
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private static List<string> ValidateGameDto(GameDto gameDto)
    {
        var validationErrors = new List<string>();

        if (string.IsNullOrWhiteSpace(gameDto.Title))
        {
            validationErrors.Add(TitleRequiredMessage);
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

        return validationErrors;
    }

    private static List<string> ValidateOwnershipRequest(AddGameOwnedRequest request)
    {
        var validationErrors = new List<string>();

        if (request.OwnPhysicalCopy && string.IsNullOrWhiteSpace(request.TypeOwned))
        {
            validationErrors.Add("Type owned is required when marking as owned");
        }

        return validationErrors;
    }

    // ============================================================================
    // REQUEST MODELS
    // ============================================================================

    /// <summary>
    /// Request model for updating game exclusion status
    /// </summary>
    public class UpdateExclusionRequest
    {
        /// <summary>
        /// Whether the game should be excluded from the challenge
        /// </summary>
        public bool IsExcluded { get; set; }

        /// <summary>
        /// Reason for exclusion (required if IsExcluded is true)
        /// </summary>
        public string? Reason { get; set; }
    }

    /// <summary>
    /// Request model for updating game ownership status
    /// </summary>
    public class UpdateOwnershipRequest
    {
        /// <summary>
        /// Whether a physical copy of the game is owned
        /// </summary>
        public bool OwnPhysicalCopy { get; set; }

        /// <summary>
        /// Type of copy owned (e.g., "Base", "Platinum")
        /// </summary>
        public string? TypeOwned { get; set; }
    }
}