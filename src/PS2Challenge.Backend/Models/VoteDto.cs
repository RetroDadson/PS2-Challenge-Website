namespace PS2Challenge.Backend.Models;

public class VoteRoundDto
{
    public int VoteRound { get; set; }
    public string TopGameTitle { get; set; } = string.Empty;
    public int TopVotes { get; set; }
    public int? TopPosition { get; set; }
    public string SecondGameTitle { get; set; } = string.Empty;
    public int SecondVotes { get; set; }
    public int? SecondPosition { get; set; }
    public string LastGameTitle { get; set; } = string.Empty;
    public int LastVotes { get; set; }
    public int? LastPosition { get; set; }
    public string? Notes { get; set; }
}

public class CurrentVoteDto
{
    public string GameTitle { get; set; } = string.Empty;
    public int VoteCount { get; set; }
    public int GameNumber { get; set; }
}
