// Uses public example texts only; does not load dotenv, database, Redis or app credentials.
const {pipeline, env} = require('@huggingface/transformers');
const {POST_LABELS, POST_TOPIC_MODEL, POST_TOPIC_MODEL_REVISION, POST_TOPIC_HYPOTHESIS, POST_TOPIC_SESSION_OPTIONS} = require('../dist/cron/helpers');
async function main() {
  env.cacheDir = process.env.TRANSFORMERS_CACHE || require('node:path').resolve('.model-cache');
  console.log(JSON.stringify({model: POST_TOPIC_MODEL, revision: POST_TOPIC_MODEL_REVISION, cache: env.cacheDir}));
  const started = Date.now();
  const classify = await pipeline('zero-shot-classification', POST_TOPIC_MODEL, {revision: POST_TOPIC_MODEL_REVISION, dtype: 'q8', device: 'cpu', session_options: POST_TOPIC_SESSION_OPTIONS});
  console.log(JSON.stringify({loadedSeconds: (Date.now()-started)/1000}));
  const samples = [
    ['technology', 'AI art is changing creativity. Machines can inspire ideas, but your human touch gives it meaning and emotion.'],
    ['learning', 'Here is a step-by-step tutorial to improve your study skills and learn Spanish vocabulary with daily practice.'],
    ['sports', 'The football team won the Champions League final after scoring two goals in extra time.'],
    ['business', 'The company reported higher quarterly revenue and profit after increasing sales and reducing operating costs.'],
    ['politics', 'Parliament debated the proposed election law while opposition leaders criticized the government.'],
    ['music', 'The singer released a new album featuring guitar solos and performed the songs at a live concert.'],
  ];
  for (const [expected, text] of samples) {
    const start = Date.now();
    const result = await classify(text, POST_LABELS, {multi_label: true, hypothesis_template: POST_TOPIC_HYPOTHESIS, POST_TOPIC_SESSION_OPTIONS});
    console.log(JSON.stringify({expected, text, predicted: result.labels[0], top: result.labels.slice(0,4).map((label,i)=>({label,score:result.scores[i]})), seconds: (Date.now()-start)/1000}));
  }
  console.log(JSON.stringify({memoryMB: Math.round(process.memoryUsage().rss / 1048576)}));
  await classify.dispose();
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
