import {GoogleGenAI} from '@google/genai';
let client: GoogleGenAI | undefined;

// Optional Google AI must not prevent the API from starting without its key.
export function getGoogleAi() {
  if (!client) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Google AI is not configured');
    client = new GoogleGenAI({apiKey, httpOptions: {timeout: 15000}});
  }
  return client;
}
