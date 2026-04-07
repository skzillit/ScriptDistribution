const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/env');
const { BREAKDOWN_CATEGORIES } = require('../utils/constants');

function getClaudeClient() {
  return new Anthropic({ apiKey: config.ai.anthropicApiKey });
}

async function callClaude(systemPrompt, userPrompt) {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return response.content[0].text;
}

async function callOllama(systemPrompt, userPrompt) {
  const url = `${config.ai.ollamaBaseUrl}/api/generate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ai.ollamaModel,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false,
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

function getBreakdownSystemPrompt() {
  return `You are a script breakdown specialist. Analyze screenplay text and return ONLY valid JSON — no markdown, no code blocks, no explanation.

Categories: ${Object.entries(BREAKDOWN_CATEGORIES).map(([key, val]) => `${key}(${val.label})`).join(', ')}

IMPORTANT: Return compact JSON. For elements, list each unique element ONCE with the scenes it appears in (not every single occurrence). Keep it concise.`;
}

function getBreakdownUserPrompt(scriptText, pageMarkers) {
  return `Analyze this screenplay. ${pageMarkers ? 'Page markers: [PAGE X].' : ''}

${scriptText}

Return this JSON (no markdown wrapping):
{"elements":[{"category":"CAST_MEMBER","name":"Name","description":"Brief desc","scenes":["1","2"]}],"scenes":[{"sceneNumber":"1","heading":"INT. PLACE - TIME","intExt":"INT","location":"PLACE","timeOfDay":"TIME","pageStart":1,"pageEnd":1,"synopsis":"Brief","cast":["Name"]}],"summary":{"totalScenes":0,"totalPages":0,"castCount":0,"locationCount":0,"estimatedShootDays":0}}`;
}

async function analyzeScript(scriptText, provider) {
  const selectedProvider = provider || config.ai.provider;
  const systemPrompt = getBreakdownSystemPrompt();
  const userPrompt = getBreakdownUserPrompt(scriptText, true);

  let responseText;
  if (selectedProvider === 'claude') {
    responseText = await callClaude(systemPrompt, userPrompt);
  } else if (selectedProvider === 'local' || selectedProvider === 'ollama') {
    responseText = await callOllama(systemPrompt, userPrompt);
  } else {
    throw new Error(`Unknown AI provider: ${selectedProvider}`);
  }

  // Parse JSON from response — handle various wrapping formats
  let result;
  let jsonStr = responseText.trim();

  // Remove ```json ... ``` wrapping
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Extract the JSON object between first { and last }
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  // Try parsing, then try repairing if it fails
  try {
    result = JSON.parse(jsonStr);
  } catch (firstErr) {
    try {
      result = JSON.parse(repairJson(jsonStr));
    } catch (secondErr) {
      // Last resort: try to extract just the elements and scenes arrays
      try {
        result = extractPartialResult(jsonStr);
      } catch (thirdErr) {
        console.error('AI response (first 500 chars):', responseText.substring(0, 500));
        throw new Error(`Failed to parse AI response as JSON: ${firstErr.message}`);
      }
    }
  }

  return { result, provider: selectedProvider };
}

/**
 * Attempt to fix common JSON issues from LLM output.
 */
function repairJson(str) {
  let fixed = str;
  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  // Fix single quotes to double quotes (but not inside strings)
  // Remove comments
  fixed = fixed.replace(/\/\/[^\n]*/g, '');
  // Fix unquoted keys (simple cases)
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
  // Remove control characters
  fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : '');
  // Fix truncated JSON — close open brackets/braces
  let openBraces = 0, openBrackets = 0;
  let inString = false, escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }
  // Remove any trailing comma before closing
  fixed = fixed.replace(/,\s*$/, '');
  while (openBrackets > 0) { fixed += ']'; openBrackets--; }
  while (openBraces > 0) { fixed += '}'; openBraces--; }
  return fixed;
}

/**
 * If full JSON parsing fails, try to extract elements and scenes arrays separately.
 */
function extractPartialResult(str) {
  const result = { elements: [], scenes: [], summary: {} };

  // Try extracting "elements" array
  const elemMatch = str.match(/"elements"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"scenes")/);
  if (elemMatch) {
    try { result.elements = JSON.parse(repairJson(elemMatch[1])); } catch (_) {}
  }

  // Try extracting "scenes" array
  const scenesMatch = str.match(/"scenes"\s*:\s*(\[[\s\S]*?\])\s*(?:,\s*"summary")/);
  if (scenesMatch) {
    try { result.scenes = JSON.parse(repairJson(scenesMatch[1])); } catch (_) {}
  }

  // Try extracting "summary" object
  const summaryMatch = str.match(/"summary"\s*:\s*(\{[\s\S]*?\})\s*\}?\s*$/);
  if (summaryMatch) {
    try { result.summary = JSON.parse(repairJson(summaryMatch[1])); } catch (_) {}
  }

  if (result.elements.length === 0 && result.scenes.length === 0) {
    throw new Error('Could not extract any data from AI response');
  }

  return result;
}

module.exports = { analyzeScript, callClaude, callOllama };
