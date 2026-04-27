import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser, updateProfilePhoto } from '../controllers/users.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createUserSchema, updateUserSchema } from '../utils/schemas';

import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

// Allow any authenticated user to update their own profile photo
router.post('/profile-photo', upload.single('photo'), updateProfilePhoto);

router.use(requireRole('ADMIN'));

router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', validate(createUserSchema), createUser);
router.patch('/:id', validate(updateUserSchema), updateUser);
router.delete('/:id', deleteUser);

export default router;
