import { z } from 'zod';

export const ItemSchema = z.object({
  ranking: z.number().int().nonnegative(),
  name: z.string().min(1),
  imagePath: z.string().url().or(z.literal('')),
});

export const ItemsSchema = z.array(ItemSchema);

// Generic page schema used by the agent to understand a scraped page
export const PageSummarySchema = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string(),
  bodyText: z.string(),
  links: z.array(z.string()),
});
