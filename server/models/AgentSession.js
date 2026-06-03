import mongoose from 'mongoose';

const logEntrySchema = new mongoose.Schema(
  {
    ts: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: String,
  },
  { _id: false }
);

const agentSessionSchema = new mongoose.Schema({
  // Human-readable goal ("collect 50 laptop listings from hacker news")
  goal: { type: String, required: true },
  seedUrl: { type: String, required: true },
  // Agent params
  maxIterations: { type: Number, default: 20 },
  maxUrls: { type: Number, default: 100 },
  // Runtime state
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'stopped'],
    default: 'running',
    index: true,
  },
  iterations: { type: Number, default: 0 },
  visited: { type: [String], default: [] },
  frontier: { type: [String], default: [] },
  // Accumulated data the agent has deemed relevant to the goal
  collectedItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  log: { type: [logEntrySchema], default: [] },
  summary: String,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

export const AgentSession = mongoose.model('AgentSession', agentSessionSchema);
