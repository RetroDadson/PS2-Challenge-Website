using FluentMigrator;

namespace PS2Challenge.Backend.Data;

[Migration(5)]
public class AddRolesTable : Migration
{
    private const string RolesTable = "roles";
    private const string UsersTable = "users";

    public override void Up()
    {
        // Create roles table
        Create.Table(RolesTable)
            .WithColumn("id").AsInt32().PrimaryKey().Identity()
            .WithColumn("name").AsString(50).NotNullable().Unique()
            .WithColumn("description").AsString(200).Nullable();

        // Insert default roles
        Insert.IntoTable(RolesTable)
            .Row(new { name = "User", description = "Standard user with basic permissions" })
            .Row(new { name = "Admin", description = "Administrator with full permissions" });

        // Add role_id column to users table
        Alter.Table(UsersTable)
            .AddColumn("role_id").AsInt32().Nullable()
            .ForeignKey("fk_users_roles", RolesTable, "id");

        // Migrate existing role data (set all existing users to "User" role)
        Execute.Sql($"UPDATE {UsersTable} SET role_id = (SELECT id FROM {RolesTable} WHERE name = 'User')");

        // Make role_id required and remove old role column
        Alter.Column("role_id").OnTable(UsersTable).AsInt32().NotNullable();
        Delete.Column("role").FromTable(UsersTable);
    }

    public override void Down()
    {
        // Re-add the role column
        Alter.Table(UsersTable)
            .AddColumn("role").AsString(50).NotNullable().WithDefaultValue("User");

        // Migrate data back
        Execute.Sql($@"
            UPDATE {UsersTable}
            SET role = (SELECT name FROM {RolesTable} WHERE {RolesTable}.id = {UsersTable}.role_id)
        ");

        // Remove role_id column and roles table
        Delete.Column("role_id").FromTable(UsersTable);
        Delete.Table(RolesTable);
    }
}
