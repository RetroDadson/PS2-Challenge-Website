using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using PS2Challenge.Api.Api.Models;
using PS2Challenge.Backend.Data.Repositories;
using System.Security.Claims;

namespace PS2Challenge.Api.Api.Controllers;

/// <summary>
/// Handles user authentication via Twitch OAuth and session management
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private const string InternalServerErrorMessage = "Internal server error";

    private readonly UserRepository _userRepository;

    public AuthController(UserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    /// <summary>
    /// Initiate login via Twitch OAuth
    /// </summary>
    /// <param name="returnUrl">Optional URL to redirect to after successful authentication</param>
    /// <returns>Redirect to Twitch OAuth authorization page</returns>
    /// <response code="302">Redirects to Twitch for authentication</response>
    /// <remarks>
    /// Starts the OAuth flow with Twitch. After successful authentication, the user will be redirected
    /// back to the application and then to the specified returnUrl (or home page if not provided).
    /// </remarks>
    [HttpGet("login")]
    [ProducesResponseType(StatusCodes.Status302Found)]
    public IActionResult Login([FromQuery] string? returnUrl = null)
    {
        var properties = new AuthenticationProperties
        {
            AllowRefresh = true,
            IsPersistent = true
        };

        // Store the full return URL (it will be preserved through OAuth flow)
        if (!string.IsNullOrEmpty(returnUrl))
        {
            // The returnUrl comes encoded from the client, decode it
            var decodedUrl = Uri.UnescapeDataString(returnUrl);

            // Store the full URL in the RedirectUri property
            // This will be used after OAuth completes
            properties.RedirectUri = decodedUrl;

            // Also store it in Items for additional safety
            properties.Items["returnUrl"] = decodedUrl;
        }
        else
        {
            properties.RedirectUri = Url.Content("~/");
        }

        return Challenge(properties, "Twitch");
    }

    /// <summary>
    /// Log out the current user
    /// </summary>
    /// <param name="returnUrl">Optional URL to redirect to after logout</param>
    /// <returns>Redirect to specified URL or home page</returns>
    /// <response code="302">Redirects to specified URL or home page after logout</response>
    /// <remarks>
    /// Clears the authentication cookie and ends the user's session.
    /// </remarks>
    [HttpPost("logout")]
    [HttpGet("logout")]
    [ProducesResponseType(StatusCodes.Status302Found)]
    public async Task<IActionResult> Logout([FromQuery] string? returnUrl = null)
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

        Response.Cookies.Delete(".PS2Challenge.Auth", new CookieOptions
        {
            Path = "/",
            SameSite = SameSiteMode.Lax,
            Secure = Request.IsHttps,
            HttpOnly = true
        });

        // Default to home page
        var redirect = "/";

        // Clean up return URL if provided
        if (!string.IsNullOrWhiteSpace(returnUrl))
        {
            var decodedUrl = Uri.UnescapeDataString(returnUrl);
            var uri = new Uri(decodedUrl, UriKind.RelativeOrAbsolute);

            if (uri.IsAbsoluteUri)
            {
                // Extract path from absolute URL
                redirect = uri.PathAndQuery;
            }
            else
            {
                redirect = decodedUrl;
            }

            // Ensure it starts with /
            if (!redirect.StartsWith('/'))
            {
                redirect = "/" + redirect;
            }
        }

        return Redirect(redirect);
    }

    /// <summary>
    /// Get current authenticated user information
    /// </summary>
    /// <returns>User profile including authentication status, username, role, and profile image</returns>
    /// <response code="200">Returns user profile (or unauthenticated status if not logged in)</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Returns user profile information if authenticated. If not authenticated, returns an object
    /// with IsAuthenticated: false. This endpoint can be called without authentication.
    ///
    /// Note: The ApiKey field is intentionally excluded from this response for security reasons.
    /// Use the dedicated /api/user endpoint to retrieve API key information.
    /// </remarks>
    [HttpGet("user")]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetCurrentUser()
    {
        if (User.Identity?.IsAuthenticated is not bool isAuthenticated || !isAuthenticated)
        {
            return Ok(new UserProfileDto { IsAuthenticated = false });
        }

        var twitchId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(twitchId))
        {
            return Ok(new UserProfileDto { IsAuthenticated = false });
        }

        try
        {
            var user = await _userRepository.GetUserByTwitchIdAsync(twitchId);
            if (user == null)
            {
                return Ok(new UserProfileDto { IsAuthenticated = false });
            }

            var profile = new UserProfileDto
            {
                IsAuthenticated = true,
                TwitchId = user.TwitchId,
                Username = user.TwitchUsername,
                ProfileImageUrl = user.ProfileImageUrl,
                Role = user.Role?.Name
            };

            return Ok(profile);
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
        }
    }
}
