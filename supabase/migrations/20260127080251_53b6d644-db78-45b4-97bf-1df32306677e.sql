-- Clean up trailing spaces in chat_roles names and mention_triggers
UPDATE chat_roles SET name = TRIM(name) WHERE name != TRIM(name);
UPDATE chat_roles SET mention_trigger = TRIM(mention_trigger) WHERE mention_trigger IS NOT NULL AND mention_trigger != TRIM(mention_trigger);