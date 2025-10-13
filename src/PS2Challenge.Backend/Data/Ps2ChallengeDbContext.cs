using Microsoft.EntityFrameworkCore;
using PS2Challenge.Backend.Models;

namespace PS2Challenge.Backend.Data
{
    public class Ps2ChallengeDbContext : DbContext
    {
        public Ps2ChallengeDbContext(DbContextOptions<Ps2ChallengeDbContext> options)
            : base(options)
        {
        }

        public DbSet<GameDto> Games { get; set; }
        public DbSet<ExcludedGame> ExcludedGames { get; set; }
        public DbSet<GameOwned> GamesOwned { get; set; }

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
                // IsExcluded and IsOwned are computed, not mapped directly
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
        }
    }
}
