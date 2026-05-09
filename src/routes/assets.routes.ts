import { Router } from 'express';
import {
  getAssets, getAssetById, getAssetByQr,
  createAsset, updateAsset, deleteAsset, getDashboardStats,
} from '../controllers/assets.controller';
import { importAssetsFromZip } from '../controllers/importAssets.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAssetSchema, updateAssetSchema, getAssetsQuerySchema } from '../utils/schemas';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/qr/:uuid', getAssetByQr);

// Zip import — must be registered BEFORE /:id to avoid route conflict
router.post('/import-zip', upload.single('file'), importAssetsFromZip);

router.get('/', validate(getAssetsQuerySchema), getAssets);
router.get('/:id', getAssetById);
router.post('/', validate(createAssetSchema), createAsset);
router.patch('/:id', validate(updateAssetSchema), updateAsset);
router.delete('/:id', deleteAsset);

export default router;