import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import routes from './routes/index.js';
import { errorHandler } from './utils/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Railway proxies: correct client IP for rate limiting
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin })); // false => same-origin only
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', routes);

  // In production the API also serves the built React app (one deployable service).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
