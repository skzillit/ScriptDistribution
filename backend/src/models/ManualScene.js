const mongoose = require('mongoose');

/**
 * A scene a user has manually added to a script version because the auto-
 * detector missed it (unnumbered scripts, stylized headings, etc.). Lives at
 * the SCRIPT VERSION level — surviving a version bump means re-entering the
 * scene against the new version's PDF.
 *
 * On the picker side, manual scenes are merged into the version-scenes list
 * returned by `/api/versions/:id/scenes` and OVERRIDE auto-detected scenes
 * with the same scene number.
 *
 * On the extraction side, a manual scene renders the script PDF pages from
 * `pageStart` to `pageEnd` (inclusive). pageEnd defaults to pageStart for
 * single-page scenes.
 */
const manualSceneSchema = new mongoose.Schema({
  scriptVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptVersion', required: true, index: true },
  sceneNumber: { type: String, required: true, trim: true },
  heading: { type: String, required: true, trim: true },
  pageStart: { type: Number, required: true, min: 1 },
  pageEnd: { type: Number, min: 1 }, // defaults to pageStart on save when missing
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

manualSceneSchema.pre('save', function (next) {
  if (this.pageEnd == null) this.pageEnd = this.pageStart;
  if (this.pageEnd < this.pageStart) this.pageEnd = this.pageStart;
  next();
});

manualSceneSchema.index({ scriptVersion: 1, sceneNumber: 1 });

module.exports = mongoose.model('ManualScene', manualSceneSchema);
