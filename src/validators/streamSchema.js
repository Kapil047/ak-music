import { z } from 'zod';

export const streamSchema = z.object({
  params: z.object({
    id: z.string().min(8, 'Invalid YouTube Video ID').max(20)
  }),
  query: z.object({
    quality: z.enum(['low', 'medium', 'high']).default('high'),
    mode: z.enum(['redirect', 'proxy']).default('redirect')
  }).optional()
});
