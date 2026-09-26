import { googleAI } from '@genkit-ai/google-genai';
import { genkit, z } from 'genkit';

// Initialize Genkit with the Google AI plugin
const genkitAi = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-2.5-flash', {
    temperature: 0.8,
  }),
});

export default genkitAi