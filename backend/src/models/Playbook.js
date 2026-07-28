const mongoose = require('mongoose');

const taskTemplateSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  dueInDays:  { type: Number, default: 2 },
  order:      { type: Number, default: 0 },
});

const playbookSchema = new mongoose.Schema({
  stage: {
    type: String,
    enum: ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'],
    required: true,
    unique: true,
  },
  isActive:  { type: Boolean, default: true },
  useAI:     { type: Boolean, default: true },   // true = call GPT, false = use fixed tasks
  tasks:     [taskTemplateSchema],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.models.Playbook || mongoose.model('Playbook', playbookSchema);
