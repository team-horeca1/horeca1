-- Canonicalize legacy User.phone values stored as +91XXXXXXXXXX / 91XXXXXXXXXX
-- to the 10-digit form. Skip any row whose canonical form is already taken.

UPDATE users u
SET phone = regexp_replace(u.phone, '^\+?91', '')
WHERE u.phone ~ '^\+?91[6-9][0-9]{9}$'
  AND NOT EXISTS (
    SELECT 1
    FROM users other
    WHERE other.id <> u.id
      AND other.phone = regexp_replace(u.phone, '^\+?91', '')
  );
