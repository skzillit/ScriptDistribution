const BREAKDOWN_CATEGORIES = {
  CAST_MEMBER: { label: 'Cast Member', color: '#FF6B6B' },
  EXTRA: { label: 'Extra/Background', color: '#FF8E8E' },
  PROP: { label: 'Prop', color: '#4ECDC4' },
  SET_DRESSING: { label: 'Set Dressing', color: '#45B7D1' },
  LOCATION: { label: 'Location', color: '#96CEB4' },
  VEHICLE: { label: 'Vehicle', color: '#FFEAA7' },
  WARDROBE: { label: 'Wardrobe', color: '#DDA0DD' },
  MAKEUP_HAIR: { label: 'Makeup/Hair', color: '#FFB6C1' },
  VFX: { label: 'Visual Effects', color: '#A29BFE' },
  SFX: { label: 'Special Effects', color: '#FD79A8' },
  SOUND_EFFECT: { label: 'Sound Effect', color: '#E17055' },
  MUSIC: { label: 'Music', color: '#00B894' },
  SPECIAL_EQUIPMENT: { label: 'Special Equipment', color: '#FDCB6E' },
  ANIMAL: { label: 'Animal', color: '#6C5CE7' },
  STUNT: { label: 'Stunt', color: '#D63031' },
  GREENERY: { label: 'Greenery', color: '#00B894' },
};

const CATEGORY_LIST = Object.keys(BREAKDOWN_CATEGORIES);

module.exports = { BREAKDOWN_CATEGORIES, CATEGORY_LIST };
