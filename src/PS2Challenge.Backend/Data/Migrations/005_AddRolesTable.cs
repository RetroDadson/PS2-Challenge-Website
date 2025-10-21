using FluentMigrator;

namespace PS2Challenge.Backend.Data;

[Migration(5)]
public class AddRolesTable : Migration
{
    public override void Up()
    {
        // Create roles table
        Create.Table("roles")
            .WithColumn("id").AsInt32().PrimaryKey().Identity()
            .WithColumn("name").AsString(50).NotNullable().Unique()
            .WithColumn("description").AsString(200).Nullable();

        // Insert default roles
        Insert.IntoTable("roles")
            .Row(new { name = "User", description = "Standard user with basic permissions" })
            .Row(new { name = "Admin", description = "Administrator with full permissions" });

        // Add role_id column to users table
        Alter.Table("users")
            .AddColumn("role_id").AsInt32().Nullable()
            .ForeignKey("fk_users_roles", "roles", "id");

        // Migrate existing role data (set all existing users to "User" role)
        Execute.Sql("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'User')");

        // Make role_id required and remove old role column
        Alter.Column("role_id").OnTable("users").AsInt32().NotNullable();
        Delete.Column("role").FromTable("users");
    }

    public override void Down()
    {
        // Re-add the role column
        Alter.Table("users")
            .AddColumn("role").AsString(50).NotNullable().WithDefaultValue("User");

        // Migrate data back
        Execute.Sql(@"
            UPDATE users
            SET role = (SELECT name FROM roles WHERE roles.id = users.role_id)
        ");

        // Remove role_id column and roles table
        Delete.Column("role_id").FromTable("users");
        Delete.Table("roles");
    }
}
