import express from 'express';
import {requestLoggingMiddleware} from '@/logger/events';

const app = express();
app.use(requestLoggingMiddleware);
// Preserve nested query parsing used by existing API filters.
app.set("query parser", "extended");

// The API is transport infrastructure, not a searchable website. Apply before
// parsers/CORS/routes so successful, preflight and error responses all carry it.
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet');
  next();
});
app.get('/robots.txt', (_req, res) => {
  // Crawlers must be able to read noindex to remove already indexed API URLs.
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});

export default app
