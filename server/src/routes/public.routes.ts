import { Router } from 'express';
import { getPublicCatalog, getPublicSlots } from '../controllers/public.controller';

const router = Router();

router.get('/:slug/catalog', getPublicCatalog);
router.get('/:slug/slots', getPublicSlots);

export default router;
