-- Match monthlyGameSpendExact's category/mode/UTC-period filter. Building
-- concurrently keeps existing ledger writes available on a populated database.
-- PostgreSQL concurrent index creation must remain outside an explicit transaction.
CREATE INDEX CONCURRENTLY "Transaction_monthly_reward_funding_idx"
ON "Transaction" ((metadata->>'catId'), (metadata->>'mode'), "createdAt")
WHERE category = 'GAME_DEDUCTION' AND status = 'COMPLETED' AND type = 'DEBIT';
