using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PS2Challenge.Backend.Data.Repositories;
using PS2Challenge.Backend.Models;
using System.Security.Claims;

namespace PS2Challenge.Api.Api.Controllers;

/// <summary>
/// Administrative endpoints for user and role management
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AdminCookieOrApiKey")]
public class AdminController : ControllerBase
{
    private const string InternalServerErrorMessage = "Internal server error";

    private readonly UserRepository _userRepository;
    private readonly ILogger<AdminController> _logger;

    public AdminController(UserRepository userRepository, ILogger<AdminController> logger)
    {
        _userRepository = userRepository;
        _logger = logger;
    }

    /// <summary>
    /// Get all registered users with their details (Admin only)
    /// </summary>
    /// <returns>List of all users including their roles, profile images, and activity timestamps</returns>
    /// <response code="200">Returns the list of users</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("users")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetAllUsers()
    {
        try
        {
            _logger.LogInformation("GetAllUsers called by {User}", User.Identity?.Name);

            var users = await _userRepository.GetAllUsersAsync();

            var result = users.Select(u => new
            {
                id = u.Id,
                twitchId = u.TwitchId,
                username = u.TwitchUsername,
                role = u.Role?.Name,
                roleId = u.RoleId,
                profileImageUrl = u.ProfileImageUrl,
                createdAt = u.CreatedAt,
                lastLoginAt = u.LastLoginAt
            }).ToList();

            _logger.LogInformation("Returning {Count} users", result.Count);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return InternalServerError(ex, "Error in GetAllUsers");
        }
    }

    /// <summary>
    /// Get all available user roles (Admin only)
    /// </summary>
    /// <returns>List of roles with their IDs, names, and descriptions</returns>
    /// <response code="200">Returns the list of roles</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="500">Internal server error</response>
    [HttpGet("roles")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetAllRoles()
    {
        try
        {
            _logger.LogInformation("GetAllRoles called by {User}", User.Identity?.Name);

            var roles = await _userRepository.GetAllRolesAsync();

            var result = roles.Select(r => new
            {
                id = r.Id,
                name = r.Name,
                description = r.Description
            }).ToList();

            _logger.LogInformation("Returning {Count} roles", result.Count);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return InternalServerError(ex, "Error in GetAllRoles");
        }
    }

    /// <summary>
    /// Update a user's role (Admin only)
    /// </summary>
    /// <param name="userId">The ID of the user to update</param>
    /// <param name="request">New role ID to assign to the user</param>
    /// <returns>Confirmation with updated user information</returns>
    /// <response code="200">Role updated successfully</response>
    /// <response code="400">Invalid role ID or attempt to remove own admin role</response>
    /// <response code="401">Unauthorized - authentication required</response>
    /// <response code="403">Forbidden - admin access required</response>
    /// <response code="404">User not found</response>
    /// <response code="500">Internal server error</response>
    /// <remarks>
    /// Admins cannot remove their own admin role as a safety measure.
    /// All role changes are logged for auditing purposes.
    /// </remarks>
    [HttpPut("users/{userId}/role")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> UpdateUserRole(int userId, [FromBody] UpdateRoleRequest request)
    {
        var currentUserId = User.FindFirst("UserId")?.Value;
        var currentTwitchId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value;

        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null)
        {
            _logger.LogWarning("Admin {AdminUser} attempted to update role for non-existent user ID {UserId}",
                adminUsername, userId);
            return NotFound(new { message = "User not found" });
        }

        var role = await _userRepository.GetRoleByIdAsync(request.RoleId);
        if (role == null)
        {
            _logger.LogWarning("Admin {AdminUser} attempted to set invalid role ID {RoleId} for user {Username}",
                adminUsername, request.RoleId, user.TwitchUsername);
            return BadRequest(new { message = "Invalid role ID" });
        }

        // Prevent self-demotion from Admin role
        var adminRole = await _userRepository.GetRoleByNameAsync("Admin");
        if (adminRole == null)
        {
            _logger.LogError("Admin role not found when validating role update for user ID {UserId}", userId);
            return StatusCode(500, new { message = "Configuration error: Admin role is missing" });
        }

        if (IsSelfRoleChangeAttempt(currentUserId, currentTwitchId, userId, user) &&
            user.RoleId == adminRole.Id &&
            request.RoleId != adminRole.Id)
        {
            _logger.LogWarning("Admin {AdminUser} attempted to remove their own admin role", adminUsername);
            return BadRequest(new { message = "You cannot remove your own admin role" });
        }

        var oldRole = user.Role?.Name;
        user.RoleId = request.RoleId;
        await _userRepository.UpdateAsync(user);

        // Log the successful role change
        _logger.LogInformation(
            "AUDIT: Admin {AdminUser} (ID: {AdminId}) changed role for user {TargetUser} (ID: {TargetId}) from {OldRole} to {NewRole}",
            adminUsername, currentUserId, user.TwitchUsername, user.Id, oldRole, role.Name);

        return Ok(new
        {
            id = user.Id,
            username = user.TwitchUsername,
            role = role.Name,
            message = $"User role updated to {role.Name}"
        });
    }

    /// <summary>
    /// Request model for updating user roles
    /// </summary>
    public class UpdateRoleRequest
    {
        /// <summary>
        /// The ID of the role to assign to the user
        /// </summary>
        public int RoleId { get; set; }
    }

    private ObjectResult InternalServerError(Exception exception, string message)
    {
        _logger.LogError(exception, "{Message}", message);
        return StatusCode(StatusCodes.Status500InternalServerError, new { message = InternalServerErrorMessage });
    }

    private static bool IsSelfRoleChangeAttempt(string? currentUserId, string? currentTwitchId, int targetUserId, ApplicationUser targetUser)
    {
        if (currentUserId == targetUserId.ToString())
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(currentTwitchId)
            && string.Equals(currentTwitchId, targetUser.TwitchId, StringComparison.Ordinal);
    }
}
