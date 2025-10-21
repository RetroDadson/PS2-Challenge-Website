using FluentMigrator;

namespace PS2Challenge.Backend.Data;

[Migration(4)]
public class AddProfileImageUrlToUsers : Migration
{
    public override void Up()
    {
        Alter.Table("users")
            .AddColumn("profile_image_url").AsString(500).Nullable();
    }

    public override void Down()
    {
        Delete.Column("profile_image_url").FromTable("users");
    }
}
