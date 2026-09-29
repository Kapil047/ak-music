import { z } from 'zod';

export const searchSchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query cannot be empty').max(150),
    type: z.enum(['song', 'video', 'album', 'artist', 'playlist']).default('song'),
    page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1))
  })
});

export const suggestionsSchema = z.object({
  query: z.object({
    q: z.string().max(100).optional(),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined)),
  }),
});

