BEGIN;

-- Persist the display names on every existing non-country room, not only seed-owned rows.
WITH labels AS (
  SELECT room.id,
    'Room ' || ROW_NUMBER() OVER (
      PARTITION BY room.cat_id ORDER BY room."createdAt", room.id
    )::text AS name,
    CASE WHEN game.name = 'MindMash'
      THEN 'Play in this room. All rooms use the same category content and rules.'
      ELSE 'Play in this room using the full ' || category.name ||
        ' question pool. All rooms cover the same category topics.'
    END AS description
  FROM "GameRoom" room
  JOIN "GameCategory" category ON category.id = room.cat_id
  JOIN "Game" game ON game.id = category."gameId"
  WHERE game.name <> 'Country Mania'
)
UPDATE "GameRoom" room
SET name = labels.name, description = labels.description, "updatedAt" = CURRENT_TIMESTAMP
FROM labels
WHERE room.id = labels.id
  AND (room.name IS DISTINCT FROM labels.name OR room.description IS DISTINCT FROM labels.description);

-- Enforce plain numbered names at the database boundary, including direct SQL writes.
CREATE OR REPLACE FUNCTION enforce_game_room_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  game_name text;
  next_number numeric;
BEGIN
  -- Serialize automatic number allocation within a category, including concurrent inserts.
  SELECT game.name INTO game_name
  FROM "GameCategory" category
  JOIN "Game" game ON game.id = category."gameId"
  WHERE category.id = NEW.cat_id
  FOR NO KEY UPDATE OF category;

  IF game_name = 'Country Mania' THEN
    RETURN NEW;
  END IF;
  IF NEW.name ~ '^Room [1-9][0-9]*$' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cat_id = OLD.cat_id AND OLD.name ~ '^Room [1-9][0-9]*$' THEN
      NEW.name := OLD.name;
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(substring(name FROM 6)::numeric), 0) + 1 INTO next_number
  FROM "GameRoom"
  WHERE cat_id = NEW.cat_id AND id <> NEW.id AND name ~ '^Room [1-9][0-9]*$';
  NEW.name := 'Room ' || next_number::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_room_name_format ON "GameRoom";
CREATE TRIGGER game_room_name_format
BEFORE INSERT OR UPDATE OF name, cat_id ON "GameRoom"
FOR EACH ROW EXECUTE FUNCTION enforce_game_room_name();

COMMIT;
