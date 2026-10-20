-- Commit-delivered invalidation hints. No message bodies, balances or tokens enter NOTIFY.
CREATE FUNCTION kwonnet_realtime_hint() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE row_data JSONB; recipient TEXT; kind TEXT; post_id TEXT;
BEGIN
 row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 CASE TG_TABLE_NAME
 WHEN 'Notification' THEN recipient := row_data->>'recipientId'; kind := 'notifications';
 WHEN 'Wallet' THEN recipient := row_data->>'user_id'; kind := 'wallet';
 WHEN 'BachsCheckout' THEN recipient := row_data->>'userId'; kind := 'wallet';
 WHEN 'PurchaseRefund' THEN recipient := row_data->>'userId'; kind := 'wallet';
 WHEN 'E2Member' THEN recipient := row_data->>'userId'; kind := 'messages';
 WHEN 'E2Delivery' THEN recipient := row_data->>'userId'; kind := 'messages';
 WHEN 'UserSession' THEN
   IF NEW."revokedAt" IS NULL THEN RETURN NEW; END IF;
   recipient := row_data->>'userId'; kind := 'auth';
 WHEN 'Quiz' THEN
   post_id := row_data->>'postId'; SELECT "userId" INTO recipient FROM "Post" WHERE id = post_id; kind := 'quiz';
 WHEN 'PostBoost' THEN
   post_id := row_data->>'postId'; SELECT "userId" INTO recipient FROM "Post" WHERE id = post_id; kind := 'analytics';
 WHEN 'Post' THEN recipient := '*'; kind := 'feed';
 ELSE RETURN NULL;
 END CASE;
 IF recipient IS NOT NULL THEN
   PERFORM pg_notify('kwonnet_realtime_v1',jsonb_build_object('userId',recipient,'kind',kind,
     'conversationId',row_data->>'conversationId','postId',post_id,
     'sessionId',CASE WHEN kind='auth' THEN row_data->>'id' ELSE NULL END)::TEXT);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER kwonnet_realtime_notification AFTER INSERT OR DELETE OR UPDATE OF "isSeen", "isRead", title, message ON "Notification" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_wallet AFTER UPDATE OF coins, bonus ON "Wallet" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_checkout AFTER UPDATE OF status ON "BachsCheckout" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_refund AFTER INSERT OR UPDATE OF status ON "PurchaseRefund" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_member AFTER INSERT OR DELETE OR UPDATE ON "E2Member" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_delivery AFTER INSERT ON "E2Delivery" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_auth AFTER UPDATE OF "revokedAt" ON "UserSession" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_quiz AFTER UPDATE OF "settlementStatus" ON "Quiz" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_boost AFTER UPDATE OF confirmed ON "PostBoost" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
CREATE TRIGGER kwonnet_realtime_feed AFTER INSERT OR DELETE OR UPDATE OF status, "isHidden", "deletedAt" ON "Post" FOR EACH ROW EXECUTE FUNCTION kwonnet_realtime_hint();
