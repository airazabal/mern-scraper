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
  scrapedAt: { type: Date, default: Date.now },
});

export const ScrapeResult = mongoose.model('ScrapeResult', scrapeResultSchema);
