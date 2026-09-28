import { z } from 'zod';

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(3, 'Invalid entity ID').max(60)
  })
});
