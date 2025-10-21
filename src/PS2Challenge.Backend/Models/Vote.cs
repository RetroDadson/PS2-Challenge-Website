namespace PS2Challenge.Backend.Models;

public class Vote
{
    public int VoteId { get; set; }
    public int VoteRound { get; set; }
    public int GameId { get; set; }
    public DateTime CreatedAt { get; set; }
}
