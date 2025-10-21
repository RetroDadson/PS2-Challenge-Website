using FluentMigrator;

namespace PS2Challenge.Backend.Data.Migrations;

[Migration(3)]
public class AddUserAuthentication : Migration
{
    public override void Up()
    {
        Create.Table("users")
            .WithColumn("id").AsInt32().PrimaryKey().Identity()
            .WithColumn("twitch_id").AsString(255).NotNullable().Unique()
            .WithColumn("twitch_username").AsString(255).NotNullable()
            .WithColumn("role").AsString(50).NotNullable().WithDefaultValue("User")
            .WithColumn("created_at").AsDateTime().NotNullable().WithDefault(SystemMethods.CurrentDateTime)
            .WithColumn("last_login_at").AsDateTime().NotNullable().WithDefault(SystemMethods.CurrentDateTime);

        Create.Index("idx_users_twitch_id")
            .OnTable("users")
            .OnColumn("twitch_id")
            .Unique();
    }

    public override void Down()
    {
        Delete.Table("users");
    }
}
