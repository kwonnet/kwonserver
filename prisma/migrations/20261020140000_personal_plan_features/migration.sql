-- Presentation copy only: preserve plan IDs, pricing, subscriptions and benefit policies.
BEGIN;
DO $$
DECLARE
  personal_plan RECORD;
  feature_items JSONB[];
BEGIN
  FOR personal_plan IN
    SELECT p.id, p.name,
      CASE p.name WHEN 'Starter' THEN 'Standard' WHEN 'Premium' THEN 'Enhanced' ELSE 'Maximum' END AS exposure,
      CASE p.name WHEN 'Starter' THEN 'High' WHEN 'Premium' THEN 'Higher' ELSE 'Highest' END AS share,
      CASE p.name WHEN 'Starter' THEN 'Low' WHEN 'Premium' THEN 'Lower' ELSE 'Lowest' END AS quiz_fee,
      CASE p.name WHEN 'Starter' THEN '5%' WHEN 'Premium' THEN '10%' ELSE '15%' END AS game_boost
    FROM "SubscriptionPlan" p
    WHERE p."accountType" = 'PERSONAL' AND p.name IN ('Starter', 'Premium', 'Supreme')
  LOOP
    SELECT array_agg(jsonb_build_object(
      'id', 'personal-feature-' || md5(personal_plan.id || ':' || entry.position::TEXT),
      'title', entry.item->>'title', 'label', entry.item->>'label'
    ) ORDER BY entry.position) INTO feature_items
    FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('title', 'Post exposure', 'label', personal_plan.exposure),
      jsonb_build_object('title', 'Receive post tips', 'label', personal_plan.share),
      jsonb_build_object('title', 'Receive account gifts', 'label', personal_plan.share),
      jsonb_build_object('title', 'Receive chat gifts', 'label', personal_plan.share),
      jsonb_build_object('title', 'Post quiz fees', 'label', personal_plan.quiz_fee),
      jsonb_build_object('title', 'Characters per post', 'label', 'Extended'),
      jsonb_build_object('title', 'Game points boost', 'label', personal_plan.game_boost)
    )) WITH ORDINALITY AS entry(item, position);

    UPDATE "PlanFeature" SET items = feature_items
    WHERE "planId" = personal_plan.id AND name = 'Exclusive Experience';
    IF NOT FOUND THEN
      INSERT INTO "PlanFeature" (id, name, items, "planId")
      VALUES ('personal-features-' || md5(personal_plan.id), 'Exclusive Experience', feature_items, personal_plan.id);
    END IF;
  END LOOP;
END $$;
COMMIT;
