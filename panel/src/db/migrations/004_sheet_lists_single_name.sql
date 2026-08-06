-- Sheet list uchun ikkita ("name" va "list_name") o'xshash maydon bitta
-- "name" maydoniga birlashtiriladi (haqiqiy varoq nomi).
ALTER TABLE sheet_lists DROP COLUMN name;
ALTER TABLE sheet_lists RENAME COLUMN list_name TO name;
