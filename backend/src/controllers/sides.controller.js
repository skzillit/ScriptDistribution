const CallSheet = require('../models/CallSheet');
const Sides = require('../models/Sides');
const Script = require('../models/Script');
const ScriptVersion = require('../models/ScriptVersion');
const { uploadFile, getDownloadUrl, getScriptPdfKey, getFileBuffer } = require('../services/storage.service');
const { extractTextFromPdf } = require('../services/pdf.service');
const { parseCallSheetText, parseSceneNumberInput } = require('../utils/callSheetParser');
const { extractSides, extractSidesWithAI, buildSceneMap } = require('../services/sides.service');
const ScriptPage = require('../models/ScriptPage');
const AnalyticsEvent = require('../models/AnalyticsEvent');

// ====== CALL SHEET ENDPOINTS ======

async function uploadCallSheet(req, res) {
  if (!req.file) return res.status(400).json({ error: 'PDF file is required' });

  try {
    // Archive existing call sheets (move to history)
    await CallSheet.updateMany(
      { uploadedBy: req.user._id, status: { $ne: 'archived' } },
      { $set: { status: 'archived' } }
    );

    // Extract text from uploaded call sheet
    const { text } = await extractTextFromPdf(req.file.buffer);

    // Parse scene numbers and metadata from text
    const { scenes, metadata, sceneNumbers } = parseCallSheetText(text);

    // Upload PDF to S3
    const s3Key = `callsheets/${req.user._id}/${Date.now()}/callsheet.pdf`;
    await uploadFile(s3Key, req.file.buffer);

    // Create call sheet record
    const callSheet = await CallSheet.create({
      title: req.body.title || `Call Sheet - ${metadata.date || new Date().toLocaleDateString()}`,
      project: req.body.scriptId || null,
      uploadedBy: req.user._id,
      date: metadata.date ? new Date(metadata.date) : new Date(),
      pdfUrl: s3Key,
      rawText: text,
      scenes,
      crewCall: metadata.crewCall,
      location: metadata.location,
      weather: metadata.weather,
      notes: req.body.notes,
      status: 'draft',
    });

    // Auto-generate sides from this call sheet
    autoGenerateSides(req.user, callSheet).catch(err => {
      console.error('Auto-generate sides error:', err.message);
    });

    res.status(201).json({
      callSheet,
      extractedSceneNumbers: sceneNumbers,
      sceneCount: scenes.length,
    });
  } catch (error) {
    res.status(500).json({ error: `Call sheet processing failed: ${error.message}` });
  }
}

/**
 * Auto-generate sides when a call sheet is uploaded.
 * Uses the active script + latest schedule automatically.
 */
async function autoGenerateSides(user, callSheet) {
  const sceneNumbers = (callSheet.scenes || []).map(s => s.sceneNumber);
  if (sceneNumbers.length === 0) return;

  // Find active script
  const activeScript = await Script.findOne({ owner: user._id, status: { $ne: 'archived' } }).populate('currentVersion');
  if (!activeScript?.currentVersion) return;

  const targetVersionId = activeScript.currentVersion._id || activeScript.currentVersion;

  // Find latest schedule and match shoot days
  const ShootingSchedule = require('../models/ShootingSchedule');
  const schedule = await ShootingSchedule.findOne({ uploadedBy: user._id }).sort({ createdAt: -1 });

  let shootDayInfo = [];
  if (schedule?.shootDays) {
    const csSceneSet = new Set(sceneNumbers.map(s => String(s).toUpperCase()));

    // Find best matching day
    let bestDay = null;
    let bestOverlap = 0;
    for (const day of schedule.shootDays) {
      const overlap = (day.scenes || []).filter(s => csSceneSet.has(String(s.sceneNumber).toUpperCase()));
      if (overlap.length > bestOverlap) { bestOverlap = overlap.length; bestDay = day; }
    }

    const primaryDaySceneNums = new Set((bestDay?.scenes || []).map(s => String(s.sceneNumber).toUpperCase()));

    if (bestDay) {
      shootDayInfo.push({
        dayNumber: bestDay.dayNumber, date: bestDay.date, callTime: bestDay.callTime,
        wrapTime: bestDay.wrapTime, location: bestDay.location, notes: bestDay.notes,
        scheduleTitle: schedule.title, isExtraDay: false,
        scenes: (bestDay.scenes || []).map(s => ({ ...s.toObject ? s.toObject() : s })),
      });
    }

    // Find extra scenes not in primary day
    for (const day of schedule.shootDays) {
      if (day.dayNumber === bestDay?.dayNumber) continue;
      const extraScenes = (day.scenes || [])
        .filter(s => csSceneSet.has(String(s.sceneNumber).toUpperCase()) && !primaryDaySceneNums.has(String(s.sceneNumber).toUpperCase()));
      if (extraScenes.length > 0) {
        shootDayInfo.push({
          dayNumber: day.dayNumber, date: day.date, callTime: day.callTime,
          wrapTime: day.wrapTime, location: day.location, notes: day.notes,
          scheduleTitle: schedule.title, isExtraDay: true,
          scenes: extraScenes.map(s => ({ ...s.toObject ? s.toObject() : s })),
        });
      }
    }
  }

  // Archive existing sides
  await Sides.updateMany(
    { generatedBy: user._id, status: { $in: ['generating', 'ready'] } },
    { $set: { status: 'archived' } }
  );

  // Create sides
  const sides = await Sides.create({
    callSheet: callSheet._id,
    shootingSchedule: schedule?._id || null,
    scriptVersion: targetVersionId,
    script: activeScript._id,
    title: `Sides - ${callSheet.title}`,
    sceneNumbers,
    shootDayInfo,
    includeCallSheet: true,
    callSheetPages: 'all',
    generatedBy: user._id,
    status: 'generating',
  });

  // Extract asynchronously
  extractSides(sides._id, targetVersionId, sceneNumbers).catch(err => {
    console.error('Auto sides extraction error:', err);
  });

  console.log(`Auto-generated sides ${sides._id} from call sheet ${callSheet._id} with ${sceneNumbers.length} scenes`);
}

async function listCallSheets(req, res) {
  const { scriptId, page = 1, limit = 20, history } = req.query;
  const filter = { uploadedBy: req.user._id };
  if (scriptId) filter.project = scriptId;
  if (history === 'true') {
    filter.status = 'archived';
  } else {
    filter.status = { $ne: 'archived' };
  }

  const callSheets = await CallSheet.find(filter)
    .populate('project', 'title')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await CallSheet.countDocuments(filter);
  res.json({ callSheets, total, page: Number(page) });
}

async function getCallSheet(req, res) {
  const callSheet = await CallSheet.findById(req.params.id)
    .populate('project', 'title currentVersion')
    .populate('uploadedBy', 'name');

  if (!callSheet) return res.status(404).json({ error: 'Call sheet not found' });
  res.json({ callSheet });
}

async function updateCallSheet(req, res) {
  const { title, scenes, notes, date, status } = req.body;
  const update = {};
  if (title) update.title = title;
  if (scenes) update.scenes = scenes;
  if (notes !== undefined) update.notes = notes;
  if (date) update.date = date;
  if (status) update.status = status;

  const callSheet = await CallSheet.findOneAndUpdate(
    { _id: req.params.id, uploadedBy: req.user._id },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!callSheet) return res.status(404).json({ error: 'Call sheet not found' });
  res.json({ callSheet });
}

async function viewCallSheetHtml(req, res) {
  const viewMode = req.query.mode || 'breakdown'; // 'breakdown' or 'pdf'
  const cs = await CallSheet.findById(req.params.id).populate('project', 'title currentVersion');
  if (!cs) return res.status(404).json({ error: 'Call sheet not found' });

  // PDF mode — redirect to original PDF
  if (viewMode === 'pdf') {
    if (!cs.pdfUrl) return res.status(400).json({ error: 'No PDF available' });
    const url = await getDownloadUrl(cs.pdfUrl);
    return res.redirect(url);
  }

  // Breakdown mode — show ONLY this call sheet's scenes with breakdown elements
  const callSheetSceneNums = new Set((cs.scenes || []).map(s => String(s.sceneNumber).toUpperCase()));

  // Find breakdown: try linked project first, then fall back to user's active script
  let breakdownElements = [];
  const Breakdown = require('../models/Breakdown');

  let targetVersionId = null;
  if (cs.project?.currentVersion) {
    targetVersionId = cs.project.currentVersion._id || cs.project.currentVersion;
  } else {
    // No project linked — find the user's active script
    const activeScript = await Script.findOne({
      owner: cs.uploadedBy,
      status: { $ne: 'archived' },
    }).populate('currentVersion');
    if (activeScript?.currentVersion) {
      targetVersionId = activeScript.currentVersion._id || activeScript.currentVersion;
    }
  }

  if (targetVersionId) {
    const breakdown = await Breakdown.findOne({ scriptVersion: targetVersionId, status: 'complete' });
    if (breakdown?.elements) {
      // STRICT filter: only elements whose occurrences are in THIS call sheet's scene numbers
      breakdownElements = [];
      for (const el of breakdown.elements) {
        const matchingOccs = (el.occurrences || []).filter(occ =>
          callSheetSceneNums.has(String(occ.sceneNumber).toUpperCase())
        );
        if (matchingOccs.length > 0) {
          breakdownElements.push({
            ...el.toObject(),
            occurrences: matchingOccs,
          });
        }
      }
    }
  }

  // Find matching shoot day from any uploaded schedule
  const ShootingSchedule = require('../models/ShootingSchedule');
  let matchedShootDay = null;
  const schedules = await ShootingSchedule.find({ uploadedBy: cs.uploadedBy }).sort({ createdAt: -1 });
  for (const sched of schedules) {
    for (const day of (sched.shootDays || [])) {
      const daySceneNums = new Set((day.scenes || []).map(s => String(s.sceneNumber).toUpperCase()));
      // Match if ANY of the call sheet scenes appear in this shoot day
      const overlap = [...callSheetSceneNums].filter(sn => daySceneNums.has(sn));
      if (overlap.length > 0 && (!matchedShootDay || overlap.length > matchedShootDay.overlapCount)) {
        matchedShootDay = {
          dayNumber: day.dayNumber,
          date: day.date,
          callTime: day.callTime,
          wrapTime: day.wrapTime,
          location: day.location,
          scenes: day.scenes,
          scheduleTitle: sched.title,
          overlapCount: overlap.length,
        };
      }
    }
    if (matchedShootDay) break; // Use first (latest) schedule with a match
  }

  // Group breakdown elements by category
  const grouped = {};
  for (const el of breakdownElements) {
    if (!grouped[el.category]) grouped[el.category] = [];
    grouped[el.category].push(el);
  }

  const categoryLabels = {
    CAST_MEMBER: 'Cast', EXTRA: 'Extras', PROP: 'Props', SET_DRESSING: 'Set Dressing',
    LOCATION: 'Locations', VEHICLE: 'Vehicles', WARDROBE: 'Wardrobe', MAKEUP_HAIR: 'Makeup/Hair',
    VFX: 'Visual Effects', SFX: 'Special Effects', SOUND_EFFECT: 'Sound Effects', MUSIC: 'Music',
    SPECIAL_EQUIPMENT: 'Special Equipment', ANIMAL: 'Animals', STUNT: 'Stunts', GREENERY: 'Greenery',
  };

  const breakdownHtml = Object.keys(grouped).length ? Object.entries(grouped).map(([cat, els]) => `
    <div style="margin-bottom:20px">
      <h4 style="font-size:13px;font-weight:700;color:${els[0]?.color || '#ff8c00'};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${els[0]?.color || '#ff8c00'}"></span>
        ${escapeHtml(categoryLabels[cat] || cat)} (${els.length})
      </h4>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${els.map(el => `<span style="padding:4px 10px;border-radius:6px;font-size:12px;background:${el.color || '#ff8c00'}18;color:${el.color || '#ff8c00'};border:1px solid ${el.color || '#ff8c00'}30;font-weight:600">${escapeHtml(el.name)}</span>`).join('')}
      </div>
    </div>
  `).join('') : '<p style="color:#666;font-size:13px;margin:16px 0">No breakdown data available. Run AI Breakdown on your script first.</p>';

  const scenesHtml = (cs.scenes || []).map(s => {
    // Find breakdown elements for THIS specific scene only
    const sceneNum = String(s.sceneNumber).toUpperCase();
    const sceneElements = breakdownElements.filter(el =>
      el.occurrences.some(occ => String(occ.sceneNumber).toUpperCase() === sceneNum)
    );
    const sceneGrouped = {};
    sceneElements.forEach(el => {
      if (!sceneGrouped[el.category]) sceneGrouped[el.category] = [];
      sceneGrouped[el.category].push(el);
    });

    const sceneBreakdownHtml = Object.keys(sceneGrouped).length ? `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,140,0,0.08)">
        ${Object.entries(sceneGrouped).map(([cat, els]) => `
          <div style="margin-bottom:6px;display:flex;align-items:flex-start;gap:8px">
            <span style="font-size:9px;font-weight:700;color:${els[0]?.color || '#888'};text-transform:uppercase;min-width:60px;padding-top:3px">${escapeHtml(categoryLabels[cat] || cat)}</span>
            <div style="display:flex;flex-wrap:wrap;gap:3px">${els.map(el => `<span style="padding:2px 6px;border-radius:4px;font-size:10px;background:${el.color || '#888'}15;color:${el.color || '#888'};font-weight:600">${escapeHtml(el.name)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>` : '';

    return `
    <div style="background:#1a1a1a;border:1px solid rgba(255,140,0,0.1);border-radius:10px;padding:14px 18px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:800;font-size:16px;color:#ff8c00">Sc. ${escapeHtml(s.sceneNumber)}</span>
          ${s.location ? `<span style="font-size:13px;color:#e0e0e0">${escapeHtml(s.location)}</span>` : ''}
          ${s.timeOfDay ? `<span style="font-size:12px;color:#888">- ${escapeHtml(s.timeOfDay)}</span>` : ''}
        </div>
        ${s.pages ? `<span style="font-size:11px;color:#666">${escapeHtml(s.pages)}</span>` : ''}
      </div>
      ${s.description ? `<p style="font-size:12px;color:#aaa;margin-top:6px;line-height:1.5">${escapeHtml(s.description)}</p>` : ''}
      ${s.cast?.length ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${s.cast.map(c => `<span style="padding:2px 6px;border-radius:4px;font-size:10px;background:rgba(255,107,107,0.12);color:#ff6b6b;font-weight:600">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
      ${s.notes ? `<p style="font-size:11px;color:#666;margin-top:4px;font-style:italic">${escapeHtml(s.notes)}</p>` : ''}
      ${sceneBreakdownHtml}
    </div>`;
  }).join('');

  const dateStr = cs.date ? new Date(cs.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(cs.title)} - Breakdown</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0d0d;color:#e0e0e0;min-height:100vh}
  .header{background:#1a1a1a;border-bottom:1px solid rgba(255,140,0,0.12);padding:20px 24px;text-align:center}
  .header h1{font-size:22px;font-weight:800;background:linear-gradient(135deg,#ff8c00,#ff5722);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .header .meta{font-size:13px;color:#888;margin-top:6px}
  .container{max-width:900px;margin:0 auto;padding:24px}
  .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:24px}
  .info-card{background:#1a1a1a;border:1px solid rgba(255,140,0,0.12);border-radius:10px;padding:12px 14px}
  .info-card .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:3px}
  .info-card .value{font-size:14px;color:#e0e0e0;font-weight:600}
  .section{margin-bottom:24px}
  .section-title{font-size:16px;font-weight:700;color:#ff8c00;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,140,0,0.1)}
  .print-btn{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#ff8c00,#ff5722);color:white;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(255,140,0,0.3)}
  @media print{.header,.print-btn{display:none}body{background:white;color:black}.info-card{border-color:#ddd}.section-title{color:#333}}
</style>
</head><body>
<div class="header">
  <h1>${escapeHtml(cs.title)}</h1>
  <div class="meta">${dateStr ? dateStr + ' &middot; ' : ''}${cs.scenes?.length || 0} scenes today${cs.project ? ' &middot; ' + escapeHtml(cs.project.title) : ''}</div>
</div>
<div class="container">
  <div class="info-grid">
    ${cs.crewCall ? `<div class="info-card"><div class="label">Crew Call</div><div class="value">${escapeHtml(cs.crewCall)}</div></div>` : ''}
    ${cs.location ? `<div class="info-card"><div class="label">Location</div><div class="value">${escapeHtml(cs.location)}</div></div>` : ''}
    ${cs.weather ? `<div class="info-card"><div class="label">Weather</div><div class="value">${escapeHtml(cs.weather)}</div></div>` : ''}
    <div class="info-card"><div class="label">Scenes Today</div><div class="value" style="color:#ff8c00;font-size:20px">${cs.scenes?.length || 0}</div></div>
    ${matchedShootDay ? `<div class="info-card"><div class="label">Shoot Day</div><div class="value" style="color:#ff8c00;font-size:20px">Day ${matchedShootDay.dayNumber}</div></div>` : ''}
  </div>

  ${matchedShootDay ? `
  <div class="section">
    <h3 class="section-title">Shoot Day ${matchedShootDay.dayNumber}${matchedShootDay.date ? ' \u2014 ' + escapeHtml(matchedShootDay.date) : ''}</h3>
    <div style="background:#1a1a1a;border:1px solid rgba(255,140,0,0.12);border-radius:10px;overflow:hidden;margin-bottom:16px">
      <div style="padding:10px 16px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#aaa;border-bottom:1px solid rgba(255,140,0,0.08)">
        ${matchedShootDay.callTime ? `<span><strong style="color:#888">Call:</strong> ${escapeHtml(matchedShootDay.callTime)}</span>` : ''}
        ${matchedShootDay.wrapTime ? `<span><strong style="color:#888">Wrap:</strong> ${escapeHtml(matchedShootDay.wrapTime)}</span>` : ''}
        ${matchedShootDay.location ? `<span><strong style="color:#888">Location:</strong> ${escapeHtml(matchedShootDay.location)}</span>` : ''}
        <span><strong style="color:#888">Scenes:</strong> ${matchedShootDay.scenes?.length || 0}</span>
        <span style="color:#666">from ${escapeHtml(matchedShootDay.scheduleTitle)}</span>
      </div>
      ${matchedShootDay.scenes?.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:12px;color:#e0e0e0">
        <thead><tr>
          <th style="padding:6px 12px;text-align:left;font-size:10px;color:#888;border-bottom:1px solid rgba(255,140,0,0.1)">Scene</th>
          <th style="padding:6px 12px;text-align:left;font-size:10px;color:#888;border-bottom:1px solid rgba(255,140,0,0.1)">Heading</th>
          <th style="padding:6px 12px;text-align:left;font-size:10px;color:#888;border-bottom:1px solid rgba(255,140,0,0.1)">Pages</th>
          <th style="padding:6px 12px;text-align:left;font-size:10px;color:#888;border-bottom:1px solid rgba(255,140,0,0.1)">Cast</th>
        </tr></thead>
        <tbody>${matchedShootDay.scenes.map(s => `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,140,0,0.05);font-weight:700;color:#ff8c00">${escapeHtml(s.sceneNumber)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,140,0,0.05)">${escapeHtml(s.heading || '')}</td>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,140,0,0.05);color:#888">${escapeHtml(s.pages || '')}</td>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,140,0,0.05);color:#888">${(s.cast || []).map(c => escapeHtml(c)).join(', ')}</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}
    </div>
  </div>` : ''}

  <div class="section">
    <h3 class="section-title">Today's Scenes</h3>
    ${scenesHtml || '<p style="color:#666">No scenes</p>'}
  </div>

  ${Object.keys(grouped).length ? `
  <div class="section">
    <h3 class="section-title">Breakdown (Today's Scenes Only)</h3>
    ${breakdownHtml}
  </div>` : ''}

  ${cs.notes ? `<div style="background:#1a1a1a;border:1px solid rgba(255,140,0,0.12);border-radius:10px;padding:16px;margin-top:16px"><strong style="color:#ff8c00">Notes:</strong> <span style="color:#aaa">${escapeHtml(cs.notes)}</span></div>` : ''}
</div>
<button class="print-btn" onclick="window.print()">Print</button>
</body></html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

async function downloadCallSheet(req, res) {
  const cs = await CallSheet.findById(req.params.id);
  if (!cs) return res.status(404).json({ error: 'Call sheet not found' });
  if (!cs.pdfUrl) return res.status(400).json({ error: 'No PDF available' });
  const url = await getDownloadUrl(cs.pdfUrl);
  res.json({ downloadUrl: url });
}

async function deleteCallSheet(req, res) {
  const callSheet = await CallSheet.findOneAndDelete({ _id: req.params.id, uploadedBy: req.user._id });
  if (!callSheet) return res.status(404).json({ error: 'Call sheet not found' });
  // Also delete associated sides
  await Sides.deleteMany({ callSheet: callSheet._id });
  res.json({ success: true });
}

// ====== SIDES ENDPOINTS ======

async function generateSides(req, res) {
  const { callSheetId, scriptId, versionId, sceneNumbers: manualScenes, title, mode, aiProvider, includeCallSheet, callSheetPages, scheduleId, matchedDays, primaryDay } = req.body;

  const script = await Script.findById(scriptId);
  if (!script) return res.status(404).json({ error: 'Script not found' });

  const targetVersionId = versionId || script.currentVersion;
  const version = await ScriptVersion.findById(targetVersionId);
  if (!version) return res.status(404).json({ error: 'Script version not found' });

  let sceneNumbers = [];
  if (callSheetId) {
    const callSheet = await CallSheet.findById(callSheetId);
    if (!callSheet) return res.status(404).json({ error: 'Call sheet not found' });
    sceneNumbers = callSheet.scenes.map(s => s.sceneNumber);
  }
  if (manualScenes) {
    const parsed = Array.isArray(manualScenes) ? manualScenes : parseSceneNumberInput(manualScenes);
    sceneNumbers = [...new Set([...sceneNumbers, ...parsed])];
  }
  if (sceneNumbers.length === 0) {
    return res.status(400).json({ error: 'No scene numbers provided.' });
  }

  // Extract shoot day info from schedule if provided
  let shootDayInfo = [];
  if (scheduleId) {
    const ShootingSchedule = require('../models/ShootingSchedule');
    const schedule = await ShootingSchedule.findById(scheduleId);
    if (schedule && schedule.shootDays) {
      const sceneSet = new Set(sceneNumbers.map(s => String(s).toUpperCase()));
      const requestedDays = matchedDays ? new Set(matchedDays.map(Number)) : null;

      // Determine primary day number
      const primaryDayNum = primaryDay ? Number(primaryDay) : (requestedDays ? [...requestedDays][0] : null);

      // Get call sheet scene numbers for strict filtering on extra days
      let callSheetSceneNums = sceneSet; // default to all requested scenes
      if (callSheetId) {
        const cs = await CallSheet.findById(callSheetId);
        if (cs?.scenes) {
          callSheetSceneNums = new Set(cs.scenes.map(s => String(s.sceneNumber).toUpperCase()));
        }
      }

      // Collect all requested days
      const allMatchedDays = schedule.shootDays.filter(day => {
        if (requestedDays) return requestedDays.has(day.dayNumber);
        return (day.scenes || []).some(s => sceneSet.has(String(s.sceneNumber).toUpperCase()));
      });

      // Primary day scenes (for tracking what's already covered)
      const primaryDayObj = allMatchedDays.find(d => d.dayNumber === primaryDayNum) || allMatchedDays[0];
      const primaryDaySceneNums = new Set(
        (primaryDayObj?.scenes || []).map(s => String(s.sceneNumber).toUpperCase())
      );

      shootDayInfo = allMatchedDays.map(day => {
        const isPrimary = day.dayNumber === (primaryDayObj?.dayNumber);
        let scenesToInclude;

        if (isPrimary) {
          // Primary day — include all its scenes
          scenesToInclude = (day.scenes || []).map(s => ({ ...s.toObject ? s.toObject() : s }));
        } else {
          // Extra day — ONLY the specific scenes that are in call sheet AND not in primary day
          scenesToInclude = (day.scenes || [])
            .filter(s => {
              const sn = String(s.sceneNumber).toUpperCase();
              return callSheetSceneNums.has(sn) && !primaryDaySceneNums.has(sn);
            })
            .map(s => ({ ...s.toObject ? s.toObject() : s }));
        }

        if (!isPrimary && scenesToInclude.length === 0) return null;
        return {
          dayNumber: day.dayNumber,
          date: day.date,
          callTime: day.callTime,
          wrapTime: day.wrapTime,
          location: day.location,
          notes: day.notes,
          scheduleTitle: schedule.title,
          isExtraDay: !isPrimary,
          scenes: scenesToInclude,
        };
      }).filter(Boolean);
    }
  }

  const useAI = mode === 'ai';
  const titleStr = title
    || `${useAI ? '[AI] ' : ''}Sides - Scenes ${sceneNumbers.slice(0, 5).join(', ')}${sceneNumbers.length > 5 ? '...' : ''}`;

  // Move all existing active sides to archived (history)
  await Sides.updateMany(
    { generatedBy: req.user._id, status: { $in: ['generating', 'ready'] } },
    { $set: { status: 'archived' } }
  );

  const sides = await Sides.create({
    callSheet: callSheetId || null,
    shootingSchedule: scheduleId || null,
    scriptVersion: targetVersionId,
    script: scriptId,
    title: titleStr,
    sceneNumbers,
    shootDayInfo,
    includeCallSheet: !!includeCallSheet,
    callSheetPages: callSheetPages || 'all',
    generatedBy: req.user._id,
    status: 'generating',
  });

  if (useAI) {
    extractSidesWithAI(sides._id, targetVersionId, sceneNumbers, aiProvider).catch(err => {
      console.error('Background AI sides extraction error:', err);
    });
  } else {
    extractSides(sides._id, targetVersionId, sceneNumbers).catch(err => {
      console.error('Background sides extraction error:', err);
    });
  }

  res.status(202).json({ sides, mode: useAI ? 'ai' : 'manual' });
}

async function listSides(req, res) {
  const { scriptId, callSheetId, page = 1, limit = 20, history } = req.query;
  const filter = {};
  if (scriptId) filter.script = scriptId;
  if (callSheetId) filter.callSheet = callSheetId;
  if (!scriptId && !callSheetId) filter.generatedBy = req.user._id;

  // By default show only active sides, ?history=true shows archived
  if (history === 'true') {
    filter.status = 'archived';
  } else {
    filter.status = { $in: ['generating', 'ready'] };
  }

  const sides = await Sides.find(filter)
    .populate('script', 'title')
    .populate('scriptVersion', 'versionNumber versionLabel')
    .populate('callSheet', 'title date')
    .populate('generatedBy', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Sides.countDocuments(filter);
  res.json({ sides, total, page: Number(page) });
}

async function getSides(req, res) {
  const sides = await Sides.findById(req.params.id)
    .populate('script', 'title')
    .populate('scriptVersion', 'versionNumber versionLabel')
    .populate('callSheet', 'title date scenes')
    .populate('generatedBy', 'name');

  if (!sides) return res.status(404).json({ error: 'Sides not found' });
  res.json({ sides });
}

async function downloadSides(req, res) {
  const sides = await Sides.findById(req.params.id).populate('callSheet');
  if (!sides) return res.status(404).json({ error: 'Sides not found' });
  if (sides.status !== 'ready') return res.status(400).json({ error: 'Sides not ready yet' });
  if (!sides.pdfUrl) return res.status(400).json({ error: 'PDF not available' });

  // Increment download count
  sides.downloadCount += 1;
  await sides.save();

  // Record analytics
  await AnalyticsEvent.create({
    script: sides.script,
    scriptVersion: sides.scriptVersion,
    user: req.user._id,
    eventType: 'download',
    metadata: {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sidesId: sides._id,
    },
  });

  // If the sides has an attached call sheet and includeCallSheet is true,
  // merge the call sheet PDF onto the front of the sides PDF on-the-fly using pdf-lib.
  // This matches the PDF view which shows: Call Sheet → Sides → Schedule.
  const shouldAttachCallSheet = sides.includeCallSheet && sides.callSheet?.pdfUrl;
  if (shouldAttachCallSheet) {
    try {
      const { PDFDocument } = require('pdf-lib');
      const [sidesBuf, csBuf] = await Promise.all([
        getFileBuffer(sides.pdfUrl),
        getFileBuffer(sides.callSheet.pdfUrl),
      ]);

      const merged = await PDFDocument.create();
      const csDoc = await PDFDocument.load(csBuf, { ignoreEncryption: true });
      const sidesDoc = await PDFDocument.load(sidesBuf, { ignoreEncryption: true });

      // Determine how many call sheet pages to include ("all" | "1" | "2" | ...)
      const csPageSetting = sides.callSheetPages || 'all';
      const totalCsPages = csDoc.getPageCount();
      const csPageCount = csPageSetting === 'all'
        ? totalCsPages
        : Math.min(parseInt(csPageSetting) || totalCsPages, totalCsPages);
      const csIndices = Array.from({ length: csPageCount }, (_, i) => i);

      // Copy call sheet pages first
      const csCopied = await merged.copyPages(csDoc, csIndices);
      for (const p of csCopied) merged.addPage(p);

      // Then all sides pages
      const sidesCopied = await merged.copyPages(sidesDoc, sidesDoc.getPageIndices());
      for (const p of sidesCopied) merged.addPage(p);

      const mergedBytes = await merged.save();
      const mergedBuffer = Buffer.from(mergedBytes);

      // Upload the merged PDF to a temporary key; return a signed URL for it
      const tempKey = `sides/${sides.script}/${sides._id}/download-${Date.now()}.pdf`;
      await uploadFile(tempKey, mergedBuffer, 'application/pdf');
      const url = await getDownloadUrl(tempKey);
      return res.json({ downloadUrl: url, downloadCount: sides.downloadCount });
    } catch (err) {
      console.warn('[sides] PDF merge failed, returning sides-only:', err.message);
      // Fall through to returning the plain sides PDF
    }
  }

  const url = await getDownloadUrl(sides.pdfUrl);
  res.json({ downloadUrl: url, downloadCount: sides.downloadCount });
}

async function deleteSides(req, res) {
  const sides = await Sides.findOneAndDelete({
    _id: req.params.id,
    generatedBy: req.user._id,
  });
  if (!sides) return res.status(404).json({ error: 'Sides not found' });
  res.json({ success: true });
}

/**
 * Format raw script text with standard screenplay indentation.
 * Matches the layout of original screenplay PDFs.
 */
function formatScreenplay(rawText) {
  const lines = rawText.split('\n');
  const out = [];
  let prevType = '';

  // Clean a line: remove trailing * (revision marks) for detection, keep for display
  function clean(s) { return s.replace(/\*+$/, '').trim(); }

  function isSceneHeading(s) {
    const c = clean(s);
    return /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i.test(c) ||
           /^\d+[A-Za-z]?[\s.\/)]+\s*(INT|EXT|INT\/EXT|I\/E)[.\s]/i.test(c);
  }

  function isTransition(s) { return /^[A-Z\s]+TO:\s*\*?$/.test(clean(s)); }

  function isCharacterName(s) {
    const c = clean(s);
    // ALL CAPS (with allowed chars), short, may have (V.O.) (O.S.) (CONT'D) etc.
    return /^[A-Z][A-Z\s.\-'\/()#]+$/.test(c) && c.length >= 2 && c.length < 45 &&
           !isSceneHeading(s) && !isTransition(s) &&
           !/^(CONTINUED|END OF|FADE|THE END|ACT )/.test(c);
  }

  function isParenthetical(s) {
    const c = clean(s);
    return c.startsWith('(');
  }

  function isContinued(s) {
    const c = clean(s);
    return /^\(CONTINUED\)|^CONTINUED:?/i.test(c);
  }

  function isPageHeader(s) {
    const c = clean(s);
    return /SCRIPT\s+\d|^\d+\.\s*$|DIRECTOR'S CUT/i.test(c);
  }

  // Dialogue lines in screenplays are typically ≤35 chars wide.
  // If a "dialogue" line is longer, it's likely action that should be flush left.
  function looksLikeAction(s) {
    const c = clean(s);
    // Starts with "The ", "He ", "She ", "They ", "A ", etc. — strong action indicators
    if (/^(The |He |She |They |A |An |As |It |We |But |And |Max |Frank |Mattie |Daisy |Chauncey )/i.test(c) && c.length > 40) return true;
    // Line is very long — likely action wrapping, not dialogue
    if (c.length > 55) return true;
    return false;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      out.push('');
      prevType = '';
      continue;
    }

    const escaped = escapeHtml(trimmed);

    // Skip page headers / continued markers
    if (isContinued(trimmed) || isPageHeader(trimmed)) {
      continue;
    }

    // Scene heading
    if (isSceneHeading(trimmed)) {
      out.push(escaped);
      prevType = 'heading';
      continue;
    }

    // Transition
    if (isTransition(trimmed)) {
      out.push(' '.repeat(55) + escaped);
      prevType = 'transition';
      continue;
    }

    // Character name
    if (isCharacterName(trimmed)) {
      out.push(' '.repeat(37) + escaped);
      prevType = 'character';
      continue;
    }

    // Parenthetical (after character or dialogue)
    if (isParenthetical(trimmed) && (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue')) {
      out.push(' '.repeat(31) + escaped);
      prevType = 'parenthetical';
      continue;
    }

    // Dialogue: after character name or parenthetical
    if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
      if (!isCharacterName(trimmed) && !isSceneHeading(trimmed) && !isTransition(trimmed) && !looksLikeAction(trimmed)) {
        out.push(' '.repeat(25) + escaped);
        prevType = 'dialogue';
        continue;
      }
    }

    // Action: flush left
    out.push(escaped);
    prevType = 'action';
  }

  return out.join('\n');
}

/**
 * Format raw script text as styled HTML divs with proper screenplay indentation.
 * Uses CSS padding so wrapped lines maintain their indentation.
 */
function formatScreenplayHtml(rawText) {
  const lines = rawText.split('\n');
  const out = [];
  let prevType = '';

  function clean(s) { return s.replace(/\*+$/, '').trim(); }

  function isSceneHeading(s) {
    const c = clean(s);
    return /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i.test(c) ||
           /^\d+[A-Za-z]?[\s.\/)]+\s*(INT|EXT|INT\/EXT|I\/E)[.\s]/i.test(c);
  }
  function isTransition(s) { return /^[A-Z\s]+TO:\s*\*?$/.test(clean(s)); }
  function isCharacterName(s) {
    const c = clean(s);
    return /^[A-Z][A-Z\s.\-'\/()#]+$/.test(c) && c.length >= 2 && c.length < 45 &&
           !isSceneHeading(s) && !isTransition(s) &&
           !/^(CONTINUED|END OF|FADE|THE END|ACT )/.test(c);
  }
  function isParenthetical(s) { return clean(s).startsWith('('); }
  function isContinued(s) { return /^\(CONTINUED\)|^CONTINUED:?/i.test(clean(s)); }
  function isPageHeader(s) { return /SCRIPT\s+\d|^\d+\.\s*$|DIRECTOR'S CUT/i.test(clean(s)); }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { out.push('<div style="height:18px"></div>'); prevType = ''; continue; }
    const escaped = escapeHtml(trimmed);
    if (isContinued(trimmed) || isPageHeader(trimmed)) continue;

    if (isSceneHeading(trimmed)) {
      out.push(`<div style="font-weight:700;text-transform:uppercase;margin-top:18px;margin-bottom:4px">${escaped}</div>`);
      prevType = 'heading'; continue;
    }
    if (isTransition(trimmed)) {
      out.push(`<div style="text-align:right;font-weight:600;text-transform:uppercase;margin:10px 0;padding-right:20px;color:#aaa">${escaped}</div>`);
      prevType = 'transition'; continue;
    }
    if (isCharacterName(trimmed) && prevType !== 'dialogue') {
      out.push(`<div style="padding-left:35%;margin-top:12px;font-weight:600;text-transform:uppercase">${escaped}</div>`);
      prevType = 'character'; continue;
    }
    if (isParenthetical(trimmed) && (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue')) {
      out.push(`<div style="padding-left:30%">${escaped}</div>`);
      prevType = 'parenthetical'; continue;
    }
    if (prevType === 'character' || prevType === 'parenthetical' || prevType === 'dialogue') {
      if (!isCharacterName(trimmed) && !isSceneHeading(trimmed) && !isTransition(trimmed)) {
        out.push(`<div style="padding-left:23%;padding-right:15%">${escaped}</div>`);
        prevType = 'dialogue'; continue;
      }
    }
    // Action
    out.push(`<div style="margin-top:4px;margin-bottom:2px">${escaped}</div>`);
    prevType = 'action';
  }

  return out.join('\n');
}

async function getSidesHtml(req, res) {
  const sides = await Sides.findById(req.params.id).populate('callSheet').populate('script', 'title');
  if (!sides) return res.status(404).json({ error: 'Sides not found' });
  const projectName = sides.script?.title || sides.title || 'CONFIDENTIAL';

  // Get call sheet PDF URL if includeCallSheet is true
  let callSheetPdfUrl = null;
  if (sides.includeCallSheet && sides.callSheet?.pdfUrl) {
    callSheetPdfUrl = await getDownloadUrl(sides.callSheet.pdfUrl, 3600);
  }

  // Get sides PDF URL for toggle
  let sidesPdfUrl = null;
  if (sides.pdfUrl) {
    sidesPdfUrl = await getDownloadUrl(sides.pdfUrl, 3600);
  }

  // Generate per-scene HTML — apply standard screenplay formatting with CSS padding
  const scenesHtml = (sides.scenes || []).map(s => {
    const formatted = formatScreenplayHtml(s.rawText || '');
    return `
    <div class="script-scene" data-scene="${escapeHtml(s.sceneNumber)}">
      <div class="page-content">${formatted}</div>
    </div>
    <hr style="border:none;border-top:2px solid rgba(255,140,0,0.15);margin:16px 0">`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sides - ${escapeHtml(sides.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d0d0d; color: #e0e0e0; min-height: 100vh; }
    .sides-header {
      background: #0d0d0d;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,140,0,0.12);
      text-align: center;
    }
    .sides-header h1 {
      font-size: 18px;
      color: #e0e0e0;
      margin: 0;
      font-weight: 800;
    }
    .sides-header .meta {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
    .script-container { max-width: 900px; margin: 0 auto; padding: 24px; }
    .script-scene { margin-bottom: 24px; background: #0d0d0d; border-radius: 8px; padding: 24px; border: 1px solid rgba(255,140,0,0.1); }
    .page-header { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,140,0,0.08); }
    .page-content { font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 20px; color: #e0e0e0; margin: 0; padding: 0; background: transparent; }
    .page-break { height: 1px; background: rgba(255,140,0,0.06); margin: 8px 0; }
    .print-btn {
      position: fixed; bottom: 20px; right: 20px;
      background: linear-gradient(135deg,#ff8c00,#ff5722); color: white; border: none;
      padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;
      cursor: pointer; z-index: 100; box-shadow: 0 4px 12px rgba(255,140,0,0.3);
    }
    .print-btn:hover { background: #e67e22; }
    .callsheet-embed { width:100%; height:600px; border:none; border-radius:8px; }
    .schedule-page { page-break-inside: avoid; background: #0d0d0d; border: 1px solid rgba(255,140,0,0.1); border-radius: 8px; padding: 16px; margin-bottom: 8px; }
    .watermark { display: none; }
    @media print {
      .sides-header { display: none; }
      .print-btn { display: none; }
      .no-print { display: none; }
      .script-scene { background: white !important; color: black !important; border: none !important; }
      .page-break { display: none; }
      body { background: white !important; color: black !important; }
      .schedule-page { background: white !important; color: black !important; border: 1px solid #ccc !important; page-break-after: always; }
      .schedule-page * { color: black !important; }
      .schedule-page div[style*="color:#ff8c00"] { color: black !important; font-weight: 700; }
      .callsheet-print-page { page-break-after: always; }
      .callsheet-print-page img { width: 100%; height: auto; }
      .callsheet-embed { display: none; }
      .watermark {
        display: block;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 80px;
        font-weight: 900;
        color: rgba(0, 0, 0, 0.06);
        letter-spacing: 8px;
        text-transform: uppercase;
        white-space: nowrap;
        pointer-events: none;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
    }
    @media screen {
      .callsheet-print-page { display: none; }
    }
  </style>
</head>
<body>
  <div class="sides-header">
    <h1>${escapeHtml(sides.title)}</h1>
    <div class="meta">Scenes: ${(sides.sceneNumbers || []).join(', ')} | ${sides.totalScenes || 0} scene(s)${sides.shootDayInfo?.length ? ` | ${sides.shootDayInfo.length} shoot day(s)` : ''}</div>
  </div>
  <!-- Section Navigation -->
  <div style="position:sticky;top:0;z-index:40;background:var(--bg-glass,#0d0d0d);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,140,0,0.1);padding:8px 0;display:flex;justify-content:center;gap:6px" class="no-print">
    ${callSheetPdfUrl ? `<button onclick="document.getElementById('section-callsheet').scrollIntoView({behavior:'smooth'})" style="padding:6px 16px;border-radius:8px;border:1px solid rgba(255,140,0,0.2);background:#0d0d0d;color:#e0e0e0;font-size:12px;font-weight:600;cursor:pointer">${'\uD83D\uDCCB'} Call Sheet</button>` : ''}
    ${sidesPdfUrl ? `<button onclick="document.getElementById('section-sides').scrollIntoView({behavior:'smooth'})" style="padding:6px 16px;border-radius:8px;border:1px solid rgba(255,140,0,0.2);background:#0d0d0d;color:#e0e0e0;font-size:12px;font-weight:600;cursor:pointer">${'\uD83C\uDFAC'} Scenes</button>` : ''}
    ${sides.shootDayInfo?.length ? `<button onclick="document.getElementById('section-schedule').scrollIntoView({behavior:'smooth'})" style="padding:6px 16px;border-radius:8px;border:1px solid rgba(255,140,0,0.2);background:#0d0d0d;color:#e0e0e0;font-size:12px;font-weight:600;cursor:pointer">${'\uD83D\uDCC5'} Schedule</button>` : ''}
  </div>
  <!-- PDF View (default) -->
  <div id="pdf-view" style="max-width:900px;margin:0 auto;padding:24px">
    ${callSheetPdfUrl ? '<div id="section-callsheet" style="scroll-margin-top:50px"></div>' : ''}
    <div id="combined-pdf-pages"></div>
    <p id="pdf-loading" style="color:#888;text-align:center;padding:40px">Loading PDFs...</p>
  </div>
  <script>
  (function(){
    var pdfs = [${callSheetPdfUrl ? `"${callSheetPdfUrl}"` : ''}${callSheetPdfUrl && sidesPdfUrl ? ',' : ''}${sidesPdfUrl ? `"${sidesPdfUrl}"` : ''}];
    if (!pdfs.length) { document.getElementById('pdf-loading').textContent = 'No PDFs available.'; return; }
    var container = document.getElementById('combined-pdf-pages');
    var loaded = 0;
    function loadPdf(url, startIndex) {
      if (typeof pdfjsLib === 'undefined') {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = function() {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          loadPdf(url, startIndex);
        };
        document.head.appendChild(s);
        return;
      }
      pdfjsLib.getDocument(url).promise.then(function(pdf) {
        var promises = [];
        for (var i = 1; i <= pdf.numPages; i++) {
          (function(pageNum, idx) {
            promises.push(pdf.getPage(pageNum).then(function(page) {
              var viewport = page.getViewport({ scale: 1.5 });
              var canvas = document.createElement('canvas');
              canvas.width = viewport.width; canvas.height = viewport.height;
              return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function() {
                return { idx: idx, canvas: canvas };
              });
            }));
          })(i, startIndex + i - 1);
        }
        Promise.all(promises).then(function(results) {
          results.sort(function(a,b){ return a.idx - b.idx; });
          results.forEach(function(r) {
            var div = document.createElement('div');
            div.style.cssText = 'margin-bottom:8px;border:1px solid rgba(255,140,0,0.1);border-radius:4px;overflow:hidden';
            var img = document.createElement('img');
            img.src = r.canvas.toDataURL('image/png');
            img.style.width = '100%';
            div.appendChild(img);
            div.dataset.order = r.idx;
            // Insert in order
            var existing = container.querySelectorAll('[data-order]');
            var inserted = false;
            for (var j = 0; j < existing.length; j++) {
              if (parseInt(existing[j].dataset.order) > r.idx) { container.insertBefore(div, existing[j]); inserted = true; break; }
            }
            if (!inserted) container.appendChild(div);
          });
          loaded++;
          if (loaded >= pdfs.length) document.getElementById('pdf-loading').style.display = 'none';
        });
        return pdf.numPages;
      });
    }
    var pdfMeta = [
      ${callSheetPdfUrl ? `{ url: "${callSheetPdfUrl}", section: "callsheet" }` : ''}${callSheetPdfUrl && sidesPdfUrl ? ',' : ''}
      ${sidesPdfUrl ? `{ url: "${sidesPdfUrl}", section: "sides" }` : ''}
    ].filter(Boolean);
    var hasSchedule = ${sides.shootDayInfo?.length ? 'true' : 'false'};
    var scheduleStartPage = ${sides.scheduleStartPage || 0};

    var offset = 0;
    var sectionInfo = {};
    pdfMeta.forEach(function(meta) {
      sectionInfo[meta.section] = { offset: offset, totalPages: 0 };
      loadPdf(meta.url, offset, meta.section);
      offset += 100;
    });

    // Track page counts per PDF
    var origLoadPdf = loadPdf;
    // After all loaded, insert section markers
    var checkInterval = setInterval(function() {
      if (loaded >= pdfMeta.length) {
        clearInterval(checkInterval);
        var markerStyle = 'scroll-margin-top:50px;padding:12px 0;text-align:center;font-size:14px;font-weight:700;color:#e67e22;border-bottom:2px solid rgba(255,140,0,0.2);margin-bottom:8px';

        // Call Sheet marker
        if (sectionInfo.callsheet) {
          var csTarget = container.querySelector('[data-order="0"]');
          if (csTarget) {
            var m = document.createElement('div');
            m.id = 'section-callsheet';
            m.style.cssText = markerStyle;
            m.textContent = '\uD83D\uDCCB Call Sheet';
            csTarget.parentNode.insertBefore(m, csTarget);
          }
        }

        // Scenes marker (start of sides PDF)
        if (sectionInfo.sides) {
          var sidesStart = sectionInfo.sides.offset;
          var sidesTarget = container.querySelector('[data-order="' + sidesStart + '"]');
          if (sidesTarget) {
            var m2 = document.createElement('div');
            m2.id = 'section-sides';
            m2.style.cssText = markerStyle;
            m2.textContent = '\uD83C\uDFAC Scenes';
            sidesTarget.parentNode.insertBefore(m2, sidesTarget);
          }

          // Schedule marker at exact page
          if (hasSchedule && scheduleStartPage > 0) {
            var schedOrder = sidesStart + scheduleStartPage - 1;
            var schedTarget = container.querySelector('[data-order="' + schedOrder + '"]');
            if (schedTarget) {
              var m3 = document.createElement('div');
              m3.id = 'section-schedule';
              m3.style.cssText = markerStyle;
              m3.textContent = '\uD83D\uDCC5 Schedule';
              schedTarget.parentNode.insertBefore(m3, schedTarget);
            }
          }
        }
      }
    }, 500);
  })();
  </script>

  <!-- HTML View -->
  <div id="html-view" class="script-container" style="display:none">
    <!-- 1. CALL SHEET -->
    ${callSheetPdfUrl ? `
    <div style="margin-bottom:24px">
      <h2 style="font-size:16px;font-weight:700;margin-bottom:4px;color:#ff8c00;font-family:-apple-system,sans-serif" class="no-print">${'\uD83D\uDCCB'} Call Sheet</h2>
      <div style="font-size:11px;color:#888;margin-bottom:12px" class="no-print">${sides.callSheetPages === 'all' ? 'All pages included' : `First ${sides.callSheetPages} page(s) included`}</div>
      <div style="background:#1a1a1a;border:1px solid rgba(255,140,0,0.15);border-radius:12px;overflow:hidden" class="no-print">
        <iframe src="${callSheetPdfUrl}" class="callsheet-embed"></iframe>
      </div>
      <div id="callsheet-print-pages"></div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
    (function(){
      const url = "${callSheetPdfUrl}";
      const pageSetting = "${sides.callSheetPages || 'all'}";
      const container = document.getElementById('callsheet-print-pages');
      if (!container || !url) return;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfjsLib.getDocument(url).promise.then(function(pdf) {
        var maxPages = pageSetting === 'all' ? pdf.numPages : Math.min(parseInt(pageSetting) || pdf.numPages, pdf.numPages);
        for (let i = 1; i <= maxPages; i++) {
          (function(pageNum) {
            pdf.getPage(pageNum).then(function(page) {
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width; canvas.height = viewport.height;
              page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function() {
                const div = document.createElement('div');
                div.className = 'callsheet-print-page';
                div.dataset.page = pageNum;
                const img = document.createElement('img');
                img.src = canvas.toDataURL('image/png');
                img.style.width = '100%';
                div.appendChild(img);
                const pages = container.querySelectorAll('.callsheet-print-page');
                let ins = false;
                for (let p = 0; p < pages.length; p++) { if (parseInt(pages[p].dataset.page) > pageNum) { container.insertBefore(div, pages[p]); ins = true; break; } }
                if (!ins) container.appendChild(div);
              });
            });
          })(i);
        }
      });
    })();
    </script>
    <hr style="border:none;border-top:1px solid rgba(255,140,0,0.1);margin:20px 0" class="no-print">
    ` : ''}

    <!-- 2. SIDES (Script Scenes) -->
    ${scenesHtml}

    <!-- 3. SHOOTING SCHEDULE -->
    ${sides.shootDayInfo?.length ? `
    <hr style="border:none;border-top:1px solid rgba(255,140,0,0.1);margin:20px 0">
    ${sides.shootDayInfo.map(day => {
      const sections = [
        { key: 'cast', label: 'Cast Members' }, { key: 'props', label: 'Props' },
        { key: 'backgroundActors', label: 'Background Actors' }, { key: 'setDressing', label: 'Set Dressing' },
        { key: 'cgiCharacters', label: 'CGI Characters' }, { key: 'wardrobe', label: 'Wardrobe' },
        { key: 'makeupHair', label: 'Makeup/Hair' }, { key: 'vehicles', label: 'Vehicles' },
        { key: 'grip', label: 'Grip' }, { key: 'electric', label: 'Electric' },
        { key: 'additionalLabor', label: 'Additional Labor' }, { key: 'standby', label: "Standby's & Riggers" },
        { key: 'visualEffects', label: 'Visual Effects' }, { key: 'specialEffects', label: 'Special Effects' },
        { key: 'stunts', label: 'Stunts' }, { key: 'animals', label: 'Animals' },
        { key: 'music', label: 'Music' }, { key: 'sound', label: 'Sound' },
      ];

      // Rebuild each scene as plain text — exact same format as original PDF
      // Original format: no indentation, section labels flush left, items flush left below
      const scenesHtmlParts = (day.scenes || []).map(s => {
        // Scene heading as pre-formatted text
        const headingLines = [];
        headingLines.push(esc(s.sceneNumber));
        headingLines.push(esc((s.intExt || '') + (s.location || '') + (s.timeOfDay || '') + (s.pages ? s.pages + 'Scene #' : '')));
        if (s.synopsis) headingLines.push(esc(s.synopsis));
        const headingPre = headingLines.join('\n');

        // Sections as 2-column grid
        const sectionBlocks = sections
          .filter(sec => s[sec.key]?.length > 0)
          .map(sec => `<div style="width:48%;display:inline-block;vertical-align:top;margin-bottom:10px"><div style="font-weight:700;text-decoration:underline;margin-bottom:3px;color:#e0e0e0">${sec.label}</div>${s[sec.key].map(item => `<div style="color:#ccc">${esc(item)}</div>`).join('')}</div>`)
          .join('');

        const notesHtml = s.notes ? `<div style="margin-top:8px;color:#888"><span style="font-weight:700;text-decoration:underline">Notes</span><div>${esc(s.notes)}</div></div>` : '';

        return `<div style="padding:12px 0;border-bottom:1px solid rgba(255,140,0,0.06)">
          <pre class="page-content" style="margin-bottom:8px">${headingPre}</pre>
          <div style="font-family:'Courier New',Courier,monospace;font-size:12px;padding:0 2px">${sectionBlocks}</div>
          ${notesHtml}
        </div>`;
      }).join('');

      // scenesHtmlParts rendered as HTML blocks, day header is in the styled HTML above

      return `
      <div class="schedule-page" style="padding:0;overflow:hidden">
        <div style="padding:12px 18px;background:#e67e22;display:flex;justify-content:space-between;align-items:center">
          <strong style="color:white;font-size:16px">${day.isExtraDay ? 'Additional Schedule \u2014 ' : ''}Shoot Day # ${day.dayNumber}</strong>
          <span style="color:rgba(255,255,255,0.85);font-size:12px">${esc(day.date || '')}</span>
        </div>
        <div style="padding:10px 18px;display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:#e0e0e0;border-bottom:1px solid rgba(255,140,0,0.08)">
          ${day.callTime ? `<div><span style="color:#888;font-size:10px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px">Call Time</span>${esc(day.callTime)}</div>` : ''}
          ${day.wrapTime ? `<div><span style="color:#888;font-size:10px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px">Wrap Time</span>${esc(day.wrapTime)}</div>` : ''}
          ${day.location ? `<div><span style="color:#888;font-size:10px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px">Location</span>${esc(day.location)}</div>` : ''}
          <div><span style="color:#888;font-size:10px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px">Scenes</span>${day.scenes?.length || 0}</div>
          ${day.scheduleTitle ? `<div><span style="color:#888;font-size:10px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:2px">From</span>${esc(day.scheduleTitle)}</div>` : ''}
        </div>
        <div style="padding:8px 18px">${scenesHtmlParts}</div>
        ${day.notes ? `<div style="padding:10px 18px;font-size:12px;color:#aaa;border-top:1px solid rgba(255,140,0,0.08)"><strong style="color:#888">Day Notes:</strong> ${esc(day.notes)}</div>` : ''}
      </div>`;
    }).join('')}
    ` : ''}

    <!-- Call sheet already rendered above -->
  </div>
  <div class="watermark">${escapeHtml(projectName)}</div>
  <!-- print button removed -->
</body>
</html>`;

  // Unify all backgrounds to single dark color
  const unified = html
    .replace(/background:#0f3460/g, 'background:#0d0d0d')
    .replace(/background:#16213e/g, 'background:#0d0d0d')
    .replace(/background:#161638/g, 'background:#0d0d0d')
    .replace(/background:#1a1a1a/g, 'background:#0d0d0d')
    .replace(/background:#1a1a40/g, 'background:#0d0d0d')
    .replace(/background:#242424/g, 'background:#0d0d0d');

  res.setHeader('Content-Type', 'text/html');
  res.send(unified);
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const esc = escapeHtml;

// ====== SCENE EXTRACTION ======

async function getScriptScenes(req, res) {
  const { versionId } = req.params;

  const version = await ScriptVersion.findById(versionId);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Use the PDF-based scene map (pdfjs) for reliable scene detection.
  // The text-based buildSceneMap and per-page sceneNumbers both fail on scripts where
  // scene numbers are on separate lines from the INT./EXT. heading.
  const { buildPdfSceneMap } = require('../services/sides.service');
  const { getFileBuffer, getScriptPdfKey } = require('../services/storage.service');

  try {
    // Load the script PDF and build the scene map via pdfjs
    const script = await Script.findById(version.script);
    const pdfBuffer = await getFileBuffer(getScriptPdfKey(script._id, versionId));
    const pdfSceneMap = await buildPdfSceneMap(pdfBuffer);

    // Dedupe by scene number (keep first occurrence)
    const seen = new Set();
    const scenes = [];
    for (let i = 0; i < pdfSceneMap.length; i++) {
      const s = pdfSceneMap[i];
      if (seen.has(s.sceneNumber)) continue;
      seen.add(s.sceneNumber);

      // Find next different scene for pageEnd
      let nextPage = s.pageNumber;
      for (let j = i + 1; j < pdfSceneMap.length; j++) {
        if (pdfSceneMap[j].sceneNumber !== s.sceneNumber) {
          nextPage = pdfSceneMap[j].pageNumber;
          break;
        }
      }

      // Parse heading for location / time of day
      const heading = s.heading || '';
      const match = heading.match(
        /^(?:\d+[A-Za-z]?[\s.\/)]+\s*)?(INT|EXT|INT\/EXT|I\/E)[.\s]+(.+?)(?:\s*[-–—]\s*(.+))?$/i
      );

      scenes.push({
        sceneNumber: s.sceneNumber,
        heading: heading.replace(/\s+\d+[A-Za-z]?\s*$/, '').trim() || `Scene ${s.sceneNumber}`,
        intExt: match ? match[1].toUpperCase() : '',
        location: match ? match[2].trim() : '',
        timeOfDay: match && match[3] ? match[3].trim() : '',
        pageStart: s.pageNumber,
        pageEnd: nextPage,
      });
    }

    res.json({ versionId, totalScenes: scenes.length, scenes });
  } catch (err) {
    console.error('getScriptScenes PDF-based detection failed:', err.message);
    // Fallback: return pages as "scenes" so the UI isn't completely empty
    const allPages = await ScriptPage.find({ scriptVersion: versionId })
      .select('pageNumber sceneNumbers rawText')
      .sort({ pageNumber: 1 });
    const scenes = allPages.map(p => ({
      sceneNumber: p.sceneNumbers?.[0] || `P${p.pageNumber}`,
      heading: `Page ${p.pageNumber}`,
      intExt: '', location: '', timeOfDay: '',
      pageStart: p.pageNumber, pageEnd: p.pageNumber,
    }));
    res.json({ versionId, totalScenes: scenes.length, scenes });
  }
}

module.exports = {
  uploadCallSheet, listCallSheets, getCallSheet, updateCallSheet, deleteCallSheet,
  viewCallSheetHtml, downloadCallSheet,
  generateSides, listSides, getSides, downloadSides, deleteSides, getSidesHtml,
  getScriptScenes,
};
