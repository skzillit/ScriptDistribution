const mongoose = require('mongoose');
const BreakdownCategory = require('../models/BreakdownCategory');
const BreakdownElement = require('../models/BreakdownElement');
const BreakdownTag = require('../models/BreakdownTag');
const ScriptPage = require('../models/ScriptPage');

const DEFAULT_CATEGORIES = [
  { name: 'Cast Members', slug: 'cast', color: '#EF4444', sort_order: 1 },
  { name: 'Extras/Silent Bits', slug: 'extras', color: '#EAB308', sort_order: 2 },
  { name: 'Stunts', slug: 'stunts', color: '#F97316', sort_order: 3 },
  { name: 'Special Effects', slug: 'sfx', color: '#3B82F6', sort_order: 4 },
  { name: 'Props', slug: 'props', color: '#8B5CF6', sort_order: 5 },
  { name: 'Vehicles', slug: 'vehicles', color: '#EC4899', sort_order: 6 },
  { name: 'Animals', slug: 'animals', color: '#F472B6', sort_order: 7 },
  { name: 'Wardrobe', slug: 'wardrobe', color: '#FB923C', sort_order: 8 },
  { name: 'Makeup/Hair', slug: 'makeup_hair', color: '#A855F7', sort_order: 9 },
  { name: 'Sound/Music', slug: 'sound_music', color: '#92400E', sort_order: 10 },
  { name: 'Set Dressing', slug: 'set_dressing', color: '#22C55E', sort_order: 11 },
  { name: 'Special Equipment', slug: 'special_equipment', color: '#64748B', sort_order: 12 },
  { name: 'Visual Effects', slug: 'vfx', color: '#06B6D4', sort_order: 13 },
  { name: 'Security', slug: 'security', color: '#6B7280', sort_order: 14 },
  { name: 'Miscellaneous', slug: 'misc', color: '#9CA3AF', sort_order: 15 },
];

const VALID_CATEGORIES = DEFAULT_CATEGORIES.map(c => c.slug);

async function seedDefaultCategories(projectId) {
  const existing = await BreakdownCategory.countDocuments({ project_id: projectId });
  if (existing > 0) {
    return BreakdownCategory.find({ project_id: projectId }).sort({ sort_order: 1 });
  }
  const docs = DEFAULT_CATEGORIES.map(cat => ({ ...cat, project_id: projectId, is_default: true }));
  await BreakdownCategory.insertMany(docs);
  return BreakdownCategory.find({ project_id: projectId }).sort({ sort_order: 1 });
}

async function getSceneScriptText(sceneId) {
  const page = await ScriptPage.findById(sceneId);
  if (!page) return null;
  // Convert rawText to array of lines (script_text format)
  // Store both raw and trimmed for consistent positioning
  const rawLines = (page.rawText || '').split('\n');
  const trimmedLines = rawLines.map(l => l.trim());
  return { page, lines: trimmedLines, rawLines };
}

async function getBreakdownSheet(projectId, sceneId) {
  const result = await getSceneScriptText(sceneId);
  if (!result) throw new Error('Scene not found');

  const categories = await seedDefaultCategories(projectId);

  const tags = await BreakdownTag.find({
    scene_id: sceneId,
    status: { $ne: 'rejected' },
  }).populate('element_id');

  const tagsByCategory = {};
  for (const tag of tags) {
    if (!tag.element_id) continue;
    const slug = tag.element_id.category_slug;
    if (!tagsByCategory[slug]) tagsByCategory[slug] = [];

    // Find category color
    const cat = categories.find(c => c.slug === slug);

    tagsByCategory[slug].push({
      _id: tag._id,
      element_id: tag.element_id._id,
      element_name: tag.element_id.name,
      element_description: tag.element_id.description,
      category_slug: slug,
      category_color: cat?.color || '#888',
      line_index: tag.line_index,
      char_start: tag.char_start,
      char_end: tag.char_end,
      tagged_text: tag.tagged_text,
      status: tag.status,
      ai_generated: tag.ai_generated,
      ai_confidence: tag.ai_confidence,
    });
  }

  const sheet = categories
    .filter(cat => cat.is_active)
    .map(cat => ({
      category: { _id: cat._id, name: cat.name, slug: cat.slug, color: cat.color, sort_order: cat.sort_order },
      tags: tagsByCategory[cat.slug] || [],
    }));

  // Flatten all tags for the viewer
  const allTags = [];
  for (const group of sheet) {
    for (const tag of group.tags) {
      allTags.push(tag);
    }
  }

  return {
    scene: {
      _id: result.page._id,
      pageNumber: result.page.pageNumber,
      sceneNumbers: result.page.sceneNumbers,
      script_text: result.lines,
    },
    categories: sheet,
    allTags,
  };
}

async function tagTextSelection(projectId, sceneId, payload) {
  const { line_index, char_start, char_end, tagged_text, category_slug, element_name } = payload;

  let element = await BreakdownElement.findOne({
    project_id: projectId,
    category_slug,
    name: element_name,
  }).collation({ locale: 'en', strength: 2 });

  if (!element) {
    element = await BreakdownElement.create({
      project_id: projectId,
      category_slug,
      name: element_name,
    });
  }

  // Create the primary tag for the selected text
  const tag = await BreakdownTag.create({
    project_id: projectId,
    scene_id: sceneId,
    element_id: element._id,
    line_index,
    char_start,
    char_end,
    tagged_text,
    status: 'confirmed',
  });

  // Auto-detect and tag all matching occurrences across the entire script
  let autoTagCount = 0;
  try {
    const Script = require('../models/Script');
    const script = await Script.findById(projectId).populate('currentVersion');
    if (script?.currentVersion) {
      const versionId = script.currentVersion._id || script.currentVersion;
      const allPages = await ScriptPage.find({ scriptVersion: versionId }).sort({ pageNumber: 1 });

      // Build word-boundary regex for the tagged text (case-insensitive)
      const escaped = tagged_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

      // Get all existing tags for this project to avoid duplicates
      const existingTags = await BreakdownTag.find({
        project_id: projectId,
        element_id: element._id,
        status: { $ne: 'rejected' },
      }).select('scene_id line_index char_start char_end');

      const existingSet = new Set(
        existingTags.map(t => `${t.scene_id}_${t.line_index}_${t.char_start}_${t.char_end}`)
      );

      // Also add the just-created primary tag to the set
      existingSet.add(`${sceneId}_${line_index}_${char_start}_${char_end}`);

      const newTags = [];
      for (const page of allPages) {
        const lines = (page.rawText || '').split('\n').map(l => l.trim());
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(line)) !== null) {
            const cs = match.index;
            const ce = cs + match[0].length;
            const key = `${page._id}_${li}_${cs}_${ce}`;
            if (existingSet.has(key)) continue;
            existingSet.add(key);
            newTags.push({
              project_id: projectId,
              scene_id: page._id,
              element_id: element._id,
              line_index: li,
              char_start: cs,
              char_end: ce,
              tagged_text: match[0],
              status: 'confirmed',
            });
          }
        }
      }

      if (newTags.length > 0) {
        await BreakdownTag.insertMany(newTags);
        autoTagCount = newTags.length;
      }
    }
  } catch (err) {
    console.error('Auto-detect tagging error:', err.message);
    // Non-fatal — primary tag was already created
  }

  return { tag, element, autoTagCount };
}

async function removeTag(tagId) {
  const tag = await BreakdownTag.findById(tagId);
  if (!tag) throw new Error('Tag not found');
  await BreakdownTag.deleteOne({ _id: tagId });
  return tag;
}

async function getProjectElements(projectId, filters = {}) {
  const match = { project_id: new mongoose.Types.ObjectId(projectId) };
  if (filters.category_slug) match.category_slug = filters.category_slug;
  if (filters.search) match.name = { $regex: filters.search, $options: 'i' };

  const elements = await BreakdownElement.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'breakdowntags',
        let: { elemId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$element_id', '$$elemId'] }, { $ne: ['$status', 'rejected'] }] } } },
          { $group: { _id: '$scene_id' } },
        ],
        as: 'scene_refs',
      },
    },
    { $addFields: { scene_count: { $size: '$scene_refs' } } },
    { $project: { scene_refs: 0 } },
    { $sort: { category_slug: 1, name: 1 } },
  ]);

  return elements;
}

async function bulkAcceptRejectSuggestions(projectId, sceneId, decisions) {
  const results = { confirmed: 0, rejected: 0 };
  for (const { tagId, action } of decisions) {
    if (action !== 'confirm' && action !== 'reject') continue;
    const status = action === 'confirm' ? 'confirmed' : 'rejected';
    const result = await BreakdownTag.updateOne(
      { _id: new mongoose.Types.ObjectId(tagId), scene_id: new mongoose.Types.ObjectId(sceneId), project_id: new mongoose.Types.ObjectId(projectId) },
      { $set: { status } }
    );
    if (result.modifiedCount > 0) results[status] += 1;
  }
  return results;
}

async function aiAnalyzeScene(projectId, sceneId) {
  const result = await getSceneScriptText(sceneId);
  if (!result) throw new Error('Scene not found');
  if (result.lines.length === 0) return { suggestions: [], message: 'No script text' };

  await seedDefaultCategories(projectId);

  const { callClaude } = require('./ai.service');
  const config = require('../config/env');

  // Use trimmed lines so AI char positions match what the frontend displays
  const numberedText = result.lines.map((line, i) => `[${i}] ${line}`).join('\n');

  const systemPrompt = `You are a professional script breakdown assistant. Analyze screenplay text and identify all production breakdown elements.

For each element found, return:
- line_index: the 0-based index into the script_text array
- char_start: character offset where the element text starts within that line
- char_end: character offset where the element text ends (exclusive)
- tagged_text: the exact text from the script
- category_slug: one of: ${VALID_CATEGORIES.join(', ')}
- element_name: a clean, normalized name (e.g., "Red Corvette" not "red corvette in the driveway")
- confidence: 0-1 confidence score

Rules:
- Characters speaking dialogue should be tagged as "cast"
- Background/atmosphere people as "extras"
- Only tag elements that would physically need to be arranged for the shoot
- Be precise with text positions
- Do not tag scene headings or transitions
- Return ONLY a JSON array, no markdown`;

  const userPrompt = `Scene ${result.page.sceneNumbers?.[0] || result.page.pageNumber}:

Script text (each line prefixed with [line_index]):
${numberedText}

Identify all breakdown elements. Return a JSON array.`;

  let responseText;
  try {
    responseText = await callClaude(systemPrompt, userPrompt);
  } catch (err) {
    return { suggestions: [], message: `AI error: ${err.message}` };
  }

  // Parse JSON
  let suggestions;
  try {
    let jsonStr = responseText.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
    }
    suggestions = JSON.parse(jsonStr);
  } catch (e) {
    return { suggestions: [], message: `Failed to parse AI response: ${e.message}` };
  }

  if (!Array.isArray(suggestions)) return { suggestions: [], message: 'AI returned invalid format' };

  const created = [];
  for (const s of suggestions) {
    if (!VALID_CATEGORIES.includes(s.category_slug)) continue;
    if (s.line_index < 0 || s.line_index >= result.lines.length) continue;
    const line = result.lines[s.line_index];
    if (s.char_start < 0 || s.char_end > line.length || s.char_start >= s.char_end) continue;

    let element = await BreakdownElement.findOne({
      project_id: projectId, category_slug: s.category_slug, name: s.element_name,
    }).collation({ locale: 'en', strength: 2 });

    if (!element) {
      element = await BreakdownElement.create({
        project_id: projectId, category_slug: s.category_slug, name: s.element_name, ai_generated: true,
      });
    }

    const tag = await BreakdownTag.create({
      project_id: projectId, scene_id: sceneId, element_id: element._id,
      line_index: s.line_index, char_start: s.char_start, char_end: s.char_end,
      tagged_text: s.tagged_text || line.substring(s.char_start, s.char_end),
      status: 'suggested', ai_generated: true, ai_confidence: s.confidence || 0.8,
    });

    const cat = DEFAULT_CATEGORIES.find(c => c.slug === s.category_slug);
    created.push({
      tag: { ...tag.toObject(), category_color: cat?.color || '#888', category_slug: s.category_slug },
      element: element.toObject(),
    });
  }

  return { suggestions: created, count: created.length };
}

module.exports = {
  seedDefaultCategories, getBreakdownSheet, tagTextSelection, removeTag,
  getProjectElements, bulkAcceptRejectSuggestions, aiAnalyzeScene,
  DEFAULT_CATEGORIES, VALID_CATEGORIES,
};
