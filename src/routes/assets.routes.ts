import { Router } from 'express';
import {
  getAssets, getAssetById, getAssetByQr,
  createAsset, updateAsset, deleteAsset, getDashboardStats,
} from '../controllers/assets.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAssetSchema, updateAssetSchema, getAssetsQuerySchema } from '../utils/schemas';
const router = Router();

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/qr/:uuid', getAssetByQr);
router.get('/', validate(getAssetsQuerySchema), getAssets);
router.get('/:id', getAssetById);
router.post('/', validate(createAssetSchema), createAsset);
router.patch('/:id', validate(updateAssetSchema), updateAsset);
router.delete('/:id', deleteAsset);

export default router;
