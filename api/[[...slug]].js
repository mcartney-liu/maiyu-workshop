// Vercel Serverless Function entry point.
// Mounts the existing Express app and lets Vercel route every /api/* request
// (including SSE chat streaming) through it. The app itself does NOT call
// listen() when required here; Vercel manages the runtime.
module.exports = require('../backend/src/app');
