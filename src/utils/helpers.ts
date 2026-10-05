import { Request } from "express";
import { lookup } from "./ipLocation";
import DeviceDetector from "node-device-detector";
import ClientHints from "node-device-detector/client-hints";
import { DocumentQuestionAnsweringPipeline, FeatureExtractionPipeline, env, pipeline, QuestionAnsweringPipeline, SummarizationPipeline, TextClassificationPipeline, TranslationPipeline, ZeroShotClassificationPipeline } from "@huggingface/transformers";
import z from "zod";
import genkitAi from "./genkitAi";
import rake from "node-rake-v2"


const detector = new DeviceDetector();

const clientHints = new ClientHints();

export const removeProperty = <T extends object, K extends keyof T>(
  obj: T,
  key: K
): Omit<T, K> => {
  const { [key]: _, ...rest } = obj;
  return rest as Omit<T, K>;
};

export function delayExecution(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryExecution<T>(
  promiseFunction: () => Promise<T>,
  retries: number,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Attempt to execute the promise function
      return await promiseFunction();
    } catch (error) {
      // If the function throws an error, record it and retry if we still have attempts left
      lastError = error as Error;
      if (attempt < retries) {
        console.log(`Attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
        // Wait for the specified delay before retrying
        await delayExecution(delayMs);
      } else {
        console.log(`Attempt ${attempt} failed. No retries left.`);
        throw lastError; // Throw the last error after all attempts fail
      }
    }
  }

  // If all retries fail, throw the last error
  if (lastError) {
    throw lastError;
  }

  // This line should never be reached as we're either returning a value or throwing an error
  throw new Error("Unexpected error during retries");
}

export function formatNumberWithCommas(num: number): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export const getAuthorizationToken = (req: Request) => {
  // An explicitly selected account must override a historical browser cookie.
  // Never fall back to another identity when an explicit credential is invalid.
  const bearerToken = req.headers.authorization;
  if (bearerToken !== undefined) return /^Bearer (\S+)$/i.exec(bearerToken)?.[1] ?? null;
  const queryToken = req?.query?.token;
  if (queryToken !== undefined) return typeof queryToken === "string" && queryToken ? queryToken : null;
  const cookieToken = req.cookies?.tx_a_t || req.cookies?.x_a_t;

  if (cookieToken) return cookieToken as string;

  return null;
};

export const getReqIPInfo = async (ip?: string) => {
  try {
    const clientIp = ip?.includes("::ffff:")
      ? ip.split("::ffff:")[1]
      : ip ?? "";

    // console.log("user clientIp Ip: ", clientIp);

    const lookupIP =
      !clientIp || clientIp?.includes("::1") ? "8.8.8.8" : clientIp;

    // console.log("user lookupIP Ip: ", lookupIP);

    return await lookup(lookupIP);
  } catch (error) {
    return null;
  }
};

export const isEmptyObject = (obj: any) => {
  for (const i in obj) {
    return false;
  }
  return true;
};

export const getReqInfo = async (req: Request) => {
  const headers = req.headers;

  const useragent = headers["user-agent"];

  const deviceResult = detector.detect(
    useragent ?? "",
    clientHints.parse(headers as any, {})
  );

  const detectBot = detector.parseBot(useragent ?? "");

  const isBot = !isEmptyObject(detectBot);

  const ipInfo = await getReqIPInfo(req.ip);

  return { device: deviceResult, ipInfo, isBot };
};

export class AppError extends Error {
  public readonly isOperational: boolean;
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Ensures instanceof works when transpiled to ES5
    Object.setPrototypeOf(this, new.target.prototype);

    // Optional: capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export const cleanTextContent = (text?: string | null, limit: number = 2000): string => {
  if (!text) return "";
  return text
    .replace(/@[\w]+/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
};

export const cleanTextContentWithHashtag = (text?: string | null, limit: number = 2000): string => {
  if (!text) return "";
  return text
    .replace(/@[\w]+/g, "")
    // .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
};

// Lazy-load the model once (fast in workers, zero overhead on startup)
let embedderPipeline: any = null;
const getEmbedderPipeline = async () => {
  if (!embedderPipeline) {
    embedderPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedderPipeline as FeatureExtractionPipeline;
};

// Function to generate embeddings for a given data source
export async function generateEmbedding(text: string) {
  const embedder = await getEmbedderPipeline(); //384 - dimension
  const results = await embedder(text, { pooling: "mean", normalize: true });
  // console.log(results.dims)
  return Array.from(results.data);
}

// Lazy-load the model once (fast in workers, zero overhead on startup)
let commentPipeline: any = null;
const getCommentPipeline = async () => {
  if (!commentPipeline) {
    commentPipeline = await pipeline("sentiment-analysis", "Xenova/toxic-bert");
  }
  return commentPipeline as TextClassificationPipeline;
};

export async function commentClassifier(text: string) {
  const classifier = await getCommentPipeline()
  const result = await classifier(text);
  // console.log("sentiment---", result)
  return result[0] as { label: string, score: number }
}
const TOPIC_LABELS = [ 'sports', 'news', 'music', 'business', 'education', 'technology', 'entertainment',  'politics', 'arts & culture', 'inspiration', 'learning', 'gaming',
  'movies', 'comedy', 'lifestyle', 'community', 'shopping'
  ]
// Lazy-load the model once (fast in workers, zero overhead on startup)
let topicPipeline: Promise<ZeroShotClassificationPipeline> | null = null;
const getTopicPipeline = async () => {
  if (!topicPipeline) {
    if (process.env.TRANSFORMERS_CACHE) env.cacheDir = process.env.TRANSFORMERS_CACHE;
    topicPipeline = pipeline("zero-shot-classification", "Xenova/bart-large-mnli", {
      dtype: 'q8', device: 'cpu',
    }).catch(error => { topicPipeline = null; throw error; });
  }
  return topicPipeline;
};

export async function topicClassifier(text: string) {
  const classifier = await getTopicPipeline()
  const result = await classifier(text, TOPIC_LABELS, { multi_label: false, hypothesis_template: "This discussion is about {}.",} );
  return Array.isArray(result) ? result[0] : result
}


// topicsClassifier("Fast-forward to the Persian Empire, around 500 BC: Persians invented Faloodeh a semi-frozen dessert with rose water and vermicelli, stored in ancient ice houses called Yakhchals. 🌸")


export const contentTopicClassifier = async (text: string) => {
  // Define input schema
  const InputSchema = z.object({
    text: z.string().describe('The text content'),
    labels: z.array(z.string()).describe("These are content labels"),
  });

  // Define output schema
  const OutputSchema = z.object({
    answer: z.string(),
  });

  // Define a recipe generator flow
  const classifyFlow = genkitAi.defineFlow(
    {
      name: 'contentTopicClassifyFlow',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
    },
    async (input) => {
      // Create a prompt based on the input
      const prompt = `Classify the best topic label for this content from the list below or come up with the most suitable topic if the labels don't match:
      Content: ${input.text}
      Labels: ${input.labels}`;

      // Generate structured recipe data using the same schema
      const { output } = await genkitAi.generate({
        prompt,
        output: { schema: OutputSchema },
      });

      if (!output) throw new Error('Failed to generate recipe');

      return output;
    },
    
  );
  try {
    const result = await classifyFlow({ text, labels: TOPIC_LABELS })
    return result
  } catch (error: any) {
    console.log(error.message)
    throw error
  }
}

// Custom stop words: English + Pidgin/Nigerian fillers
const customStopwords = [
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'she', 'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who',
  'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
  'have', 'has', 'had', 'do', 'does', 'did', 'but', 'if', 'or', 'because',
  'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'into',
  'through', 'during', 'before', 'after', 'to', 'from', 'in', 'out', 'on',
  'off', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'dey', 'na', 'sha',
  'o', 'ehn', 'abi', 'wetin', 'e', 'go', 'come', 'make', 'say', 'get', 'see'
  // Add more Pidgin/common words as you observe noise
];

export function extractKeywordsWithRAKE(text: string): string[] {
  // Step 1: Extract hashtags separately (RAKE won't catch them reliably)
  const hashtags = (text.match(/#[a-zA-Z0-9_]+/g) || []).map(tag => tag.toLowerCase());
  // const rake = new NodeRakeV2()
  // Step 2: Run RAKE on cleaned text
  const keywords = rake.generate(text, {
    stopwords: customStopwords,
    // minLength: 3,           // ignore very short
    // maxWords: 5,            // up to 5-word phrases
    // minFrequency: 1         // even once is ok per post
  });

  // Step 3: Combine, dedupe, normalize to lowercase
  const all = new Set([...hashtags, ...keywords.map(k => k.toLowerCase())]);

  // Step 4: Basic post-filtering
  const filtered = Array.from(all).filter(kw => {
    if (kw.length < 3) return false;
    if (/^\d+$/.test(kw)) return false;
    if (kw.includes('http') || kw.includes('www')) return false;
    return true;
  });

  // Sort: longer phrases first, then alphabetical
  return filtered.sort((a, b) => {
    if (b.split(' ').length !== a.split(' ').length) {
      return b.split(' ').length - a.split(' ').length;
    }
    return a.localeCompare(b);
  });
}

// Example with your text
const content = `Your Timeline Is Yours Alone
Maybe you took longer to heal.
Maybe you failed and had to restart.
Maybe you changed your mind.
Maybe life hit you hard and paused everything.
That doesn’t make you broken. That makes you human.
Everyone’s story is uniquely messy, beautiful, unpredictable. That’s what makes it worth telling. The timeline you’re on? It’s not behind. It’s yours.
Own it. As e dey hot, we hope peter obi becomes the the next president of nigeria #nigeria`;

// const extracted = extractKeywordsWithRAKE(content);
// console.log(extracted);

// Lazy-load the model once (fast in workers, zero overhead on startup)
let questionAnswerPipeline: any = null;
const getQuestionAnswerPipeline = async () => {
  if (!questionAnswerPipeline) {
     questionAnswerPipeline = await pipeline("question-answering");
  }
  return questionAnswerPipeline as QuestionAnsweringPipeline;
};

export async function keywordsExtractor(text: string) {
  const model = await getQuestionAnswerPipeline()
  const result = await model(`Extract relevant keywords or phrases from the content: ${text}`, "" );
  const resp = Array.isArray(result) ? result : [result]
  console.log(resp)
}

// keywordsExtractor(content)
