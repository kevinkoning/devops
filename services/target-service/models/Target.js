const mongoose = require('mongoose');

const targetSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  imageId: {
    type: String,
    required: true
  },
  location: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    radiusMeters: {
      type: Number,
      required: true,
      default: 100,
      min: 10,
      max: 50000
    }
  },
  geoLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  deadline: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  winnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

targetSchema.index({ geoLocation: '2dsphere' });
targetSchema.index({ status: 1, deadline: 1 });
targetSchema.index({ ownerId: 1 });

targetSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  if (this.isModified('location')) {
    this.geoLocation = {
      type: 'Point',
      coordinates: [this.location.longitude, this.location.latitude]
    };
  }

  if (this.isModified('deadline') && this.deadline <= new Date()) {
    this.status = 'closed';
  }
  next();
});

targetSchema.set('collection', 'targets');

module.exports = mongoose.model('Target', targetSchema);
