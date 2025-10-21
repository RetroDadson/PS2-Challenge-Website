namespace PS2Challenge.Backend.Models;

public class Role
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
}
