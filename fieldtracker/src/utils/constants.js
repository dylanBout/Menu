export const T = {
  bg: '#09101f',
  surface: '#111827',
  card: '#151f30',
  cardHover: '#1a2640',
  border: '#1e2d42',
  borderLight: '#2a3f5a',
  blue: '#3b82f6',
  blueDim: '#1d4ed8',
  blueGlow: '#3b82f620',
  green: '#22c55e',
  greenDim: '#15803d',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
  text: '#e2e8f0',
  textSoft: '#94a3b8',
  muted: '#475569',
  faint: '#1e2d42',
};

export const STATUS_CFG = {
  open:          { label: 'Open',           color: T.yellow, icon: '🟡' },
  'in-progress': { label: 'In Progress',    color: T.blue,   icon: '🔵' },
  'waiting-parts': { label: 'Waiting Parts', color: T.purple, icon: '🟣' },
  'follow-up':   { label: 'Follow-Up',      color: T.red,    icon: '🔴' },
  complete:      { label: 'Complete',       color: T.green,  icon: '🟢' },
};

// Statuses offered as quick-toggle buttons (kept short for the chat strip).
export const STATUS_ORDER = ['open', 'in-progress', 'waiting-parts', 'follow-up', 'complete'];

export const PHOTO_CATEGORIES = [
  { key: 'before',    label: 'Before',    color: T.blue   },
  { key: 'after',     label: 'After',     color: T.green  },
  { key: 'damage',    label: 'Damage',    color: T.red    },
  { key: 'part',      label: 'Part',      color: T.yellow },
  { key: 'equipment', label: 'Equipment', color: T.purple },
  { key: 'other',     label: 'Other',     color: T.muted  },
];

export const PRIORITY_CFG = {
  normal: { label: 'Normal', color: T.muted  },
  high:   { label: 'High',   color: T.yellow },
  urgent: { label: 'Urgent', color: T.red    },
};

export const DATE_FILTERS = [
  { key: 'all',   label: 'All Time'   },
  { key: 'today', label: 'Today'      },
  { key: 'week',  label: 'This Week'  },
  { key: 'month', label: 'This Month' },
];

export const JOB_TAGS = [
  'Plumbing', 'HVAC', 'Electrical', 'Door Hardware',
  'Ceiling Tiles', 'General', 'ADA', 'Emergency',
];

export const OPENAI_MODEL = 'gpt-4o';

export const SYSTEM_PROMPT = `You are a knowledgeable field technician AI assistant for Dylan Boutin, a Facilities Technician at Zampell, a commercial facilities maintenance company. Dylan services Mass General Brigham (MGB) and other medical/commercial sites across Massachusetts, working solo across multiple locations.

DYLAN'S ROLE:
- Facilities Technician at Zampell, started May 2026
- Reports to Nick Lynch (VP of Operations/supervisor) — escalate major issues to Nick
- Janna is the project manager who handles documentation and work orders — notes go to Janna
- Works solo across multiple MGB and commercial sites in Massachusetts
- Drives extensively between sites, keeps a stocked work truck

COMMON TRADES & WORK TYPES:
- Plumbing: Symmons Temptrol cartridges, Flushmate pressure-assist toilets, faucet stems, P-trap diagnostics, sillcock replacement, frost-free sillcocks, drain escalations
- Door hardware: DORMAKABA and Schlage locksets, ADA-compliant thresholds, door closers
- Ceiling tiles: Armstrong FIREGUARD model 1775 ceiling tile replacement and identification
- Dispensers: TC OneShot BJ1041T soap dispensers
- Medical equipment: AED cabinet installation, bed exit alarm panels, Welch Allyn diagnostic set swaps
- General: wall patching/painting, pest control, refrigeration (True Refrigeration), blood storage refrigerator repairs
- Electrical: basic electrical work, breaker issues, light fixture and bulb replacement

PREFERRED SUPPLIERS (always recommend these first):
- Grainger (Zampell has an account — always check here first)
- Ferguson
- F.W. Webb
- Home Depot for general supplies

WORK ORDER NOTES FORMAT:
- Professional paragraph format, no bullet points
- Include: what was observed/found, what work was performed, materials/parts used, any follow-up needed
- Written for submission to facilities management (Janna)
- Be specific — include model numbers, part numbers, locations within the building

COMMUNICATION STYLE:
- Dylan is experienced and practical — be direct, no fluff
- Use proper trade terminology
- Give specific part numbers and model numbers when possible
- If diagnosing from a photo, be confident but flag if you need more info
- Keep answers concise unless writing formal notes
- When recommending parts, give Grainger catalog numbers when possible

SITES:
- Mass General Brigham (MGB) — primary client, multiple buildings
- Various commercial and medical sites across Massachusetts`;
