namespace PS2Challenge.Backend.Models;

public class VoteHistory
{
    public int HistoryId { get; set; }
    public int GameId { get; set; }
    public int VoteRound { get; set; }
    public int VoteCount { get; set; }
    public int? Position { get; set; }  // 1 = first place, 2 = second place, 3 = third place (null for ties or unranked)
    public string? Notes { get; set; }
}
