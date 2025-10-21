using Microsoft.AspNetCore.Authorization;

namespace PS2Challenge.Main.Api.Authorization;

/// <summary>
/// Authorization policy that allows either Cookie or API Key authentication
/// </summary>
public class CookieOrApiKeyAuthorizationPolicy : IAuthorizationRequirement
{
    public string[] AllowedRoles { get; }

    public CookieOrApiKeyAuthorizationPolicy(params string[] allowedRoles)
    {
        AllowedRoles = allowedRoles;
    }
}

/// <summary>
/// Handler for CookieOrApiKeyAuthorizationPolicy
/// Succeeds if user is authenticated via either Cookie or API Key
/// </summary>
public class CookieOrApiKeyAuthorizationHandler : AuthorizationHandler<CookieOrApiKeyAuthorizationPolicy>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        CookieOrApiKeyAuthorizationPolicy requirement)
    {
        // Check if user is authenticated via any method
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            return Task.CompletedTask;
        }

        // If no roles are specified, just authentication is enough
        if (requirement.AllowedRoles == null || requirement.AllowedRoles.Length == 0)
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        // Check if user has any of the required roles
        foreach (var role in requirement.AllowedRoles)
        {
            if (context.User.IsInRole(role))
            {
                context.Succeed(requirement);
                return Task.CompletedTask;
            }
        }

        return Task.CompletedTask;
    }
}
