const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Target',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  imageId: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  finalScore: {
    type: Number,
    default: 0
  },
  labels: [{
    tag: String,
    confidence: Number
  }],
  submittedAt: {
    type: Date,
    default: Date.now
  },
  thumbsUp: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  thumbsDown: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['pending', 'scored', 'winner'],
    default: 'pending'
  }
});

submissionSchema.index({ targetId: 1, userId: 1 }, { unique: true });
submissionSchema.index({ score: -1 });
submissionSchema.index({ finalScore: -1 });

submissionSchema.set('collection', 'submissions');

module.exports = mongoose.model('Submission', submissionSchema);
