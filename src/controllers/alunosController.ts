import { NextFunction, Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { db } from '../database/db';
import { AppError } from '../errors/AppError';
import { getAuthenticatedUserId } from '../middleware/authenticate';

const alunoSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  telefone: z.string().trim().min(8).max(20),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional()
    .transform((email) => email || null),
  idade: z.number().int().min(60).max(120),
  nivel_tecnologia: z.enum(['iniciante', 'basico', 'intermediario']),
});

interface Aluno extends RowDataPacket {
  id: number;
  nome: string;
  telefone: string;
  email: string | null;
  idade: number;
  nivel_tecnologia: 'iniciante' | 'basico' | 'intermediario';
  criado_em: Date;
}

const MAX_PAGE_OFFSET = 1_000_000;

function parsePositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validateId(value: unknown): number {
  if (typeof value !== 'string') {
    throw new AppError(400, 'O identificador do aluno é inválido.', 'INVALID_ID');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(400, 'O identificador do aluno é inválido.', 'INVALID_ID');
  }
  return id;
}

export async function getAlunos(req: Request, res: Response, next: NextFunction): Promise<void> {
  const page = parsePositiveInteger(req.query.page, 1);
  const limit = parsePositiveInteger(req.query.limit, 50);
  if (page === null || limit === null || limit > 100) {
    next(new AppError(400, 'Informe uma página positiva e um limite entre 1 e 100.', 'INVALID_PAGINATION'));
    return;
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || offset > MAX_PAGE_OFFSET) {
    next(new AppError(
      400,
      'A página solicitada excede o limite de navegação. Refine a busca ou volte para uma página anterior.',
      'PAGINATION_OFFSET_TOO_LARGE',
    ));
    return;
  }

  const searchValue = req.query.busca;
  if (searchValue !== undefined && typeof searchValue !== 'string') {
    next(new AppError(400, 'O termo de busca deve ser texto simples.', 'INVALID_SEARCH'));
    return;
  }
  const search = searchValue?.trim() ?? '';
  if (search.length > 100) {
    next(new AppError(400, 'O termo de busca deve ter no máximo 100 caracteres.', 'INVALID_SEARCH'));
    return;
  }
  const term = `%${search}%`;
  const userId = getAuthenticatedUserId(req);

  try {
    const [rows] = await db.execute<Aluno[]>(
      `SELECT id, nome, telefone, email, idade, nivel_tecnologia, criado_em
       FROM alunos
       WHERE usuario_id = ? AND (? = '' OR nome LIKE ? OR email LIKE ?)
       ORDER BY nome ASC
       LIMIT ? OFFSET ?`,
      [userId, search, term, term, limit, offset],
    );
    const [[countRow]] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM alunos WHERE usuario_id = ? AND (? = '' OR nome LIKE ? OR email LIKE ?)`,
      [userId, search, term, term],
    );

    res.json({
      dados: rows,
      paginacao: {
        pagina: page,
        limite: limit,
        total: Number(countRow.total),
        totalPaginas: Math.max(1, Math.ceil(Number(countRow.total) / limit)),
        paginaMaxima: Math.floor(MAX_PAGE_OFFSET / limit) + 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAlunoById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateId(req.params.id);
    const userId = getAuthenticatedUserId(req);
    const [rows] = await db.execute<Aluno[]>(
      `SELECT id, nome, telefone, email, idade, nivel_tecnologia, criado_em
       FROM alunos WHERE id = ? AND usuario_id = ?`,
      [id, userId],
    );
    if (!rows[0]) {
      next(new AppError(404, 'Aluno não encontrado.', 'STUDENT_NOT_FOUND'));
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
}

export async function createAluno(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = alunoSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError(400, 'Confira os dados do aluno antes de salvar.', 'INVALID_INPUT'));
    return;
  }

  try {
    const aluno = parsed.data;
    const userId = getAuthenticatedUserId(req);
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO alunos (usuario_id, nome, telefone, email, idade, nivel_tecnologia)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, aluno.nome, aluno.telefone, aluno.email, aluno.idade, aluno.nivel_tecnologia],
    );
    res.status(201).json({ id: result.insertId, ...aluno });
  } catch (error) {
    next(error);
  }
}

export async function updateAluno(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = alunoSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError(400, 'Confira os dados do aluno antes de salvar.', 'INVALID_INPUT'));
    return;
  }

  try {
    const id = validateId(req.params.id);
    const userId = getAuthenticatedUserId(req);
    const aluno = parsed.data;
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE alunos
       SET nome = ?, telefone = ?, email = ?, idade = ?, nivel_tecnologia = ?
       WHERE id = ? AND usuario_id = ?`,
      [aluno.nome, aluno.telefone, aluno.email, aluno.idade, aluno.nivel_tecnologia, id, userId],
    );
    if (result.affectedRows === 0) {
      next(new AppError(404, 'Aluno não encontrado.', 'STUDENT_NOT_FOUND'));
      return;
    }
    res.json({ id, ...aluno });
  } catch (error) {
    next(error);
  }
}

export async function deleteAluno(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateId(req.params.id);
    const userId = getAuthenticatedUserId(req);
    const [result] = await db.execute<ResultSetHeader>(
      'DELETE FROM alunos WHERE id = ? AND usuario_id = ?',
      [id, userId],
    );
    if (result.affectedRows === 0) {
      next(new AppError(404, 'Aluno não encontrado.', 'STUDENT_NOT_FOUND'));
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
