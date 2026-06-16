import { Router } from 'express';
import { getAlunos, getAlunoById, createAluno, updateAluno, deleteAluno } from '../controllers/alunosController';

const router = Router();

router.get('/', getAlunos);
router.get('/:id', getAlunoById);
router.post('/', createAluno);
router.put('/:id', updateAluno);
router.delete('/:id', deleteAluno);

export default router;
