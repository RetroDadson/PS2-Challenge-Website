namespace PS2Challenge.Api.Api.Models;

public class UploadRoundDto
{
    public int VoteRound { get; set; }
    public List<UploadGameVote> Votes { get; set; } = new();
    public string? Notes { get; set; }
}

public class UploadGameVote
{
    public string? GameTitle { get; set; }
    public int Count { get; set; }
    public int? Position { get; set; }  // 1 = first, 2 = second, 3 = third (optional for ties)
}

public class ArchiveVotesRequest
{
    public string? Notes { get; set; }
}
