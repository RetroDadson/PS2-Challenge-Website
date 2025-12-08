using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Data;

public class Ps2ChallengeDbContext : DbContext
{
    public Ps2ChallengeDbContext(DbContextOptions<Ps2ChallengeDbContext> options)
        : base(options)
    {
    }

    public DbSet<GameDto> Games { get; set; }
    public DbSet<ExcludedGame> ExcludedGames { get; set; }
    public DbSet<GameOwned> GamesOwned { get; set; }
    public DbSet<GameProgress> GameProgress { get; set; }
    public DbSet<ApplicationUser> Users { get; set; }
    public DbSet<Role> Roles { get; set; }
    public DbSet<Vote> Votes { get; set; }
    public DbSet<VoteHistory> VoteHistory { get; set; }
    public DbSet<CurrentVote> CurrentVotes { get; set; }
    public DbSet<OwnershipType> OwnershipTypes { get; set; }
    public DbSet<GameSerialNumber> GameSerialNumbers { get; set; }
    public DbSet<AlternateTitle> AlternateTitles { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GameDto>(entity =>
        {
            entity.ToTable("games");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("game_id");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.Developer).HasColumnName("developer");
            entity.Property(e => e.Publisher).HasColumnName("publisher");
            entity.Property(e => e.FirstReleased).HasColumnName("first_released");
            entity.Property(e => e.RegionFirstReleasedIn).HasColumnName("region_first_released_in");
            entity.Property(e => e.ReleasedInEuPalOrNa).HasColumnName("released_in_eu_or_na");
            entity.Ignore(e => e.IsExcluded);
            entity.Ignore(e => e.IsOwned);
        });

        modelBuilder.Entity<ExcludedGame>(entity =>
        {
            entity.ToTable("excluded_games");
            entity.HasKey(e => e.ExclusionId);
            entity.Property(e => e.ExclusionId).HasColumnName("exclusion_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
        });

        modelBuilder.Entity<GameOwned>(entity =>
        {
            entity.ToTable("game_owned");
            entity.HasKey(e => e.OwnershipId);
            entity.Property(e => e.OwnershipId).HasColumnName("ownership_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.OwnPhysicalCopy).HasColumnName("own_physical_copy");
            entity.Property(e => e.TypeOwned).HasColumnName("type_owned");
        });

        modelBuilder.Entity<GameProgress>(entity =>
        {
            entity.ToTable("progress");
            entity.HasKey(e => e.ProgressId);
            entity.Property(e => e.ProgressId).HasColumnName("progress_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.DateStarted).HasColumnName("date_started");
            entity.Property(e => e.DateFinished).HasColumnName("date_finished");
            entity.Property(e => e.CompletionTime).HasColumnName("completion_time");
            entity.Property(e => e.BeatenCriteria).HasColumnName("beaten_criteria");
            entity.Property(e => e.Review).HasColumnName("review");
            entity.Property(e => e.Platform).HasColumnName("platform");
        });

        modelBuilder.Entity<OwnershipType>(entity =>
        {
            entity.ToTable("ownership_types");
            entity.HasKey(e => e.TypeOwned);
            entity.Property(e => e.TypeOwned).HasColumnName("type_owned");
        });

        modelBuilder.Entity<GameSerialNumber>(entity =>
        {
            entity.ToTable("game_serial_numbers");
            entity.HasKey(e => e.SerialId);
            entity.Property(e => e.SerialId).HasColumnName("serial_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.SerialNumber).HasColumnName("serial_number");
            entity.Property(e => e.Region).HasColumnName("region");
            entity.Property(e => e.Notes).HasColumnName("notes");

            entity.HasOne<GameDto>()
                .WithMany()
                .HasForeignKey(e => e.GameId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AlternateTitle>(entity =>
        {
            entity.ToTable("alternate_titles");
            entity.HasKey(e => e.AlternateTitleId);
            entity.Property(e => e.AlternateTitleId).HasColumnName("alternate_title_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.Notes).HasColumnName("notes");

            entity.HasOne<GameDto>()
                .WithMany()
                .HasForeignKey(e => e.GameId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("roles");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name").IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.HasIndex(e => e.Name).IsUnique().HasDatabaseName("idx_roles_name");
        });

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.TwitchId).HasColumnName("twitch_id").IsRequired();
            entity.Property(e => e.TwitchUsername).HasColumnName("twitch_username").IsRequired();
            entity.Property(e => e.ProfileImageUrl).HasColumnName("profile_image_url");
            entity.Property(e => e.RoleId).HasColumnName("role_id").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.LastLoginAt).HasColumnName("last_login_at");
            entity.Property(e => e.ApiKey).HasColumnName("api_key");
            entity.HasIndex(e => e.TwitchId).IsUnique().HasDatabaseName("idx_users_twitch_id");
            entity.HasIndex(e => e.ApiKey).IsUnique().HasDatabaseName("idx_users_api_key");

            entity.HasOne(e => e.Role)
                .WithMany()
                .HasForeignKey(e => e.RoleId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Vote>(entity =>
        {
            entity.ToTable("votes");
            entity.HasKey(e => e.VoteId);
            entity.Property(e => e.VoteId).HasColumnName("vote_id");
            entity.Property(e => e.VoteRound).HasColumnName("vote_round");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(e => e.VoteRound).HasDatabaseName("idx_votes_round");
        });

        modelBuilder.Entity<VoteHistory>(entity =>
        {
            entity.ToTable("vote_history");
            entity.HasKey(e => e.HistoryId);
            entity.Property(e => e.HistoryId).HasColumnName("history_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.VoteRound).HasColumnName("vote_round");
            entity.Property(e => e.VoteCount).HasColumnName("vote_count");
            entity.Property(e => e.Position).HasColumnName("position");
            entity.Property(e => e.Notes).HasColumnName("notes");
        });

        modelBuilder.Entity<CurrentVote>(entity =>
        {
            entity.ToTable("current_vote");
            entity.HasKey(e => e.VoteId);
            entity.Property(e => e.VoteId).HasColumnName("vote_id");
            entity.Property(e => e.GameId).HasColumnName("game_id");
            entity.Property(e => e.VoteCount).HasColumnName("vote_count");
            entity.Property(e => e.GameNumber).HasColumnName("game_number");
        });
    }
}
