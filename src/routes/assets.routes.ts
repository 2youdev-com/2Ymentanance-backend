import { Router } from 'express';
import {
  getAssets, getAssetById, getAssetByQr,
  createAsset, updateAsset, deleteAsset, getDashboardStats,
} from '../controllers/assets.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAssetSchema, updateAssetSchema, getAssetsQuerySchema } from '../utils/schemas';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/qr/:uuid', getAssetByQr);
router.get('/', validate(getAssetsQuerySchema), getAssets);
router.get('/:id', getAssetById);
router.post('/', upload.single('photo'), validate(createAssetSchema), createAsset);
router.patch('/:id', upload.single('photo'), validate(updateAssetSchema), updateAsset);
router.delete('/:id', deleteAsset);

export default router;
