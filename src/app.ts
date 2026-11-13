import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env';
import { AppError } from './errors/AppError';
import authController from './routes/auth';
import alunosRoutes from './routes/alunos';
import openapi from './openapi';

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));
app.use(cors({ origin: env.webOrigin }));
app.use(express.json({ limit: '20kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/docs', (_req, res) => {
  res.json(openapi);
});

app.use('/api/auth', authLimiter, authController);
app.use('/api/alunos', alunosRoutes);
app.use('/alunos', alunosRoutes);

const publicDirectory = path.resolve(__dirname, '../public');
const angularDirectory = path.resolve(process.cwd(), 'frontend/dist/frontend/browser');
const hasBuiltAngularApp = env.nodeEnv === 'production' && fs.existsSync(path.join(angularDirectory, 'index.html'));

if (hasBuiltAngularApp) {
  app.use(express.static(angularDirectory));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(angularDirectory, 'index.html'));
  });
} else {
  app.use(express.static(publicDirectory));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDirectory, 'index.html'));
  });
}

app.use((_req, _res, next) => {
  next(new AppError(404, 'Esta página não foi encontrada.', 'NOT_FOUND'));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ erro: error.message, codigo: error.code });
    return;
  }

  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'O corpo da requisição não contém um JSON válido.', codigo: 'INVALID_JSON' });
    return;
  }

  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ erro: 'O corpo da requisição excede o limite permitido.', codigo: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ erro: 'Já existe um registro com estes dados.', codigo: 'DUPLICATE_ENTRY' });
    return;
  }

  console.error('Erro inesperado na API:', error);
  res.status(500).json({ erro: 'Ocorreu um erro interno. Tente novamente.', codigo: 'INTERNAL_ERROR' });
});

if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`Aplicação disponível em http://localhost:${env.port}`);
  });
}

export default app;
