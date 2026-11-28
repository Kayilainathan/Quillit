import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
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

function buildAllowedOrigins(isProd: boolean): Set<string> {
  const origins = new Set<string>();
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  for (const origin of envOrigins) {
    origins.add(origin);
  }
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl && /^https?:\/\//i.test(appUrl)) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed APP_URL placeholder
    }
  }
  if (!isProd) {
    origins.add(`http://localhost:${PORT}`);
    origins.add(`http://127.0.0.1:${PORT}`);
  }
  return origins;
}

const STATIC_PAGES_ORIGIN_RE =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:github\.io|gitlab\.io|pages\.dev)$/i;

function createApiCorsMiddleware(isProd: boolean) {
  const allowedOrigins = buildAllowedOrigins(isProd);
  return (req: Request, res: Response, next: NextFunction): void => {
    const originHeader = typeof req.headers.origin === 'string'
      ? req.headers.origin.trim().replace(/\/+$/, '')
      : '';

    if (originHeader) {
      res.setHeader('Vary', 'Origin');
      const reqHost = req.headers.host || '';
      const isSameHost =
        Boolean(reqHost) &&
        (originHeader === `http://${reqHost}` || originHeader === `https://${reqHost}`);
      const isStaticPagesOrigin = STATIC_PAGES_ORIGIN_RE.test(originHeader);

      if (isSameHost || isStaticPagesOrigin || allowedOrigins.has(originHeader)) {
        res.setHeader('Access-Control-Allow-Origin', originHeader);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        res.setHeader('Access-Control-Max-Age', '600');
      } else if (req.method === 'OPTIONS') {
        res.status(403).end();
        return;
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

async function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Explicit origin-validated CORS + per-IP rate limiter + fail-closed owner auth guard on /api/*
  app.use('/api', createApiCorsMiddleware(isProd));
  app.use('/api', apiRateLimiter);
  app.use('/api', optionalAuthGuard);

  // Modular v4.0 API pipeline (preserving all 5 Gemini generations in zero-stall cascade)
  app.use(createUtilitiesRouter());
  app.use(createEvaluateRouter());
  app.use(createConverseRouter());
  app.use(createDrillsRouter());

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      app.use(
        express.static(distPath, {
          index: false,
          maxAge: '1y',
          immutable: true,
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(indexHtmlPath);
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({
          ok: true,
          service: 'quillit-api',
          health: '/api/health',
        });
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quillit v4.0 server running on http://localhost:${PORT}`);
  });
}

createApp();
