import { Router } from 'express';
import { Role } from '@prisma/client';
import { createStaff, listStaff } from '../controllers/staff.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireAuth, requireRole(Role.OWNER), createStaff);
router.get('/', requireAuth, listStaff);

export default router;
