import { Request, Response } from 'express';
import { db } from '../database/db';

// Listar todos
export const getAlunos = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM alunos');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
};

// Buscar por ID
export const getAlunoById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM alunos WHERE id = ?', [id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar aluno' });
  }
};

// Criar
export const createAluno = async (req: Request, res: Response) => {
  const { nome, telefone, email, idade, nivel_tecnologia } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO alunos (nome, telefone, email, idade, nivel_tecnologia) VALUES (?, ?, ?, ?, ?)',
      [nome, telefone, email, idade, nivel_tecnologia]
    );
    res.status(201).json({ id: (result as any).insertId, nome, telefone, email, idade, nivel_tecnologia });
  } catch (error) {
    console.error('Erro MySQL:', error);
    res.status(500).json({ error: 'Erro ao cadastrar aluno' });
    }
};

// Atualizar
export const updateAluno = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nome, telefone, email, idade, nivel_tecnologia } = req.body;
  try {
    await db.query(
      'UPDATE alunos SET nome=?, telefone=?, email=?, idade=?, nivel_tecnologia=? WHERE id=?',
      [nome, telefone, email, idade, nivel_tecnologia, id]
    );
    res.json({ mensagem: 'Aluno atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar aluno' });
  }
};

// Deletar
export const deleteAluno = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM alunos WHERE id=?', [id]);
    res.json({ mensagem: 'Aluno excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir aluno' });
  }
};
