import { Router } from 'express';
import { Role } from '@prisma/client';
import { createService, listServices } from '../controllers/service.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireAuth, requireRole(Role.OWNER), createService);
router.get('/', requireAuth, listServices);

export default router;
