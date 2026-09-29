import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as points from './pointsService.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    const [wallet, reservations] = await Promise.all([
      points.getWalletSummary(req.user.id),
      points.listReservations(req.user.id),
    ]);
    res.json({ wallet, reservations });
  }),
);

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    res.json(await points.listTransactions(req.user.id, req.query));
  }),
);

router.get(
  '/rates',
  asyncHandler(async (_req, res) => {
    res.json({ items: await points.listRates() });
  }),
);

export default router;
