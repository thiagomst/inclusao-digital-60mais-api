import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { env } from '../config/env';
import { db } from '../database/db';
import { AppError } from '../errors/AppError';
import { AuthenticatedRequest, getAuthenticatedUserId } from '../middleware/authenticate';
import { hashSessionId } from '../utils/session';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  senha: z.string().min(8).refine((senha) => Buffer.byteLength(senha, 'utf8') <= 72),
});
const loginSchema = credentialsSchema.extend({
  manterConectado: z.boolean().optional().default(false),
});

const registerSchema = credentialsSchema.extend({
  nome: z.string().trim().min(2).max(120),
});
const PERSISTENT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

interface UserRow extends RowDataPacket {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
}

function createToken(id: number, email: string, sessionId?: string): string {
  return jwt.sign({ email, ...(sessionId ? { jti: sessionId } : {}) }, env.jwtSecret, {
    subject: String(id),
    ...(sessionId ? { expiresIn: PERSISTENT_SESSION_TTL_SECONDS } : {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    }),
    issuer: 'inclusao-digital-60mais',
    audience: 'inclusao-digital-60mais-web',
  });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError(400, 'Confira nome, e-mail e senha (mínimo de 8 caracteres).', 'INVALID_INPUT'));
    return;
  }

  try {
    const { nome, email, senha } = parsed.data;
    const senhaHash = await bcrypt.hash(senha, 12);
    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
      [nome, email, senhaHash],
    );

    res.status(201).json({
      token: createToken(result.insertId, email),
      usuario: { id: result.insertId, nome, email },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      next(new AppError(409, 'Já existe uma conta com este e-mail.', 'EMAIL_ALREADY_EXISTS'));
      return;
    }
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError(400, 'Informe um e-mail válido e uma senha.', 'INVALID_INPUT'));
    return;
  }

  try {
    const { email, senha, manterConectado } = parsed.data;
    const [rows] = await db.execute<UserRow[]>(
      'SELECT id, nome, email, senha_hash FROM usuarios WHERE email = ? LIMIT 1',
      [email],
    );
    const usuario = rows[0];
    const senhaValida = usuario ? await bcrypt.compare(senha, usuario.senha_hash) : false;

    if (!usuario || !senhaValida) {
      next(new AppError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS'));
      return;
    }

    let sessionId: string | undefined;
    if (manterConectado) {
      sessionId = randomUUID();
      const sessionExpiresAt = new Date(Date.now() + PERSISTENT_SESSION_TTL_SECONDS * 1000);
      await db.execute<ResultSetHeader>(
        'INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)',
        [hashSessionId(sessionId), usuario.id, sessionExpiresAt],
      );
    }

    res.json({
      token: createToken(usuario.id, usuario.email, sessionId),
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      manterConectado,
      mensagem: manterConectado
        ? 'Você permanecerá conectado neste dispositivo por até 30 dias. Sua senha não foi salva.'
        : 'Você entrou sem manter a sessão neste dispositivo. Sua senha não foi salva.',
    });
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'ER_NO_SUCH_TABLE'
      && 'sql' in error
      && typeof error.sql === 'string'
      && error.sql.includes('sessoes')
    ) {
      next(new AppError(
        503,
        'Não foi possível ativar a sessão persistente porque o banco ainda não está configurado para esse recurso. Crie a tabela de sessões ou desmarque “Manter conectado neste dispositivo” para entrar sem persistência.',
        'PERSISTENT_SESSION_NOT_CONFIGURED',
      ));
      return;
    }
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authenticatedRequest = req as AuthenticatedRequest;
    if (authenticatedRequest.sessionTokenHash) {
      await db.execute(
        'DELETE FROM sessoes WHERE token_hash = ? AND usuario_id = ?',
        [authenticatedRequest.sessionTokenHash, getAuthenticatedUserId(req)],
      );
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
