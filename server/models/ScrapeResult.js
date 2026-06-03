import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    ranking: Number,
    name: String,
    imagePath: String,
  },
  { _id: false }
);

const scrapeResultSchema = new mongoose.Schema({
  target: { type: String, required: true, unique: true, index: true },
  items: { type: [itemSchema], default: [] },
  // Generic fields populated by extractPageMeta — used by the goal agent
  title: String,
  description: String,
  bodyText: String,
  links: { type: [String], default: [] },
  videos: { type: [String], default: [] },
  scrapedAt: { type: Date, default: Date.now },
});

export const ScrapeResult = mongoose.model('ScrapeResult', scrapeResultSchema);
