/**
 * Parse shooting schedule PDF text.
 * Primary format: Movie Magic Scheduling output.
 *
 * Pattern per scene:
 *   Line 1: Scene number (e.g. "25", "42PT", "57APT", "8A")
 *   Line 2: "[D|N]<count><INT|EXT>Location<Day|Night><pages>Scene #"
 *            e.g. "N3INTMagician's Storage WarehouseNight2/8Scene #"
 *   Line 3: Scene description / synopsis
 *   Lines after: "Cast Members", props, notes, etc.
 *
 * Day headers: "Shoot Day # 1 Monday, November 28, 2016"
 */

// Movie Magic scene info line:
// Starts with optional D/N + digit(s), then INT/EXT (no space), then location,
// then Day/Night/Dawn/Dusk, then page count, then "Scene #" at end
const MM_INFO_RE = /^([DN]?\d*)\s*(INT|EXT|INT\/EXT|I\/E|Green)?\s*(.+?)(Day|Night|Dawn|Dusk|Morning|Evening|Sunset|Sunrise)\s*(\d+(?:\s*\d\/\d|\s*\/\d)?\s*(?:\d\/\d)?)\s*(?:Scene\s*#?)?\s*$/i;

// Fallback: standard scene heading
const STD_HEADING_RE = /^(INT|EXT|INT\/EXT|I\/E)[.\s]+(.+?)(?:\s*[-–]\s*(.+))?$/i;

// Movie Magic scene number: digits + optional letter suffix (A, B, PT, APT etc.)
const SCENE_NUM_RE = /^(\d{1,4}[A-Za-z]{0,3})\s*$/;

// Day header
const DAY_HEADER_RE = /shoot\s*day\s*#?\s*(\d+)\s*(.*)/i;

// Skip lines
const SKIP_RE = /^(Shooting Schedule|Printed on|Page \d|\(Continued|SUBJECT TO CHANGE|\*\*)/i;

function parseShootingSchedule(rawText) {
  const lines = rawText.split('\n');
  const days = [];
  let currentDay = null;
  let dayCount = 0;
  let currentScene = null;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || SKIP_RE.test(line)) continue;

    // ===== Day Header =====
    const dayMatch = line.match(DAY_HEADER_RE);
    if (dayMatch) {
      dayCount++;
      currentDay = {
        dayNumber: parseInt(dayMatch[1]) || dayCount,
        date: dayMatch[2]?.trim() || '',
        scenes: [],
        location: '',
        callTime: '',
        wrapTime: '',
        notes: '',
      };
      days.push(currentDay);
      currentScene = null;
      currentSection = '';

      // Check previous line for call time (e.g. "8A-6:30P")
      if (i > 0) {
        const prevLine = lines[i - 1].trim();
        const timeRange = prevLine.match(/^(\d{1,2}(?::\d{2})?[AP]M?)\s*[-–]\s*(\d{1,2}(?::\d{2})?[AP]M?)\s*$/i);
        if (timeRange) {
          currentDay.callTime = timeRange[1];
          currentDay.wrapTime = timeRange[2];
        }
      }
      continue;
    }

    // ===== End of Day =====
    if (/^end\s+of\s+day/i.test(line)) {
      currentSection = '';
      currentScene = null;
      continue;
    }

    // ===== Scene Number + Info (Movie Magic format) =====
    // Check if current line is a scene number AND next line is MM info
    const numMatch = line.match(SCENE_NUM_RE);
    if (numMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const mmMatch = nextLine.match(MM_INFO_RE);

      if (mmMatch) {
        if (!currentDay) {
          dayCount++;
          currentDay = {
            dayNumber: dayCount, date: '', scenes: [],
            location: '', callTime: '', wrapTime: '', notes: '',
          };
          days.push(currentDay);
        }

        const intExt = mmMatch[2].toUpperCase();
        const location = mmMatch[3].trim();
        const timeOfDay = mmMatch[4];
        const pages = mmMatch[5]?.trim() || '';

        currentScene = {
          sceneNumber: numMatch[1],
          heading: `${intExt}. ${location} - ${timeOfDay}`,
          intExt, location, timeOfDay, pages,
          synopsis: '',
          cast: [], props: [], backgroundActors: [], setDressing: [],
          cgiCharacters: [], grip: [], electric: [], additionalLabor: [],
          standby: [], visualEffects: [], makeupHair: [], wardrobe: [],
          vehicles: [], specialEffects: [], stunts: [], animals: [],
          music: [], sound: [], notes: '',
        };
        currentDay.scenes.push(currentScene);
        currentSection = '';
        i++; // consume the info line

        // Line after info is usually the synopsis
        if (i + 1 < lines.length) {
          const descLine = lines[i + 1].trim();
          if (descLine && !SKIP_RE.test(descLine) && !/^Cast\s*Members/i.test(descLine) && !descLine.match(SCENE_NUM_RE)) {
            currentScene.synopsis = descLine;
            i++; // consume synopsis line
          }
        }
        continue;
      }
    }

    // ===== Standard INT/EXT heading (non Movie Magic) =====
    if (currentDay && STD_HEADING_RE.test(line)) {
      const m = line.match(STD_HEADING_RE);
      currentScene = {
        sceneNumber: '', heading: line,
        intExt: m ? m[1].toUpperCase() : '',
        location: m ? m[2].trim() : '',
        timeOfDay: m && m[3] ? m[3].trim() : '',
        pages: '', synopsis: '',
        cast: [], props: [], backgroundActors: [], setDressing: [],
        cgiCharacters: [], grip: [], electric: [], additionalLabor: [],
        standby: [], visualEffects: [], makeupHair: [], wardrobe: [],
        vehicles: [], specialEffects: [], stunts: [], animals: [],
        music: [], sound: [], notes: '',
      };
      currentDay.scenes.push(currentScene);
      currentSection = '';
      continue;
    }

    // ===== Section headers =====
    const sectionMap = {
      'cast members': 'cast', 'cast member': 'cast',
      'props': 'props',
      'background actors': 'backgroundActors', 'background actor': 'backgroundActors',
      'set dressing': 'setDressing',
      'cgi characters': 'cgiCharacters', 'cgi': 'cgiCharacters',
      'grip': 'grip',
      'electric': 'electric',
      'additional labor': 'additionalLabor',
      'standby\'s & riggers': 'standby', 'standby': 'standby', 'standbys & riggers': 'standby',
      'visual effects': 'visualEffects',
      'makeup/hair': 'makeupHair', 'makeup': 'makeupHair', 'make up': 'makeupHair', 'hair': 'makeupHair',
      'wardrobe': 'wardrobe', 'costume': 'wardrobe',
      'vehicles': 'vehicles', 'action vehicles': 'vehicles',
      'special effects': 'specialEffects',
      'stunts': 'stunts', 'stunt': 'stunts',
      'animals': 'animals', 'animal': 'animals',
      'music': 'music',
      'sound': 'sound',
      'notes': 'notes',
      'dog action': 'animals', 'dog make up': 'makeupHair', 'dog makeup': 'makeupHair',
      'extra competitor dogs': 'backgroundActors',
    };

    const lineLower = line.toLowerCase();
    let matched = false;
    for (const [key, section] of Object.entries(sectionMap)) {
      if (lineLower === key || lineLower === key + 's') {
        currentSection = section;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // ===== Collect section data =====
    if (currentScene && currentSection) {
      const cleanItem = line.replace(/\d+\.\s*$/, '').replace(/[A-Z]\d+\.\s*$/, '').trim();

      if (currentSection === 'notes') {
        currentScene.notes = currentScene.notes ? currentScene.notes + ' ' + line : line;
        continue;
      }

      if (cleanItem && cleanItem.length > 0 && cleanItem.length < 80) {
        const arr = currentScene[currentSection];
        if (Array.isArray(arr)) {
          arr.push(cleanItem);
        }
        continue;
      }
    }
  }

  // Post-process
  for (const day of days) {
    if (!day.location && day.scenes.length > 0) {
      day.location = day.scenes[0].location || '';
    }
  }

  const totalScenes = days.reduce((sum, d) => sum + d.scenes.length, 0);
  const dates = days.map(d => d.date).filter(Boolean);

  return {
    shootDays: days,
    totalDays: days.length,
    totalScenes,
    startDate: dates[0] || '',
    endDate: dates[dates.length - 1] || '',
  };
}

module.exports = { parseShootingSchedule };
