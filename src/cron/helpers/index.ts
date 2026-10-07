export const APP_SUBSCRIPTION_QUEUE = "appSubscriptionQueue"

export const APP_SUBSCRIPTION_REMINDER_QUEUE = "appSubReminderQueue"

export const POST_EMBEDDING_QUEUE = "postEmbeddingQueue"

export const POST_TOPIC_QUEUE = "postTopicQueue"

export const POST_KEYWORDS_QUEUE = "postKeywordsQueue"

export const POST_LABELS = ["news", "music", "business", "education", "technology", "entertainment", "politics", "arts & culture", "inspiration", "learning", "gaming", "movies", "comedy", "lifestyle", "community", "shopping", "sports"]




// Pin weights/tokenizer together so classifications do not change with upstream main.
export const POST_TOPIC_MODEL = 'MoritzLaurer/deberta-v3-large-zeroshot-v1.1-all-33';
export const POST_TOPIC_MODEL_REVISION = 'c5dca3bda16d30337e493e3e3e5caa19a3e7c8c2';
export const POST_TOPIC_HYPOTHESIS = 'This example is about {}';
export const POST_TOPIC_MODEL_VERSION = `${POST_TOPIC_MODEL}@${POST_TOPIC_MODEL_REVISION}`;
export const POST_TOPIC_SESSION_OPTIONS = {intraOpNumThreads: 2, interOpNumThreads: 1};

export const EMAIL_DELIVERY_QUEUE = "emailDeliveryQueue";

export const NOTIFICATION_DELIVERY_QUEUE = "notificationDeliveryQueue";
