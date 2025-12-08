# Alternate Titles API Endpoints

This document describes the API endpoints for managing alternate titles for PS2 games.

## Endpoints

### 1. Get Alternate Titles for a Game
**GET** `/api/games/{id}/alternate-titles`

Retrieves all alternate titles for a specific game.

**Parameters:**
- `id` (path, required): The ID of the game

**Response:** `200 OK`
```json
[
  {
    "alternateTitleId": 1,
    "gameId": 123,
    "title": "Ratchet & Clank 2: Going Commando",
    "notes": "North American release title"
  },
  {
    "alternateTitleId": 2,
    "gameId": 123,
    "title": "Ratchet & Clank 2",
    "notes": "European release title"
  }
]
```

**Error Responses:**
- `404 Not Found`: Game with specified ID not found
- `500 Internal Server Error`: Server error occurred

**Authentication:** None required (public endpoint)

---

### 2. Add Alternate Title
**POST** `/api/games/{id}/alternate-titles`

Adds a new alternate title to a game.

**Parameters:**
- `id` (path, required): The ID of the game

**Request Body:**
```json
{
  "title": "Ratchet & Clank 2: Going Commando",
  "notes": "North American release title"
}
```

**Field Constraints:**
- `title` (required): Maximum 150 characters
- `notes` (optional): Maximum 500 characters

**Response:** `200 OK`
```json
{
  "alternateTitleId": 1,
  "gameId": 123,
  "title": "Ratchet & Clank 2: Going Commando",
  "notes": "North American release title",
  "message": "Alternate title 'Ratchet & Clank 2: Going Commando' added successfully to 'Ratchet & Clank: Locked and Loaded'"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid request data (validation errors)
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Admin access required
- `404 Not Found`: Game with specified ID not found
- `500 Internal Server Error`: Server error occurred

**Authentication:** Admin required (cookie or API key)

---

### 3. Delete Alternate Title
**DELETE** `/api/games/{id}/alternate-titles/{alternateTitleId}`

Deletes an alternate title from a game.

**Parameters:**
- `id` (path, required): The ID of the game
- `alternateTitleId` (path, required): The ID of the alternate title to delete

**Response:** `200 OK`
```json
{
  "message": "Alternate title deleted successfully from 'Ratchet & Clank: Locked and Loaded'"
}
```

**Error Responses:**
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Admin access required
- `404 Not Found`: Game or alternate title not found
- `500 Internal Server Error`: Server error occurred

**Authentication:** Admin required (cookie or API key)

---

## Usage Examples

### Example 1: Get Alternate Titles
```bash
curl -X GET "https://api.example.com/api/games/123/alternate-titles"
```

### Example 2: Add Alternate Title (with API Key)
```bash
curl -X POST "https://api.example.com/api/games/123/alternate-titles" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "title": "Ratchet & Clank 2: Going Commando",
    "notes": "North American release title"
  }'
```

### Example 3: Delete Alternate Title
```bash
curl -X DELETE "https://api.example.com/api/games/123/alternate-titles/1" \
  -H "X-API-Key: your-api-key-here"
```

---

## Integration with Frontend

The GameEditModal component in the Blazor frontend manages alternate titles through these endpoints:

1. **Loading**: When opening the edit modal for an existing game, `LoadAlternateTitles()` is called
2. **Adding**: When clicking "+ Add Alternate Title", the form data is added to a local list
3. **Removing**: When clicking the × button, entries are either removed from the list or marked for deletion
4. **Saving**: When clicking "Update" or "Create", `SaveAlternateTitles()` processes all changes using the API

## Database Schema

```sql
CREATE TABLE alternate_titles (
    alternate_title_id INT PRIMARY KEY AUTO_INCREMENT,
    game_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    notes VARCHAR(500),
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    INDEX idx_alternate_titles_game_id (game_id)
);
```

## Notes

- Alternate titles are automatically deleted when their parent game is deleted (CASCADE)
- No duplicate checking is enforced at the API level - the same alternate title can be added multiple times
- The region field has been removed; users should add region information in the notes field if needed
- All AUDIT logs are written for admin actions (add/delete alternate titles)
