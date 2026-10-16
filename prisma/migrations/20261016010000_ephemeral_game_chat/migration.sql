-- Retain financial audit records, but remove legacy room-chat message bodies.
UPDATE "GameWalletAction"
SET payload = jsonb_build_object('id', payload->'id')
WHERE kind = 'CHAT' AND payload ? 'content';

UPDATE "Transaction"
SET metadata = metadata - 'content'
WHERE category = 'GAME_DEDUCTION' AND metadata->>'action' = 'CHAT' AND metadata ? 'content';
