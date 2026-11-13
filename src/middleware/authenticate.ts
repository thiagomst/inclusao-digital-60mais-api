import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { env } from '../config/env';
import { db } from '../database/db';
import { AppError } from '../errors/AppError';
import { hashSessionId } from '../utils/session';

export interface AuthenticatedRequest extends Request {
  userId?: number;
  sessionTokenHash?: string;
}

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.header('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    next(new AppError(401, 'Faça login para continuar.', 'UNAUTHENTICATED'));
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'inclusao-digital-60mais',
      audience: 'inclusao-digital-60mais-web',
    }) as JwtPayload;
    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) {
      throw new Error('Invalid token subject');
    }
  } catch {
    next(new AppError(401, 'Sua sessão expirou. Entre novamente.', 'INVALID_TOKEN'));
    return;
  }

  const userId = Number(payload.sub);
  if (payload.jti !== undefined) {
    if (typeof payload.jti !== 'string') {
      next(new AppError(401, 'Sua sessão expirou. Entre novamente.', 'INVALID_TOKEN'));
      return;
    }

    try {
      const sessionTokenHash = hashSessionId(payload.jti);
      const [sessions] = await db.execute<RowDataPacket[]>(
        'SELECT token_hash FROM sessoes WHERE token_hash = ? AND usuario_id = ? AND expira_em > CURRENT_TIMESTAMP LIMIT 1',
        [sessionTokenHash, userId],
      );
      if (sessions.length === 0) {
        next(new AppError(401, 'Esta sessão não está mais ativa. Entre novamente.', 'INVALID_TOKEN'));
        return;
      }
      req.sessionTokenHash = sessionTokenHash;
    } catch (error) {
      next(error);
      return;
    }
  }

  req.userId = userId;
  next();
}

export function getAuthenticatedUserId(req: Request): number {
  const userId = (req as AuthenticatedRequest).userId;
  if (!userId) {
    throw new AppError(401, 'Faça login para continuar.', 'UNAUTHENTICATED');
  }
  return userId;
}
