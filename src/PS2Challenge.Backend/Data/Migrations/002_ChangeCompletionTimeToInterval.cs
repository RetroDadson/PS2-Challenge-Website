using FluentMigrator;

namespace PS2Challenge.Backend.Data;

[Migration(2)]
public class ChangeCompletionTimeToInterval : Migration
{
    public override void Up()
    {
        // Change completion_time from TIME to INTERVAL to support durations > 24 hours
        Alter.Table("progress")
            .AlterColumn("completion_time").AsCustom("INTERVAL").Nullable();
    }

    public override void Down()
    {
        // Revert back to TIME type
        Alter.Table("progress")
            .AlterColumn("completion_time").AsTime().Nullable();
    }
}
