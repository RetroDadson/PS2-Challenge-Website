using FluentMigrator;

namespace PS2Challenge.Backend.Data;

[Migration(6)]
public class AddVoteHistoryNotes : Migration
{
    public override void Up()
    {
        // Add nullable unlimited-length notes column to vote_history
        Alter.Table("vote_history")
            .AddColumn("notes").AsString(int.MaxValue).Nullable();
    }

    public override void Down()
    {
        // Remove the notes column
        if (Schema.Table("vote_history").Column("notes").Exists())
        {
            Delete.Column("notes").FromTable("vote_history");
        }
    }
}
