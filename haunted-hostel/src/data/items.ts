/** Item catalogue. Icons are inline SVG so the inventory never needs image files. */
export type ItemCategory = 'evidence' | 'key' | 'document' | 'tool';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  category: ItemCategory;
  /** Counts toward the 7 pieces of evidence. */
  evidence?: boolean;
  /** Document opened when the item is read. */
  doc?: string;
  icon: string;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const KEY = svg('<circle cx="20" cy="32" r="9"/><circle cx="20" cy="32" r="3"/><path d="M29 32h26M47 32v7M53 32v5"/>');

export const ITEMS: Record<string, ItemDef> = {
  key_214: {
    id: 'key_214',
    name: 'Room 214 key',
    desc: 'Your room key, on a plastic tag the warden numbered with a marker.',
    category: 'key',
    icon: KEY,
  },
  key_electrical: {
    id: 'key_electrical',
    name: 'Electrical panel key',
    desc: 'A heavy brass key tagged “ELEC / DB”. Opens the electrical room on the ground floor.',
    category: 'key',
    evidence: true,
    icon: KEY,
  },
  key_217: {
    id: 'key_217',
    name: 'Room 217 key',
    desc: 'A small padlock key from the warden’s cabinet. Tag: “217 — DO NOT ISSUE”.',
    category: 'key',
    evidence: true,
    icon: KEY,
  },
  id_card: {
    id: 'id_card',
    name: 'Old college ID',
    desc: 'VIDYANAGAR INSTITUTE OF TECHNOLOGY. Ananya Rao, B.Tech ECE, Roll 14EC217. Valid till 2018. The photo is water-damaged; only her eyes are clear.',
    category: 'evidence',
    evidence: true,
    icon: svg(
      '<rect x="10" y="16" width="44" height="32" rx="3"/><rect x="15" y="22" width="12" height="15"/><path d="M32 24h16M32 30h16M32 36h10M15 42h33"/>',
    ),
  },
  diary: {
    id: 'diary',
    name: 'Blood-stained diary',
    desc: 'A maroon notebook, its cover stiff with something dark. Some pages have small symbols drawn in the margin.',
    category: 'evidence',
    evidence: true,
    doc: 'diary',
    icon: svg(
      '<rect x="16" y="10" width="32" height="44" rx="2"/><path d="M22 10v44M28 20h14M28 26h14"/><path d="M36 40c3 2 6 1 7-2" stroke="#8a1a14"/>',
    ),
  },
  photo: {
    id: 'photo',
    name: 'Photograph',
    desc: 'Four friends on the hostel steps, August 2016. On the back: “me, Divya, Priya, Kavya — before everything”.',
    category: 'evidence',
    evidence: true,
    doc: 'photo',
    icon: svg(
      '<rect x="10" y="14" width="44" height="36" rx="2"/><circle cx="24" cy="28" r="4"/><circle cx="38" cy="28" r="4"/><path d="M16 46c3-8 13-8 16 0M30 46c3-8 13-8 16 0"/>',
    ),
  },
  cctv_recording: {
    id: 'cctv_recording',
    name: 'CCTV recording',
    desc: 'A pen drive from the DVR. One file: CAM02_14112016_0204.avi',
    category: 'evidence',
    evidence: true,
    doc: 'cctvLog',
    icon: svg(
      '<rect x="22" y="8" width="20" height="36" rx="3"/><rect x="26" y="44" width="12" height="10"/><path d="M28 50h2M34 50h2M27 16h10"/>',
    ),
  },
  final_evidence: {
    id: 'final_evidence',
    name: 'Warden’s incident log',
    desc: 'A red file marked CONFIDENTIAL. The warden’s own handwritten log of the night of 14 November 2016.',
    category: 'evidence',
    evidence: true,
    doc: 'incident',
    icon: svg('<path d="M14 12h26l10 10v30H14z"/><path d="M40 12v10h10M20 30h24M20 36h24M20 42h16"/>'),
  },
  diya: {
    id: 'diya',
    name: 'Clay diya & matches',
    desc: 'A small clay oil lamp with a cotton wick, and a matchbox from the guard’s prayer shelf.',
    category: 'tool',
    icon: svg('<path d="M12 36c4 10 36 10 40 0z"/><path d="M32 34c-3-5 0-10 0-14 2 4 5 9 0 14z"/>'),
  },
  battery: {
    id: 'battery',
    name: 'Batteries',
    desc: 'AA batteries. Used automatically when the flashlight runs low.',
    category: 'tool',
    icon: svg('<rect x="24" y="12" width="16" height="40" rx="2"/><rect x="29" y="8" width="6" height="4"/><path d="M28 24h8M32 20v8"/>'),
  },
};

export const EVIDENCE_IDS = Object.values(ITEMS)
  .filter((i) => i.evidence)
  .map((i) => i.id);
