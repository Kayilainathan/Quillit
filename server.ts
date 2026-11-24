import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRateLimiter, optionalAuthGuard } from './server/lib/authMiddleware';
import { createConverseRouter } from './server/routes/converse';
import { createDrillsRouter } from './server/routes/drills';
import { createEvaluateRouter } from './server/routes/evaluate';
import { createUtilitiesRouter } from './server/routes/utilities';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Lightweight per-IP rate limiter + optional ALLOWED_OWNER_EMAILS auth guard on /api/*
  app.use('/api', apiRateLimiter);
  app.use('/api', optionalAuthGuard);

  // Modular v3.1 API pipeline (preserving 5-generation Gemini cascade PSR-10)
  app.use(createUtilitiesRouter());
  app.use(createEvaluateRouter());
  app.use(createConverseRouter());
  app.use(createDrillsRouter());

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1y',
        immutable: true,
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quillit v3.1 server running on http://localhost:${PORT}`);
  });
}

createApp();
