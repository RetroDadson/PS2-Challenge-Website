-- Create a temporary table to load the CSV data
CREATE TEMP TABLE temp_games_csv (
    title VARCHAR(150),
    developer VARCHAR(100),
    publisher VARCHAR(100),
    first_released VARCHAR(20),
    region_first_released_in VARCHAR(10),
    excluded VARCHAR(10),
    released_in_eu_pal_or_na VARCHAR(10),
    own_a_physical_copy VARCHAR(10),
    type_owned VARCHAR(20)
);

-- For pgAdmin: Use the Import/Export tool instead of COPY
-- Right-click on temp_games_csv table -> Import/Export Data
-- Or use psql from command line with: \copy temp_games_csv FROM 'd:/repos/ps2-challenge-website/csv/allgames.csv' CSV HEADER;

-- Alternatively, if you have psql installed, run this command from your terminal:
-- psql -U your_username -d dadsons_ps2_challenge -c "\copy temp_games_csv FROM 'd:/repos/ps2-challenge-website/csv/allgames.csv' CSV HEADER"

-- After importing the CSV data, run the rest of this script:

-- Ensure platform and ownership types exist
INSERT INTO platform_types (name) VALUES ('Physical'), ('Emulated')
ON CONFLICT (name) DO NOTHING;

INSERT INTO ownership_types (name) VALUES ('Base'), ('Platinum')
ON CONFLICT (name) DO NOTHING;

-- Insert all games from temp table
INSERT INTO games (title, developer, publisher, first_released, region_first_released_in, released_in_eu_pal_or_na)
SELECT
    title,
    developer,
    publisher,
    CASE
        WHEN first_released ~ '^\d{2}/\d{2}/\d{4}$' THEN TO_DATE(first_released, 'DD/MM/YYYY')
        WHEN first_released ~ '^\d{4}-\d{2}-\d{2}$' THEN TO_DATE(first_released, 'YYYY-MM-DD')
        ELSE NULL
    END,
    region_first_released_in,
    CASE WHEN released_in_eu_pal_or_na = 'TRUE' THEN TRUE ELSE FALSE END
FROM temp_games_csv
ON CONFLICT (title) DO NOTHING;

-- Insert all excluded games
INSERT INTO excluded_games (game_id, reason)
SELECT
    g.id,
    'Not released in EU/PAL or NA regions'
FROM games g
INNER JOIN temp_games_csv t ON g.title = t.title
WHERE t.excluded = 'TRUE'
ON CONFLICT (game_id) DO NOTHING;

-- Insert all owned games
INSERT INTO game_owned (game_id, platform_type_id, ownership_type_id)
SELECT
    g.id,
    pt.id,
    ot.id
FROM temp_games_csv t
INNER JOIN games g ON g.title = t.title
CROSS JOIN platform_types pt
LEFT JOIN ownership_types ot ON ot.name = t.type_owned
WHERE t.own_a_physical_copy = 'TRUE'
    AND pt.name = 'Physical'
ON CONFLICT (game_id, platform_type_id) DO NOTHING;

-- Clean up
DROP TABLE temp_games_csv;

-- Verify the import
SELECT
    (SELECT COUNT(*) FROM games) as total_games,
    (SELECT COUNT(*) FROM excluded_games) as excluded_games,
    (SELECT COUNT(*) FROM game_owned) as owned_games;
