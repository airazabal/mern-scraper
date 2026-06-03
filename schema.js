import { z } from 'zod';

export const ItemSchema = z.object({
  ranking: z.number().int().nonnegative(),
  name: z.string().min(1),
  imagePath: z.string().url().or(z.literal('')),
});

export const ItemsSchema = z.array(ItemSchema);
