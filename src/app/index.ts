import express from 'express';

const app = express();
// Preserve nested query parsing used by existing API filters.
app.set("query parser", "extended");

export default app