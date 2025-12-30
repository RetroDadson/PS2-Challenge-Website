# End-to-End User Perspective Tests

This document describes the new end-to-end testing approach for the PS2 Challenge website, which tests the application from a **user's perspective** rather than testing internal implementation details.

## Overview

We've implemented comprehensive Blazor component tests using **bUnit** that simulate how real users interact with the website. These tests focus on:

- **What users see** - Verifying visible content and UI elements
- **What users can do** - Testing interactive features and workflows  
- **How users navigate** - Validating complete user journeys
- **User feedback** - Ensuring appropriate responses to user actions

## Technology Stack

- **bUnit 2.4.2** - Blazor component testing framework
- **xUnit** - Test runner and assertion framework
- **Moq** - Mocking framework for dependencies
- **AngleSharp** - HTML parsing and querying (via bUnit)

## Test Categories

### 1. Games Page Tests (`GamesPageTests.cs`)

Tests how users browse and filter the game library:

```csharp
? User sees page title when visiting games page
? User sees all available games displayed
? User can search for specific games
? User can filter games by genre
? User can reset filters
? User sees game statistics
? User sees game details (title, year, genre, developer)
? All filter controls are accessible
```

**Example Test:**
```csharp
[Fact]
public void GamesPage_WhenUserSearches_OnlyMatchingGamesAreVisible()
{
    // Arrange - Setup test games
    // Act - User types "God of War" in search box
    // Assert - Verify search term is captured
}
```

### 2. Votes Page Tests (`VotesPageTests.cs`)

Tests the voting experience from a user's perspective:

```csharp
? User sees voting page title
? User sees all games available for voting
? User sees current vote counts
? Authenticated user can vote
? Unauthenticated user sees login prompt
? User who already voted cannot vote again
? User sees voting rankings/leaderboard
? User sees appropriate feedback for edge cases
? Vote counts update in real-time
? Only incomplete games are shown for voting
```

**Example Test:**
```csharp
[Fact]
public void VotesPage_UserWhoAlreadyVoted_CannotVoteAgain()
{
    // Arrange - Setup user who has already voted
    // Act - User visits voting page
    // Assert - Shows which game they voted for
}
```

### 3. Admin Page Tests (`AdminPageTests.cs`)

Tests administrative functions from admin user perspective:

```csharp
? Admin user can access admin page
? Regular user is denied access
? Unauthenticated user is denied access
? Admin sees game management section
? Admin sees user management section
? Admin can mark games as complete
? Admin can add new games
? Admin can edit existing games
? Admin can delete games
? Admin sees site statistics
? Admin can manage user roles
? Admin sees recent user activity
```

**Example Test:**
```csharp
[Fact]
public void AdminPage_AsAdminUser_CanAccessPage()
{
    // Arrange - Setup admin user with role
    // Act - Admin navigates to admin page
    // Assert - Page loads successfully
}
```

### 4. Authentication Flow Tests (`AuthenticationFlowTests.cs`)

Tests login, logout, and authentication states:

```csharp
? Unauthenticated user sees login button
? Authenticated user sees their username
? Authenticated user sees logout button
? Admin user sees admin navigation link
? Regular user does not see admin link
? Navigation is accessible and working
? User profile image is displayed (when available)
? Login redirects to Twitch authentication
? Logout clears user session
? Return URL is preserved after login
? Authentication failures are handled gracefully
? UI updates when authentication state changes
```

**Example Test:**
```csharp
[Fact]
public void Website_WhenUserIsLoggedIn_ShowsUserInfo()
{
    // Arrange - Setup authenticated user
    // Act - User views the website
    // Assert - Username is displayed
}
```

### 5. User Journey Tests (`UserJourneyTests.cs`)

Tests complete end-to-end user scenarios:

```csharp
? New visitor browses games and votes
? Returning user checks their previous vote
? User filters and explores games
? Community voting progression over time
? Game completion updates across pages
? Responsive user experience for edge cases
```

**Example Test:**
```csharp
[Fact]
public void UserJourney_NewVisitor_BrowsesGamesAndVotes()
{
    // Step 1: User visits website (not logged in)
    // Step 2: User browses games page
    // Step 3: User searches for a game
    // Step 4: User views voting page
    // Step 5: User logs in
    // Step 6: User returns to voting and can now vote
    // Assert: Complete journey successful
}
```

## Key Testing Patterns

### Pattern 1: Arrange-Act-Assert

All tests follow the AAA pattern:

```csharp
[Fact]
public void TestName_Scenario_ExpectedBehavior()
{
    // Arrange - Setup test data and dependencies
    var authState = CreateAuthenticatedState("User", "123");
    Services.AddSingleton(authState);
    
    // Act - Perform user action
    var cut = RenderComponent<Games>();
    
    // Assert - Verify what user sees/experiences
    Assert.Contains("Expected Content", cut.Markup);
}
```

### Pattern 2: User-Centric Assertions

Focus on what users experience, not internal state:

```csharp
// ? GOOD - Tests what user sees
Assert.Contains("God of War", cut.Markup);

// ? BAD - Tests internal implementation
Assert.Equal(3, component.Instance.FilteredGames.Count);
```

### Pattern 3: Realistic Test Data

Use realistic game data and user scenarios:

```csharp
var games = new List<Game>
{
    new Game { Title = "God of War", ReleaseYear = 2005, Genre = "Action" },
    new Game { Title = "Shadow of the Colossus", ReleaseYear = 2005, Genre = "Adventure" }
};
```

### Pattern 4: Authentication Helpers

Reusable helpers for authentication states:

```csharp
private AuthenticationStateProvider CreateAuthenticatedState(
    string username, 
    string userId, 
    string role = "User")
{
    var claims = new[]
    {
        new Claim(ClaimTypes.Name, username),
        new Claim(ClaimTypes.NameIdentifier, userId),
        new Claim(ClaimTypes.Role, role)
    };
    // ... create and return authentication state
}
```

## Running the Tests

### Run all tests:
```bash
dotnet test src/PS2Challenge.Main.Tests/PS2Challenge.Main.Tests.csproj
```

### Run specific test category:
```bash
# Games page tests
dotnet test --filter "FullyQualifiedName~GamesPageTests"

# Voting tests
dotnet test --filter "FullyQualifiedName~VotesPageTests"

# Admin tests
dotnet test --filter "FullyQualifiedName~AdminPageTests"

# Authentication tests
dotnet test --filter "FullyQualifiedName~AuthenticationFlowTests"

# User journey tests
dotnet test --filter "FullyQualifiedName~UserJourneyTests"
```

### Run with detailed output:
```bash
dotnet test --logger "console;verbosity=detailed"
```

## Test Coverage

These tests cover:

- ? **User Browsing** - Viewing games, filtering, searching
- ? **User Voting** - Voting process, restrictions, results
- ? **Authentication** - Login, logout, session management
- ? **Authorization** - Role-based access control
- ? **Admin Functions** - Game management, user management
- ? **User Journeys** - Complete workflows from start to finish
- ? **Edge Cases** - Empty states, special characters, large datasets
- ? **Real-time Updates** - SignalR vote updates

## Benefits of This Approach

### 1. **User-Focused**
Tests verify actual user experience, not just code functionality.

### 2. **Refactoring-Safe**
Tests remain valid even when internal implementation changes.

### 3. **Living Documentation**
Test names and scenarios document how users interact with the site.

### 4. **Regression Prevention**
Catches issues that would affect real user workflows.

### 5. **Confidence**
High confidence that features work as users expect.

## Writing New Tests

When adding new tests, follow these guidelines:

### 1. Think Like a User
```csharp
// Ask: "What would a user do? What would they see?"
[Fact]
public void User_WhenSearchingForGames_SeesFilteredResults()
{
    // Simulate user searching
    // Verify what they see
}
```

### 2. Test Happy Paths First
```csharp
[Fact]
public void User_CanSuccessfullyVoteForGame()
{
    // Test the main, expected workflow
}
```

### 3. Then Test Edge Cases
```csharp
[Fact]
public void User_WithoutLogin_CannotVote()
{
    // Test restriction scenarios
}
```

### 4. Use Descriptive Names
```csharp
// Format: [Component]_[Scenario]_[ExpectedResult]
[Fact]
public void GamesPage_WhenNoGames_DisplaysEmptyStateMessage()
```

### 5. Keep Tests Independent
Each test should set up its own data and not depend on other tests.

## Debugging Tests

### View Rendered HTML
```csharp
var cut = RenderComponent<Games>();
Console.WriteLine(cut.Markup); // See rendered HTML
```

### Inspect Specific Elements
```csharp
var element = cut.Find("#search-input");
Console.WriteLine(element.OuterHtml);
```

### Check Component State
```csharp
var cut = RenderComponent<Games>();
// Access public properties if needed for debugging
```

## Integration with CI/CD

These tests run in your CI/CD pipeline alongside other tests:

```yaml
# GitHub Actions example
- name: Run End-to-End Tests
  run: dotnet test src/PS2Challenge.Main.Tests --filter "FullyQualifiedName~Frontend"
```

## Future Enhancements

Potential additions to the test suite:

- [ ] **Playwright Tests** - Full browser automation for complete E2E tests
- [ ] **Performance Tests** - Test rendering performance with large datasets
- [ ] **Accessibility Tests** - Verify ARIA labels, keyboard navigation
- [ ] **Mobile Tests** - Test responsive design behavior
- [ ] **SignalR Tests** - More comprehensive real-time update testing
- [ ] **Visual Regression Tests** - Screenshot comparison testing

## Comparison: Old vs New Approach

### Old Approach (Controller Tests)
```csharp
// Tests HTTP endpoints and JSON responses
[Fact]
public async Task GetGames_ReturnsOk()
{
    var result = await _controller.GetGames();
    Assert.IsType<OkObjectResult>(result);
}
```

### New Approach (User Perspective Tests)
```csharp
// Tests what users actually see and do
[Fact]
public void User_SeesGamesList()
{
    var cut = RenderComponent<Games>();
    Assert.Contains("God of War", cut.Markup);
}
```

## Conclusion

These end-to-end tests provide comprehensive coverage of user interactions with the PS2 Challenge website. They focus on **user experience** rather than implementation details, making them more maintainable and valuable for ensuring the application works as users expect.

For questions or suggestions, please refer to the test files themselves - they are extensively documented and serve as both tests and examples of how the website should behave from a user's perspective.
