import { Router } from 'express';
import { getMe, login, registerOwner } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/register-owner', registerOwner);
router.post('/login', login);
router.get('/me', requireAuth, getMe);

export default router;
