import { Request, Response } from 'express';
import { SessionUser } from '@/types/user';
import { getEditableProfile, updateEditableProfile } from '@/services/v1/profile';
import { ProfileError } from '@/services/v1/profile/policy';
export async function editableProfileController(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const id = (req.user as SessionUser)?.id;
    if (!id) return res.status(401).json({ error: 'Please sign in.' });
    const result = req.method === 'PATCH' ? await updateEditableProfile(id, req.body) : await getEditableProfile(id);
    return res.json(result);
  } catch (error) {
    return res.status(error instanceof ProfileError ? error.status : 500).json({ error: error instanceof ProfileError ? error.message : 'Unable to update profile. Please try again.' });
  }
}
