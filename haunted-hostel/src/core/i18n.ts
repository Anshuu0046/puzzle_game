/**
 * Language-ready string table. All UI text goes through t(); add a language by adding a table with
 * the same keys and selecting it in settings. Long-form story documents live in data/documents.ts
 * and are keyed by language as well.
 */
const en: Record<string, string> = {
  // Prompts
  'prompt.open': 'OPEN',
  'prompt.close': 'CLOSE',
  'prompt.locked': 'LOCKED',
  'prompt.unlock': 'UNLOCK',
  'prompt.read': 'READ',
  'prompt.take': 'TAKE',
  'prompt.inspect': 'INSPECT',
  'prompt.view': 'VIEW',
  'prompt.use': 'USE',
  'prompt.search': 'SEARCH',
  'prompt.hide': 'HIDE',
  'prompt.hideUnder': 'HIDE UNDER',
  'prompt.hideBehind': 'HIDE BEHIND',
  'prompt.turnOn': 'TURN ON',
  'prompt.callLift': 'CALL LIFT',
  'prompt.liftPanel': 'SELECT FLOOR',
  'prompt.save': 'SAVE PROGRESS',
  'prompt.place': 'PLACE BELONGINGS',
  'prompt.light': 'LIGHT THE LAMP',
  'prompt.leave': 'LEAVE',
  'prompt.answer': 'ANSWER',
  'prompt.pray': 'PRAY',

  // HUD / general
  'hud.objective': 'OBJECTIVE',
  'hud.interact': 'INTERACT',
  'hud.holdBreath': 'HOLD BREATH',
  'hud.leaveHide': 'LEAVE',
  'hud.saved': 'Progress saved',
  'hud.autosaved': 'Checkpoint',
  'hud.newItem': 'Picked up',
  'hud.newEvidence': 'Evidence collected',
  'hud.flashlightDead': 'The flashlight is dead. Find batteries.',
  'hud.lowBattery': 'Flashlight battery low',
  'hud.phoneLow': 'Phone battery low',

  // Messages
  'msg.locked': 'It’s locked.',
  'msg.elecLocked': 'Electrical room. Locked. The key should be with security.',
  'msg.outOfOrder': 'A paper on the door: OUT OF ORDER. The handle is wired shut.',
  'msg.wardenLocked': 'The warden’s office. Locked tight.',
  'msg.recordsCorridor': 'RECORDS — AUTHORISED ONLY. The lock is painted over. There must be another way in.',
  'msg.sealed217': 'Sealed. A padlock and a paper seal from the warden’s office. Someone scratched the paint from the inside.',
  'msg.rusted': 'Rusted shut.',
  'msg.padlock': 'Padlocked. Nobody has opened this in years.',
  'msg.noPower': 'Nothing. There’s no power.',
  'msg.liftBroken': 'The button is dead.',
  'msg.liftFirst': 'The ‘1’ button is taped over: FLOOR CLOSED.',
  'msg.cantHide': 'Not now.',
  'msg.needDiya': 'Something is missing. A lamp — she would want a lamp lit for her.',
  'msg.needItems': 'Her things should be here. Her ID, her photograph, her diary.',
  'msg.gateLocked': 'The gate won’t move. Something is holding it shut.',
  'msg.mainLocked': 'The main door is jammed shut. The collapsible gate is locked from outside.',
  'msg.wickedOpen': 'The small gate creaks open.',
  'msg.battery': 'Batteries. The flashlight will last longer.',
  'msg.noSaveDanger': 'You can’t save while she’s hunting you.',
  'msg.cabinetOpen': 'The cabinet clicks open.',
  'msg.wrongCode': 'The lock doesn’t budge.',
  'msg.recordsOpen': 'The lock gives way.',
  'msg.keyboardEmpty': 'Rows of tagged keys. Nothing else you need.',
  'msg.journal': 'You write down everything that happened tonight.',

  // Inspect texts
  'inspect.radio': 'A transistor radio hissing static. Between the hiss, for a second, a girl’s voice: “…two… oh… seven…”',
  'inspect.calendar217': 'November 2016. The 14th is circled so hard the pen tore the paper. Nothing after that date was ever crossed off.',
  'inspect.calendarCommon': 'A sweet-shop calendar. November 2016 — still. The 14th is circled in red.',
  'inspect.table217': 'Her broken study table. Dust everywhere except one clean rectangle, as if something used to sit here.',
  'inspect.photoboard':
    '“Hostel Day 2016.” Thirty smiling students. One girl in the front row has had her face scratched out with something sharp.',
  'inspect.clock': 'The clock stopped at 2:07. The battery is still inside. It still feels warm.',
  'inspect.tv': 'An old CRT television. The screen is faintly warm, as if it was on a moment ago.',
  'inspect.shrine': 'A small roadside shrine. The lamp is still burning — in this rain. Someone has been keeping it lit.',
  'inspect.blackboard': 'Lecture notes in chalk. In the corner, under “Our code (A.R.)”: ☾ = 2, ✶ = 7, △ = 0, ○ = 9, ◇ = 4, ✕ = 1.',
  'inspect.dupatta': 'A purple dupatta, snagged on the tank pipe, soaked and rotting. It has been here for years.',
  'inspect.bricks': 'Fresh-looking cement on old bricks. Someone sealed the lift landing up here. Someone in a hurry.',
  'inspect.mirror': 'Your own face, pale in the flashlight. Just your own face.',
  'inspect.generic': 'Nothing useful.',

  // Objectives
  'obj.enter': 'Enter the hostel',
  'obj.security': 'Find the security room',
  'obj.roomKey': 'Find your room key',
  'obj.power': 'Restore electricity (electrical room, ground floor)',
  'obj.elecKey': 'Find the electrical room key',
  'obj.reachRoom': 'Go to your room — 214, second floor',
  'obj.knock': 'Find where the knocking is coming from',
  'obj.into217': 'Find a way into Room 217',
  'obj.wardenKey': 'Search the warden’s office for the key to 217',
  'obj.cabinetCode': 'Open the warden’s key cabinet',
  'obj.open217': 'Open Room 217',
  'obj.search217': 'Search Room 217',
  'obj.readDiary': 'Read the diary',
  'obj.cctv': 'Check the CCTV recordings in the security room',
  'obj.symbols': 'Find out what the symbols in her diary mean',
  'obj.records': 'Get into the records room (through the warden’s office)',
  'obj.evidence': 'Find what the warden hid in the records room',
  'obj.ritual': 'Return her belongings to Room 217',
  'obj.findDiya': 'Find a lamp to light for her (security room shelf)',
  'obj.escape': 'Escape through the hostel gate',
  'obj.survive': 'Survive',

  // Chapters
  'ch.1': 'CHAPTER I',
  'ch.1.title': 'ARRIVAL',
  'ch.2': 'CHAPTER II',
  'ch.2.title': 'THE EMPTY FLOOR',
  'ch.3': 'CHAPTER III',
  'ch.3.title': 'SOMETHING IS HERE',
  'ch.4': 'CHAPTER IV',
  'ch.4.title': 'THE TRUTH',
  'ch.5': 'CHAPTER V',
  'ch.5.title': 'ESCAPE',

  // Menus
  'menu.subtitle': 'Some rooms should stay locked.',
  'menu.play': 'PLAY',
  'menu.continue': 'CONTINUE',
  'menu.settings': 'SETTINGS',
  'menu.howto': 'HOW TO PLAY',
  'menu.exit': 'EXIT',
  'menu.newGameConfirm': 'Start a new game? Your saved progress will be overwritten.',
  'menu.yes': 'YES',
  'menu.no': 'NO',
  'menu.back': 'BACK',
  'menu.resume': 'RESUME',
  'menu.save': 'SAVE GAME',
  'menu.loadCheckpoint': 'LOAD CHECKPOINT',
  'menu.restartChapter': 'RESTART CHAPTER',
  'menu.mainMenu': 'MAIN MENU',
  'menu.paused': 'PAUSED',
  'menu.thanks': 'Thanks for playing. You can close this tab.',
  'menu.tapToStart': 'TAP TO BEGIN',
  'menu.headphones': 'Best experienced with headphones.',

  // Settings
  'set.graphics': 'GRAPHICS',
  'set.audio': 'AUDIO',
  'set.controls': 'CONTROLS',
  'set.access': 'ACCESSIBILITY',
  'set.preset': 'Quality preset',
  'set.shadows': 'Shadow quality',
  'set.textures': 'Texture quality',
  'set.effects': 'Effects quality',
  'set.fog': 'Fog quality',
  'set.renderScale': 'Render scale',
  'set.fps': 'FPS limit',
  'set.master': 'Master volume',
  'set.music': 'Music volume',
  'set.sfx': 'Effects volume',
  'set.ambience': 'Ambience volume',
  'set.sensitivity': 'Look sensitivity',
  'set.invert': 'Invert look',
  'set.fov': 'Field of view',
  'set.brightness': 'Brightness',
  'set.subtitles': 'Subtitles',
  'set.vibration': 'Vibration',
  'set.headbob': 'Head bob',
  'set.language': 'Language',
  'set.customize': 'Customize touch controls',
  'set.opacity': 'Button opacity',
  'set.btnScale': 'Button size',
  'set.leftHanded': 'Left-handed layout',
  'set.sprintToggle': 'Sprint is a toggle',
  'set.reset': 'Reset layout',
  'set.done': 'DONE',
  'set.restartNote': 'Texture quality applies after restarting the game.',
  'set.off': 'Off',
  'set.low': 'Low',
  'set.medium': 'Medium',
  'set.high': 'High',
  'set.ultra': 'Ultra',
  'set.custom': 'Custom',
  'set.unlimited': 'Unlimited',
  'set.on': 'On',
  'set.dragHint': 'Drag buttons to move them. Pinch or use the slider to resize.',

  // Loading
  'load.loading': 'Loading…',
  'load.textures': 'Weathering the walls',
  'load.audio': 'Recording the rain',
  'load.world': 'Building Kaveri Hostel',
  'load.shaders': 'Warming up the tube lights',
  'tip.0': 'Never trust a locked door.',
  'tip.1': 'Some footsteps aren’t yours.',
  'tip.2': 'Room 217 was sealed for a reason.',
  'tip.3': 'She hears you run. Walk, or crouch.',
  'tip.4': 'Your flashlight shows her where you are.',
  'tip.5': 'Cupboards, beds, curtains, stalls. Hide, and hold your breath.',
  'tip.6': 'Some rooms are safe. She will not cross their threshold.',
  'tip.7': 'The lift stops where it shouldn’t.',
  'tip.8': 'The calendars all stop on the same day.',

  // Inventory
  'inv.title': 'INVENTORY',
  'inv.evidence': 'EVIDENCE',
  'inv.items': 'ITEMS',
  'inv.documents': 'DOCUMENTS',
  'inv.empty': 'Nothing here yet.',
  'inv.read': 'READ',
  'inv.close': 'CLOSE',
  'inv.evidenceCount': 'Evidence {n} / 7',

  // Phone
  'phone.messages': 'Messages',
  'phone.torch': 'Torch',
  'phone.camera': 'Camera',
  'phone.notes': 'Notes',
  'phone.emergency': 'Emergency',
  'phone.noSignal': 'No signal',
  'phone.calling': 'Calling…',
  'phone.callFailed': 'Call failed',
  'phone.back': 'Back',
  'phone.capture': 'Capture',
  'phone.unknown': 'Unknown',
  'phone.notesEmpty': 'No notes yet.',

  // CCTV
  'cctv.title': 'KAVERI HOSTEL — SURVEILLANCE',
  'cctv.exit': 'EXIT',
  'cctv.archive': 'ARCHIVE',
  'cctv.motion': 'MOTION',
  'cctv.noSignal': 'NO SIGNAL',
  'cctv.cam1': 'CAM 01 — ENTRANCE',
  'cctv.cam2': 'CAM 02 — GROUND FLOOR',
  'cctv.cam3': 'CAM 03 — FIRST FLOOR',
  'cctv.cam4': 'CAM 04 — SECOND FLOOR',
  'cctv.cam5': 'CAM 05 — STAIRCASE',
  'cctv.cam6': 'CAM 06 — ROOM 217',
  'cctv.hint': 'Motion detected. Follow it.',
  'cctv.found': 'ARCHIVE FOLDER FOUND: 14-11-2016',
  'cctv.copied': 'Recording copied to the pen drive in the DVR.',

  // Puzzles
  'pz.breakers': 'MAIN DISTRIBUTION PANEL',
  'pz.breakersHint': 'Switch the breakers on in the right order.',
  'pz.tripped': 'TRIPPED — all breakers reset',
  'pz.power': 'POWER RESTORED',
  'pz.cabinet': 'KEY CABINET',
  'pz.recordsLock': 'RECORDS ROOM',
  'pz.enter': 'TRY',
  'pz.close': 'STEP BACK',
  'pz.liftTitle': 'LIFT',

  // Endings
  'end.good': 'GOOD ENDING',
  'end.good.title': 'The Truth Gets Out',
  'end.good.text':
    'You walk out of the gate as the rain thins into grey dawn. In your bag: a pen drive, a diary, a warden’s confession in his own handwriting.\n\nThree weeks later the case of Ananya Rao is reopened. The lift is cut open. The bricks on the terrace come down.\n\nThe night watchman says the lamp at the shrine finally went out that morning.',
  'end.bad': 'BAD ENDING',
  'end.bad.title': 'She Found You',
  'end.bad.text':
    'Kaveri Hostel stays empty for the rest of the break.\n\nWhen the students come back, the door of Room 217 is sealed again. There is a second name scratched into the paint.',
  'end.secret': 'SECRET ENDING',
  'end.secret.title': 'Floor Three',
  'end.secret.text':
    'Behind the bricks, in the dark between the lift and the roof, her phone is still lit. One last unsent message, timestamped 02:07, 14 November 2016:\n\n“Amma the lift stopped. nobody is coming. i love you”\n\nYou press send.\n\nSomewhere far away, a phone that has waited eight years finally rings.',
  'end.stats': 'Time: {time} · Evidence: {ev}/7',
  'end.credits': 'HAUNTED HOSTEL — a work of fiction. Any resemblance to real persons or institutions is coincidental.',

  // How to play
  'how.title': 'HOW TO PLAY',
  'how.desktop': 'DESKTOP',
  'how.mobile': 'MOBILE',
  'how.tips': 'SURVIVAL',
};

const tables: Record<string, Record<string, string>> = { en };
let current = en;

export function setLanguage(lang: string): void {
  current = tables[lang] ?? en;
}

export function languages(): string[] {
  return Object.keys(tables);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = current[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function hasKey(key: string): boolean {
  return key in current || key in en;
}
