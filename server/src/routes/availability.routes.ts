import { Router } from 'express';
import { Role } from '@prisma/client';
import { upsertAvailability } from '../controllers/availability.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.put('/', requireAuth, requireRole(Role.OWNER, Role.STAFF), upsertAvailability);

export default router;
