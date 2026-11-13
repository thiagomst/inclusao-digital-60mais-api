import { Router } from 'express';
import { login, logout, register } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/cadastro', register);
router.post('/login', login);
router.delete('/sessao', authenticate, logout);

export default router;
