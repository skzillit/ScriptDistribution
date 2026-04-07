const ShootingSchedule = require('../models/ShootingSchedule');
const { uploadFile, getDownloadUrl } = require('../services/storage.service');
const { extractTextFromPdf } = require('../services/pdf.service');
const { parseShootingSchedule } = require('../utils/scheduleParser');

async function uploadSchedule(req, res) {
  if (!req.file) return res.status(400).json({ error: 'PDF file is required' });

  try {
    const { text } = await extractTextFromPdf(req.file.buffer);
    const parsed = parseShootingSchedule(text);

    const s3Key = `schedules/${req.user._id}/${Date.now()}/schedule.pdf`;
    await uploadFile(s3Key, req.file.buffer);

    const schedule = await ShootingSchedule.create({
      title: req.body.title || `Shooting Schedule - ${parsed.startDate || new Date().toLocaleDateString()}`,
      project: req.body.scriptId || null,
      uploadedBy: req.user._id,
      pdfUrl: s3Key,
      rawText: text,
      shootDays: parsed.shootDays,
      totalDays: parsed.totalDays,
      totalScenes: parsed.totalScenes,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      notes: req.body.notes || '',
      status: 'draft',
    });

    res.status(201).json({
      schedule,
      parsed: {
        totalDays: parsed.totalDays,
        totalScenes: parsed.totalScenes,
      },
    });
  } catch (error) {
    res.status(500).json({ error: `Schedule processing failed: ${error.message}` });
  }
}

async function listSchedules(req, res) {
  const { scriptId, page = 1, limit = 20 } = req.query;
  const filter = { uploadedBy: req.user._id };
  if (scriptId) filter.project = scriptId;

  const schedules = await ShootingSchedule.find(filter)
    .populate('project', 'title')
    .select('-rawText')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await ShootingSchedule.countDocuments(filter);
  res.json({ schedules, total, page: Number(page) });
}

async function getSchedule(req, res) {
  const schedule = await ShootingSchedule.findById(req.params.id)
    .populate('project', 'title currentVersion')
    .populate('uploadedBy', 'name');
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ schedule });
}

async function updateSchedule(req, res) {
  const { title, shootDays, notes, status } = req.body;
  const update = {};
  if (title) update.title = title;
  if (shootDays) {
    update.shootDays = shootDays;
    update.totalDays = shootDays.length;
    update.totalScenes = shootDays.reduce((sum, d) => sum + (d.scenes?.length || 0), 0);
  }
  if (notes !== undefined) update.notes = notes;
  if (status) update.status = status;

  const schedule = await ShootingSchedule.findOneAndUpdate(
    { _id: req.params.id, uploadedBy: req.user._id },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ schedule });
}

async function deleteSchedule(req, res) {
  const schedule = await ShootingSchedule.findOneAndDelete({ _id: req.params.id, uploadedBy: req.user._id });
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  res.json({ success: true });
}

async function downloadSchedule(req, res) {
  const schedule = await ShootingSchedule.findById(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  if (!schedule.pdfUrl) return res.status(400).json({ error: 'No PDF available' });
  const url = await getDownloadUrl(schedule.pdfUrl);
  res.json({ downloadUrl: url });
}

async function viewScheduleHtml(req, res) {
  const viewMode = req.query.mode || 'breakdown';
  const schedule = await ShootingSchedule.findById(req.params.id).populate('project', 'title currentVersion');
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

  // PDF mode — redirect to original
  if (viewMode === 'pdf') {
    if (!schedule.pdfUrl) return res.status(400).json({ error: 'No PDF available' });
    const url = await getDownloadUrl(schedule.pdfUrl);
    return res.redirect(url);
  }

  // Breakdown mode — find breakdown data and filter per shoot day
  let breakdownElements = [];
  const Breakdown = require('../models/Breakdown');
  const Script = require('../models/Script');

  let targetVersionId = null;
  if (schedule.project?.currentVersion) {
    targetVersionId = schedule.project.currentVersion._id || schedule.project.currentVersion;
  } else {
    const activeScript = await Script.findOne({ owner: schedule.uploadedBy, status: { $ne: 'archived' } }).populate('currentVersion');
    if (activeScript?.currentVersion) targetVersionId = activeScript.currentVersion._id || activeScript.currentVersion;
  }

  if (targetVersionId) {
    const breakdown = await Breakdown.findOne({ scriptVersion: targetVersionId, status: 'complete' });
    if (breakdown?.elements) breakdownElements = breakdown.elements;
  }

  // Category labels and colors
  const catInfo = {
    CAST_MEMBER: { label: 'Cast', color: '#FF6B6B' }, EXTRA: { label: 'Extras', color: '#FF8E8E' },
    PROP: { label: 'Props', color: '#4ECDC4' }, SET_DRESSING: { label: 'Set Dressing', color: '#45B7D1' },
    LOCATION: { label: 'Locations', color: '#96CEB4' }, VEHICLE: { label: 'Vehicles', color: '#FFEAA7' },
    WARDROBE: { label: 'Wardrobe', color: '#DDA0DD' }, MAKEUP_HAIR: { label: 'Makeup', color: '#FFB6C1' },
    VFX: { label: 'VFX', color: '#A29BFE' }, SFX: { label: 'SFX', color: '#FD79A8' },
    SOUND_EFFECT: { label: 'Sound', color: '#E17055' }, STUNT: { label: 'Stunts', color: '#D63031' },
    SPECIAL_EQUIPMENT: { label: 'Equipment', color: '#FDCB6E' }, ANIMAL: { label: 'Animals', color: '#6C5CE7' },
  };

  const daysHtml = (schedule.shootDays || []).map(day => {
    // Get scene numbers for this day only
    const daySceneNums = new Set((day.scenes || []).map(s => String(s.sceneNumber).toUpperCase()));

    // Filter breakdown elements to ONLY this day's scenes
    const dayElements = breakdownElements
      .filter(el => (el.occurrences || []).some(o => daySceneNums.has(String(o.sceneNumber).toUpperCase())))
      .map(el => el.toObject ? el.toObject() : el);

    // Group by category
    const grouped = {};
    dayElements.forEach(el => { if (!grouped[el.category]) grouped[el.category] = []; grouped[el.category].push(el); });

    const breakdownHtml = Object.keys(grouped).length ? `
      <div style="padding:12px 18px;border-top:1px solid rgba(255,140,0,0.08)">
        <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Breakdown</div>
        ${Object.entries(grouped).map(([cat, els]) => {
          const ci = catInfo[cat] || { label: cat, color: '#888' };
          return `<div style="margin-bottom:6px;display:flex;align-items:flex-start;gap:8px">
            <span style="font-size:9px;font-weight:700;color:${ci.color};text-transform:uppercase;min-width:55px;padding-top:3px">${esc(ci.label)}</span>
            <div style="display:flex;flex-wrap:wrap;gap:3px">${els.map(el => `<span style="padding:2px 6px;border-radius:4px;font-size:10px;background:${ci.color}15;color:${ci.color};font-weight:600">${esc(el.name)}</span>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>` : '';

    const scenesHtml = (day.scenes || []).map(s => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,140,0,0.06);font-weight:600;color:#ff8c00">${esc(s.sceneNumber)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,140,0,0.06)">${esc(s.heading)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,140,0,0.06);color:#888">${esc(s.pages)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,140,0,0.06);color:#888">${(s.cast || []).map(c => esc(c)).join(', ')}</td>
      </tr>`).join('');
    return `
    <div style="margin-bottom:24px;background:#161638;border-radius:12px;border:1px solid rgba(255,140,0,0.12);overflow:hidden">
      <div style="padding:14px 18px;background:linear-gradient(135deg,#ff8c00,#ff5722);display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong style="font-size:16px;color:white">Day ${day.dayNumber}</strong>
          ${day.date ? `<span style="margin-left:12px;font-size:13px;color:rgba(255,255,255,0.8)">${esc(day.date)}</span>` : ''}
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.8)">
          ${day.scenes?.length || 0} scene(s)
          ${day.callTime ? ` &middot; Call: ${esc(day.callTime)}` : ''}
          ${day.location ? ` &middot; ${esc(day.location)}` : ''}
        </div>
      </div>
      ${day.scenes?.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e0e0e0">
        <thead><tr style="text-align:left">
          <th style="padding:8px 12px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,140,0,0.15)">Scene</th>
          <th style="padding:8px 12px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,140,0,0.15)">Heading</th>
          <th style="padding:8px 12px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,140,0,0.15)">Pages</th>
          <th style="padding:8px 12px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,140,0,0.15)">Cast</th>
        </tr></thead>
        <tbody>${scenesHtml}</tbody>
      </table>` : '<p style="padding:16px;color:#888">No scenes listed</p>'}
      ${breakdownHtml}
      ${day.notes ? `<div style="padding:10px 18px;font-size:12px;color:#888;border-top:1px solid rgba(255,140,0,0.08)">${esc(day.notes)}</div>` : ''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(schedule.title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0d0d;color:#e0e0e0;min-height:100vh}
  .header{background:#1a1a1a;border-bottom:1px solid rgba(255,140,0,0.12);padding:20px 24px;text-align:center}
  .header h1{font-size:22px;font-weight:800;background:linear-gradient(135deg,#ff8c00,#ff5722);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .header .meta{font-size:13px;color:#888;margin-top:6px}
  .container{max-width:900px;margin:0 auto;padding:24px}
  .stats{display:flex;gap:16px;margin-bottom:24px}
  .stat{flex:1;background:#1a1a1a;border:1px solid rgba(255,140,0,0.12);border-radius:12px;padding:16px;text-align:center}
  .stat .val{font-size:28px;font-weight:800;background:linear-gradient(135deg,#ff8c00,#ff5722);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .stat .lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
  .print-btn{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#ff8c00,#ff5722);color:white;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(255,140,0,0.3)}
  @media print{.header,.print-btn{display:none}body{background:white;color:black}}
</style>
</head><body>
<div class="header">
  <h1>${esc(schedule.title)}</h1>
  <div class="meta">${schedule.totalDays} days &middot; ${schedule.totalScenes} scenes${schedule.startDate ? ` &middot; ${esc(schedule.startDate)}` : ''}${schedule.endDate && schedule.endDate !== schedule.startDate ? ` to ${esc(schedule.endDate)}` : ''}</div>
</div>
<div class="container">
  <div class="stats">
    <div class="stat"><div class="val">${schedule.totalDays || 0}</div><div class="lbl">Shoot Days</div></div>
    <div class="stat"><div class="val">${schedule.totalScenes || 0}</div><div class="lbl">Total Scenes</div></div>
  </div>
  ${daysHtml}
</div>
<button class="print-btn" onclick="window.print()">Print Schedule</button>
</body></html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

function esc(t) { return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

module.exports = { uploadSchedule, listSchedules, getSchedule, updateSchedule, deleteSchedule, downloadSchedule, viewScheduleHtml };
