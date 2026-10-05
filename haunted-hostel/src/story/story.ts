import * as THREE from 'three';
import type { Game } from '../game/game';
import { actions } from '../world/actions';
import { state } from '../systems/gameState';
import { power } from '../systems/power';
import { bus } from '../core/events';
import { t } from '../core/i18n';
import { breakerScreen, codeLockScreen, liftPanelScreen } from '../ui/panels';
import { CABINET_CODE, RECORDS_CODE, checkCode, flipBreaker, newBreakerState, type BreakerState } from '../systems/puzzles';
import { EVIDENCE_IDS } from '../data/items';
import { SPAWN, COMPOUND } from '../world/exterior';
import type { LockKind } from '../world/doors';
import { decal, handprint } from '../world/textArt';
import { registerFixture, glowSprite } from '../world/props/fixtures';
import type { Fixture } from '../world/context';
import { interactive } from '../world/actions';
import { XMAX } from '../world/layout';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UNKNOWN = () => t('phone.unknown');

interface Trigger {
  id: string;
  /** Only test while this returns true. */
  test: () => boolean;
  run: () => void;
  /** Persisted in flags so restored saves don't replay it. */
  persist?: boolean;
}

/**
 * The script: five chapters of objectives, triggers, scares and puzzle bindings. World state is
 * derived from flags so a save can be restored by replaying `restore()`.
 */
export class Story {
  scripted = false;
  private timers: { t: number; fn: () => void }[] = [];
  private readonly triggers: Trigger[] = [];
  private readonly fired = new Set<string>();
  private readonly initialDoors = new Map<string, { lock: LockKind; open: boolean }>();
  private knockT = 0;
  private noteList: { key: string; done: boolean }[] = [];
  private ritualGroup!: THREE.Group;
  private diyaFixture!: Fixture;
  private remains!: THREE.Group;
  private wicketOpen = 0;
  private wicketTarget = 0;
  private bedNudge = 0;
  private stallBurst = 0;
  private curtainPuff = 0;
  private tvOnT = 0;
  private liftScareT = 0;
  private finalChaseArmed = false;

  constructor(private readonly g: Game) {
    for (const [id, d] of g.world.doors) this.initialDoors.set(id, { lock: d.lock, open: d.isOpen });
    this.setupProps();
    this.bindActions();
    this.defineTriggers();
    this.bindLift();
    g.cctv.onSolved = () => this.cctvSolved();
  }

  // -------------------------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------------------------
  private get ctx() {
    return this.g.world.ctx;
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  private flag(n: string): boolean {
    return state.flag(n);
  }

  private set(n: string): void {
    state.set(n);
  }

  objective(key: string): void {
    if (state.objective === key) return;
    const prev = this.noteList.find((n) => n.key === state.objective);
    if (prev) prev.done = true;
    state.objective = key;
    if (!this.noteList.some((n) => n.key === key)) this.noteList.push({ key, done: false });
    this.g.hud.setObjective(t(key));
    this.g.audio.play('pageTurn', { volume: 0.4 });
  }

  objectiveText(): string {
    return state.objective ? t(state.objective) : '';
  }

  notes(): { text: string; done: boolean }[] {
    const clues: { text: string; done: boolean }[] = [];
    if (this.flag('readBreakers')) clues.push({ text: 'Breakers: MAIN, then 3 → 1 → 2.', done: this.flag('power') });
    if (this.flag('readNote216'))
      clues.push({ text: 'Warden’s code = the day she "left". Day, then month.', done: this.flag('cabinetOpen') });
    if (this.flag('readDiary')) clues.push({ text: 'Diary margins: ☾ ✶ △ ○', done: this.flag('recordsOpen') });
    if (this.flag('sawCipher')) clues.push({ text: 'Blackboard: ☾=2 ✶=7 △=0 ○=9', done: this.flag('recordsOpen') });
    if (this.flag('sawBricks')) clues.push({ text: 'Someone bricked up the lift landing on the terrace.', done: false });
    if (this.flag('sawDupatta')) clues.push({ text: 'Her dupatta is caught on the tank pipe. She was up there that night.', done: false });
    return [...this.noteList.map((n) => ({ text: t(n.key), done: n.done })), ...clues];
  }

  private say(text: string, duration = 4): void {
    bus.emit('subtitle', { text, duration });
  }

  private sms(from: string, text: string, delay = 0): void {
    this.after(delay, () => this.g.phone.receive(from, text));
  }

  /** A jump scare, capped at eight per playthrough. */
  private scare(id: string, fn: () => void): boolean {
    if (state.scaresUsed.has(id) || state.scaresUsed.size >= 8) return false;
    state.scaresUsed.add(id);
    fn();
    return true;
  }

  private obj(id: string): THREE.Object3D | undefined {
    return this.ctx.objects.get(id);
  }

  private take(objId: string, item?: string): void {
    const o = this.obj(objId);
    if (o) o.visible = false;
    this.set(`took:${objId}`);
    if (item) state.give(item);
  }

  private door(id: string) {
    return this.g.world.doors.get(id);
  }

  private nearDoor(id: string, dist: number): boolean {
    const d = this.door(id);
    return !!d && d.center.distanceTo(this.g.player.pos.clone().setY(this.g.player.pos.y + 1.2)) < dist;
  }

  private inRoom(id: string): boolean {
    return this.g.playerRoom() === id;
  }

  private get p(): THREE.Vector3 {
    return this.g.player.pos;
  }

  private chapterCard(n: number): void {
    state.chapter = n;
    this.g.hud.chapterCard(t(`ch.${n}`), t(`ch.${n}.title`), n === 1 ? 'KAVERI HOSTEL · 02:07 AM' : '');
    bus.emit('musicState', { state: n >= 3 ? 'TENSION' : 'NORMAL' });
  }

  // -------------------------------------------------------------------------------------------
  // Props created by the story (ritual table items, the remains behind the bricks)
  // -------------------------------------------------------------------------------------------
  private setupProps(): void {
    const ctx = this.ctx;
    const scene = ctx.scene;
    const rp = ctx.points.get('ritual217') ?? V(8.5, 7.6, 5.0);
    const g = new THREE.Group();
    const id = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.002, 0.086), new THREE.MeshStandardMaterial({ color: 0xe8e4d8 }));
    id.position.set(-0.25, 0.01, 0);
    const photo = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.002, 0.09), new THREE.MeshStandardMaterial({ color: 0x8a7a60 }));
    photo.position.set(-0.08, 0.01, 0.05);
    const diary = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a1610 }));
    diary.position.set(0.18, 0.015, 0);
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a4a2a }),
    );
    bowl.rotation.x = Math.PI;
    bowl.position.set(0, 0.035, 0.12);
    const flameMat = ctx.mats.emissive(0xffa040, 0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), flameMat);
    flame.position.set(0, 0.07, 0.12);
    const glow = glowSprite(0xff9a3a, 0.7, 0.55);
    glow.position.copy(flame.position);
    g.add(id, photo, diary, bowl, flame, glow);
    g.position.copy(rp);
    g.visible = false;
    scene.add(g);
    this.ritualGroup = g;
    this.diyaFixture = registerFixture(ctx, {
      id: 'ritualDiya',
      pos: rp.clone().add(V(0, 0.3, 0.1)),
      color: 0xff9a3a,
      intensity: 3,
      range: 6,
      circuit: 'BATTERY',
      mats: [flameMat],
      emissiveBase: 5,
      unstable: 0.3,
      floor: 2,
      glow,
      buzz: false,
    });
    this.diyaFixture.forced = 0;
    this.g.lighting?.get?.('ritualDiya');
    ctx.animated.push({ update: (_dt, time) => (flame.scale.y = 1 + Math.sin(time * 17) * 0.15 + Math.sin(time * 7.3) * 0.1) });

    // Behind the bricks: a shape under her purple dupatta, her slippers, her phone still lit.
    const vp = ctx.points.get('liftVestibule') ?? V(1.65, 10.2, 0.7);
    const r = new THREE.Group();
    const clothGeo = new THREE.SphereGeometry(0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const cp = clothGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i);
      const z = cp.getZ(i);
      cp.setY(i, cp.getY(i) * 0.45 + Math.sin(x * 14) * 0.02 + Math.sin(z * 11) * 0.015);
      cp.setX(i, x * 1.5);
    }
    clothGeo.computeVertexNormals();
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0x3e1c34, roughness: 0.95, side: THREE.DoubleSide }));
    cloth.castShadow = cloth.receiveShadow = true;
    cloth.rotation.y = 0.4;
    r.add(cloth);
    const hand = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.12, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x8c8a80, roughness: 0.8 }),
    );
    hand.rotation.z = Math.PI / 2;
    hand.position.set(0.55, 0.03, 0.12);
    r.add(hand);
    const phone = new THREE.Group();
    phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.14), new THREE.MeshStandardMaterial({ color: 0x111111 })));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), ctx.mats.emissive(0x9fc4ff, 1.5));
    scr.rotation.x = -Math.PI / 2;
    scr.position.y = 0.005;
    phone.add(scr);
    phone.position.set(0.6, 0.01, -0.15);
    phone.rotation.y = 0.6;
    r.add(phone);
    const stain = decal(handprint(77), 0.4, 0.4, { transparent: true });
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(-0.4, 0.004, -0.2);
    r.add(stain);
    r.position.copy(vp).add(V(-0.4, 0.002, -0.05));
    r.visible = false;
    r.traverse((o) => (o.userData.dynamic = true));
    scene.add(r);
    this.remains = r;
    interactive(ctx, 'herPhone', phone, [0.3, 0.2, 0.3], { prompt: 'answer' }, [0, 0.05, 0]);
    const phoneGlow = glowSprite(0x9fc4ff, 0.5, 0.4);
    phoneGlow.position.copy(phone.position);
    r.add(phoneGlow);
    // The bricked wall on the terrace side is inspectable.
    const bricks = new THREE.Group();
    bricks.position.set(1.65, 10.2, 0.05);
    scene.add(bricks);
    interactive(ctx, 'bricks', bricks, [1.5, 2.2, 0.3], { prompt: 'inspect', inspect: 'inspect.bricks' }, [0, 1.1, 0]);
  }

  // -------------------------------------------------------------------------------------------
  // Bindings
  // -------------------------------------------------------------------------------------------
  private bindActions(): void {
    const g = this.g;
    const read = (id: string, flag?: string, after?: () => void) => {
      actions.set(id, {
        run: () => {
          if (flag) this.set(flag);
          g.readDocument(id);
          after?.();
        },
      });
    };
    read('note_breakers', 'readBreakers');
    read('register');
    read('boothlog');
    read('noticeboard');
    read('newspaper');
    read('studentfile');
    read('oldregister');
    read('notes217');
    read('note216', 'readNote216', () => {
      if (state.chapter === 2 && ['obj.knock', 'obj.into217'].includes(state.objective)) this.objective('obj.wardenKey');
    });

    actions.set('gate', {
      prompt: () => (this.wicketTarget ? null : 'open'),
      run: () => {
        this.wicketTarget = 1;
        g.audio.play('creakLong', { pos: V(17, 1.2, COMPOUND.z1), volume: 0.9 });
        bus.emit('noise', { pos: this.p.clone(), loudness: 0.3, kind: 'door' });
      },
    });
    actions.set('keyboard', {
      run: () => {
        if (state.has('key_214') && state.has('key_electrical')) {
          g.hud.toast('msg.keyboardEmpty');
          return;
        }
        g.audio.play('pickup');
        state.give('key_214');
        state.give('key_electrical');
        if (state.chapter === 1 && !this.flag('power')) this.objective('obj.power');
      },
    });
    actions.set('cctv', {
      prompt: () => 'view',
      run: () => {
        if (!power.on('GF')) {
          g.hud.toast('msg.noPower');
          return;
        }
        g.cctv.puzzleActive = state.chapter === 3 && !this.flag('cctvSolved');
        g.openCctv();
      },
    });
    actions.set('breakers', {
      prompt: () => (this.flag('power') && !this.flag('blackout') ? 'inspect' : 'use'),
      run: () => {
        if (this.flag('blackout')) {
          g.hud.toast('The breakers are on. The power is not. Something else is holding it.');
          g.audio.play('sparks', { pos: this.p.clone().setY(this.p.y + 1.4) });
          return;
        }
        if (this.flag('power')) {
          g.hud.toast('All breakers are on.');
          return;
        }
        const st = (state.puzzles.breakers as BreakerState | undefined) ?? newBreakerState();
        state.puzzles.breakers = st;
        g.openOverlay((done) =>
          breakerScreen(
            st,
            (id) => {
              const r = flipBreaker(st, id);
              if (r === 'trip') {
                g.audio.play('sparks', { volume: 1 });
                g.player.trauma = 0.4;
              } else g.audio.play('breaker');
              if (r === 'solved') this.powerOn();
              return r;
            },
            done,
          ),
        );
      },
    });
    actions.set('keycabinet', {
      prompt: () => (this.flag('cabinetOpen') ? 'inspect' : 'unlock'),
      run: () => {
        if (this.flag('cabinetOpen')) {
          g.hud.toast('Empty hooks and a smell of rust.');
          return;
        }
        g.openOverlay((done) =>
          codeLockScreen(
            t('pz.cabinet'),
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            4,
            (code) => {
              if (checkCode(code, CABINET_CODE)) {
                this.set('cabinetOpen');
                g.audio.play('unlock');
                g.hud.toast('msg.cabinetOpen');
                state.give('key_217');
                if (state.chapter <= 2) this.objective('obj.open217');
                g.checkpoint();
                return true;
              }
              g.audio.play('doorRattle', { volume: 0.5 });
              return false;
            },
            done,
            () => g.audio.play('switchClick', { volume: 0.3 }),
          ),
        );
      },
    });
    const rec = this.door('recordsInner');
    if (rec)
      rec.onLockedInteract = () => {
        g.openOverlay((done) =>
          codeLockScreen(
            t('pz.recordsLock'),
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            4,
            (code) => {
              if (checkCode(code, RECORDS_CODE)) {
                rec.unlock();
                rec.setOpen(true);
                this.set('recordsOpen');
                g.hud.toast('msg.recordsOpen');
                if (state.chapter === 4) this.objective('obj.evidence');
                g.checkpoint();
                return true;
              }
              g.audio.play('doorRattle', { volume: 0.5 });
              return false;
            },
            done,
            () => g.audio.play('switchClick', { volume: 0.3 }),
          ),
        );
      };
    const warden = this.door('warden');
    if (warden) warden.onLockedInteract = () => g.hud.toast('msg.wardenLocked');
    const r217 = this.door('room217');
    if (r217) {
      r217.onLockedInteract = () => {
        g.hud.toast('msg.sealed217');
        if (state.chapter === 2 && ['obj.knock', 'obj.into217'].includes(state.objective))
          this.after(3, () => this.objective('obj.wardenKey'));
      };
    }
    for (const id of ['mainL', 'mainR']) {
      const d = this.door(id);
      if (d) d.onLockedInteract = () => g.hud.toast('msg.mainLocked');
    }

    // Pickups.
    const pickup = (objId: string, item: string, after?: () => void) =>
      actions.set(objId, {
        prompt: () => (this.obj(objId)?.visible ? 'take' : null),
        run: () => {
          this.take(objId, item);
          after?.();
        },
      });
    pickup('id_card', 'id_card', () =>
      this.say('“Ananya Rao. ECE. Room 217.” Her eyes in the photo are the only part the water didn’t take.', 5),
    );
    pickup('photo', 'photo');
    pickup('diya', 'diya', () => {
      if (state.objective === 'obj.findDiya') this.objective('obj.ritual');
    });
    pickup('diary', 'diary', () => {
      this.set('readDiary');
      g.readDocument('diary');
    });
    pickup('final_evidence', 'final_evidence', () => g.readDocument('incident'));
    for (const b of ['battery_security', 'battery_212', 'battery_study']) {
      actions.set(b, {
        prompt: () => (this.obj(b)?.visible ? 'take' : null),
        run: () => {
          this.take(b);
          state.batteries++;
          g.audio.play('pickup');
          g.hud.toast('msg.battery');
          g.hud.pickup('battery');
        },
      });
    }
    actions.set('journal214', {
      prompt: () => 'save',
      run: () => {
        if (g.ai.hunting) {
          g.hud.toast('msg.noSaveDanger');
          return;
        }
        g.audio.play('pageTurn');
        g.manualSave();
        this.say('msg.journal', 3);
      },
    });
    actions.set('blackboard', {
      run: () => {
        g.hud.toast('inspect.blackboard', 8);
        this.set('sawCipher');
        if (state.chapter === 4 && ['obj.symbols'].includes(state.objective)) this.objective('obj.records');
      },
    });
    actions.set('dupatta', {
      run: () => {
        g.hud.toast('inspect.dupatta', 6);
        this.set('sawDupatta');
      },
    });
    actions.set('bricks', {
      run: () => {
        g.hud.toast('inspect.bricks', 6);
        this.set('sawBricks');
        for (let i = 0; i < 3; i++) this.after(1.5 + i * 0.4, () => g.audio.play('knock', { pos: V(1.65, 11.3, 0.6), volume: 0.6 }));
      },
    });
    actions.set('tv', {
      run: () => {
        if (this.tvOnT > 0) g.hud.toast('The screen is full of static. For a second, a shape in the snow — then nothing.', 5);
        else g.hud.toast('inspect.tv', 5);
      },
    });
    actions.set('ritual', {
      prompt: () => {
        if (this.flag('ritualDone')) return null;
        return state.chapter === 5 ? 'place' : 'inspect';
      },
      run: () => this.tryRitual(),
    });
    actions.set('herPhone', {
      prompt: () => (this.remains.visible ? 'answer' : null),
      run: () => this.secretEnding(),
    });

    // Lift.
    const lift = g.world.lift;
    for (const stop of ['G', '1', '2'] as const) {
      actions.set(`liftCall${stop}`, {
        prompt: () => 'callLift',
        run: () => {
          g.audio.play('switchClick', { volume: 0.6 });
          if (!lift.powered) g.hud.toast('msg.liftBroken');
          else if (stop === '1') g.hud.toast('msg.liftFirst');
          else lift.call(stop);
        },
      });
    }
    actions.set('liftPanel', {
      prompt: () => 'liftPanel',
      run: () => {
        if (!lift.powered) {
          g.hud.toast('msg.noPower');
          return;
        }
        g.openOverlay((done) =>
          liftPanelScreen(
            !lift.hiddenThird,
            (f) => {
              done();
              if (f === '1') g.hud.toast('msg.liftFirst');
              else lift.go(f);
            },
            done,
          ),
        );
      },
    });

    // Hiding spots.
    for (const spot of this.ctx.hideSpots) {
      actions.set(`hide:${spot.id}`, {
        prompt: () => (g.hiding.spot ? null : spot.kind === 'bed' ? 'hideUnder' : spot.kind === 'curtain' ? 'hideBehind' : 'hide'),
        run: () => {
          const seen = g.ai.state === 'CHASE' && g.ai.awareness > 0.4 && g.ghost.pos.distanceTo(this.p) < 14;
          g.hiding.enter(spot, seen);
        },
      });
    }
  }

  private bindLift(): void {
    const lift = this.g.world.lift;
    lift.divert = (from, to) => {
      if (!this.flag('liftScare') && to === '2' && from === 'G') {
        this.set('liftScare');
        return ['3', '2'];
      }
      if (this.flag('ritualDone') && this.secretUnlocked() && to === '3') return ['3'];
      return null;
    };
    lift.onArrive = (stop) => {
      if (stop !== '3') return;
      if (this.flag('ritualDone') && this.secretUnlocked()) {
        this.remains.visible = true;
        lift.dwell = 9999;
        bus.emit('musicState', { state: 'DISCOVERY' });
        this.after(1.5, () => this.say('The bricks are gone. As if they were never there.', 5));
        return;
      }
      // The floor that doesn't exist: doors open on the bricked-up landing.
      lift.grilleLocked = true;
      lift.dwell = 4;
      this.liftScareT = 4.5;
      this.g.lighting.surgeFlicker(3);
      this.after(1.2, () => {
        this.g.audio.play('whisper2', { pos: V(1.65, 11.5, 0.6), volume: 1 });
        this.say('Three? There is no third floor.', 4);
      });
      this.after(2.4, () => {
        for (let i = 0; i < 4; i++) this.after(i * 0.28, () => this.g.audio.play('knock', { pos: V(1.65, 11.3, 0.4), volume: 1 }));
      });
    };
  }

  private secretUnlocked(): boolean {
    return this.flag('sawBricks') && this.flag('sawDupatta');
  }

  // -------------------------------------------------------------------------------------------
  // Triggers
  // -------------------------------------------------------------------------------------------
  private trig(id: string, test: () => boolean, run: () => void, persist = true): void {
    this.triggers.push({ id, test, run, persist });
  }

  private defineTriggers(): void {
    const g = this.g;
    const ch = () => state.chapter;
    // ---- Chapter 1 ----
    this.trig(
      'courtyard',
      () => ch() === 1 && this.p.z < COMPOUND.z1 - 1,
      () => {
        g.audio.play('metalClang', { pos: V(30, 7, 0), volume: 0.8 });
        this.say('Something metal, somewhere up there.', 3);
      },
    );
    this.trig(
      'lobby',
      () => ch() === 1 && this.p.z < 5.4 && this.p.y < 2 && this.p.x > 3.6,
      () => {
        if (state.objective === 'obj.enter') this.objective('obj.security');
        this.after(4, () => {
          for (let i = 0; i < 7; i++) this.after(i * 0.55, () => g.audio.play('ghostStep', { pos: V(18 + i * 0.7, 7.0, -0.3), volume: 1 }));
        });
        this.after(9, () => this.say('Footsteps? The block is supposed to be empty.', 4));
      },
    );
    this.trig(
      'securityRoom',
      () => ch() === 1 && this.inRoom('security'),
      () => {
        if (!state.has('key_214')) this.objective('obj.roomKey');
      },
    );
    this.trig(
      'elecDoor',
      () => ch() === 1 && this.nearDoor('electrical', 2.2) && !state.has('key_electrical'),
      () => this.objective('obj.elecKey'),
      false,
    );
    this.trig(
      'tvOn',
      () => ch() <= 2 && this.flag('power') && this.inRoom('common'),
      () => this.tvOn(),
    );
    this.trig(
      'enter214',
      () => ch() === 1 && this.inRoom('room214'),
      () => {
        if (!this.flag('power')) {
          this.say('Pitch dark. I should get the power back on first.', 4);
          this.fired.delete('enter214');
          state.flags.delete('trig:enter214');
          this.after(6, () => undefined);
          return;
        }
        this.startChapter2();
      },
    );

    // ---- Chapter 2 ----
    this.trig(
      'near217',
      () => ch() === 2 && this.nearDoor('room217', 2.6),
      () => {
        if (['obj.knock'].includes(state.objective)) this.objective('obj.into217');
        this.sms(UNKNOWN(), 'Don’t open the door.', 2);
      },
    );
    this.trig(
      'slam216',
      () => ch() === 2 && this.flag('trig:near217') && this.p.y > 6 && Math.abs(this.p.x - 12.6) < 2.5 && Math.abs(this.p.z) < 1.2,
      () =>
        this.scare('doorSlam', () => {
          this.door('room216')?.setOpen(false, 7);
          g.player.trauma = 0.5;
        }),
    );
    this.trig(
      'bed218',
      () => ch() >= 2 && this.inRoom('room218'),
      () => this.scare('bedMove', () => (this.bedNudge = 0.0001)),
    );
    this.trig(
      'wardenOpens',
      () => ch() === 2 && ['obj.wardenKey'].includes(state.objective) && this.p.y < 2 && this.nearDoor('warden', 7),
      () => {
        const d = this.door('warden');
        if (!d) return;
        d.unlock();
        d.setOpen(true, 0.45, true);
        g.audio.play('creakLong', { pos: d.center, volume: 1 });
        this.after(2, () => this.say('It opened by itself.', 3));
      },
    );
    this.trig(
      'inWarden',
      () => ch() === 2 && this.inRoom('warden') && !this.flag('cabinetOpen'),
      () => this.objective('obj.cabinetCode'),
    );
    this.trig(
      'opened217',
      () => this.door('room217')?.isOpen === true,
      () => {
        if (ch() === 2) this.objective('obj.search217');
        bus.emit('musicState', { state: 'DISCOVERY' });
        this.after(12, () => bus.emit('musicState', { state: state.chapter >= 3 ? 'TENSION' : 'NORMAL' }));
        g.checkpoint();
      },
    );

    // ---- Chapter 3 ----
    this.trig(
      'corridorApparition',
      () => ch() === 3 && this.p.y > 6 && this.p.y < 8 && Math.abs(this.p.z) < 1.2 && this.p.x < 20,
      () => {
        g.apparitions.show(
          { pos: V(XMAX - 1.0, 6.8, 0.2), yaw: null, vanishOnLook: true, duration: 12, clip: 'standStill' },
          g.engine.camera,
        );
      },
    );
    this.trig(
      'stairsApparition',
      () => ch() === 3 && this.p.x < 1.9 && this.p.z < -3.9 && this.p.y > 4.8 && this.p.y < 5.4,
      () => {
        g.apparitions.show(
          { pos: V(2.7, 6.8, -1.7), yaw: Math.PI, vanishOnLook: true, duration: 8, clip: 'crawlPeek', vanishDist: 2.5 },
          g.engine.camera,
        );
        g.audio.play('ghostBreath', { pos: V(2.7, 8.2, -1.7), volume: 0.8 });
      },
    );
    this.trig(
      'shadowCross',
      () => ch() === 3 && this.p.y < 1.5 && Math.abs(this.p.z) < 1.2 && this.p.x < 12 && this.p.x > 2,
      () =>
        this.scare('shadowCross', () => {
          const x = this.p.x + 7;
          g.apparitions.show(
            { pos: V(x, 0, -1.3), yaw: 0, walkTo: V(x, 0, 1.4), walkSpeed: 3.2, instant: true, duration: 2 },
            g.engine.camera,
          );
          g.audio.play('whisper1', { pos: V(x, 1.4, 0), volume: 0.9 });
        }),
    );
    this.trig(
      'lobbyWindow',
      () => ch() === 3 && this.inRoom('lobby') && this.flag('trig:shadowCross'),
      () => {
        g.apparitions.show({ pos: V(15.6, 0, 8.6), yaw: Math.PI, vanishOnLook: true, duration: 15, clip: 'standStill' }, g.engine.camera);
      },
    );
    this.trig(
      'mirror',
      () => ch() >= 3 && this.inRoom('bathroom2') && this.lookingAtMirror(),
      () =>
        this.scare('mirror', () => {
          const fwd = new THREE.Vector3();
          g.engine.camera.getWorldDirection(fwd);
          fwd.y = 0;
          fwd.normalize();
          const behind = this.p.clone().addScaledVector(fwd, -0.9);
          g.mirrorPhantom.snapIn(behind, Math.atan2(fwd.x, fwd.z));
          g.mirrorPhantom.play('standStill');
          this.after(0.9, () => g.mirrorPhantom.vanish(4));
          this.after(4, () => g.mirrorPhantom.hide());
          this.after(3.5, () => this.scare('stall', () => (this.stallBurst = 0.0001)));
        }),
    );
    this.trig(
      'curtain203',
      () => ch() >= 3 && this.inRoom('room203'),
      () => {
        this.curtainPuff = 0.0001;
        g.audio.play('whisper3', { pos: this.ctx.objects.get('curtain203')?.getWorldPosition(new THREE.Vector3()), volume: 0.7 });
      },
    );
    // Phone camera phantom stands where the eye sees nothing.
    // ---- Chapter 5 ----
    this.trig(
      'finalChase',
      () => ch() === 5 && this.flag('ritualDone') && this.p.y < 1.5 && Math.abs(this.p.z) < 1.3 && this.p.x < 8,
      () =>
        this.scare('chaseAppear', () => {
          g.ai.placeAt(V(24, 0, 0), -Math.PI / 2, 'IDLE');
          g.ai.aggression = 1;
          g.ai.forceChase(this.p);
          g.audio.play('ghostScream', { pos: V(24, 1.6, 0), volume: 1 });
        }),
    );
    this.trig(
      'gate',
      () => ch() === 5 && this.flag('ritualDone') && this.p.z > COMPOUND.z1 + 0.6,
      () => this.goodEnding(),
    );
  }

  private lookingAtMirror(): boolean {
    const m = this.g.mirror;
    if (!m) return false;
    const fwd = new THREE.Vector3();
    this.g.engine.camera.getWorldDirection(fwd);
    const to = m.position.clone().sub(this.g.engine.camera.position).normalize();
    return fwd.dot(to) > 0.8;
  }

  // -------------------------------------------------------------------------------------------
  // Chapter flow
  // -------------------------------------------------------------------------------------------
  begin(): void {
    this.noteList = [];
    state.chapter = 1;
    this.g.player.place(SPAWN.clone(), 0, 0.02);
    this.chapterCard(1);
    this.objective('obj.enter');
    this.sms('Sam', 'reached hostel? warden said the block is empty for the break. text me when you’re in your room', 6);
    this.after(16, () => this.say('2:07 AM. Everyone else went home for the break.', 4));
    this.g.checkpoint();
  }

  private powerOn(): void {
    const g = this.g;
    this.set('power');
    power.set('GF', true);
    power.set('FF', true);
    power.set('SF', true);
    g.audio.play('powerUp', { volume: 0.8 });
    this.after(1.5, () => g.hud.toast('pz.power'));
    if (state.chapter === 1) this.objective('obj.reachRoom');
    this.sms('Sam', 'power cut there also? here it’s raining like crazy', 8);
    // Room 212's fan was turning before the power came back. Now it stops.
    const fan212 = this.findFan('room212');
    if (fan212) fan212.userData.forceSpin = 0;
    g.checkpoint();
  }

  private startChapter2(): void {
    const g = this.g;
    this.chapterCard(2);
    this.objective('obj.knock');
    this.door('room216')?.setOpen(true, 2, true);
    this.sms(UNKNOWN(), 'Are you still in Room 217?', 4);
    this.after(9, () => this.say('Wrong number. It has to be a wrong number.', 4));
    this.knockT = 12;
    g.checkpoint();
  }

  private startChapter3(): void {
    const g = this.g;
    this.chapterCard(3);
    this.objective('obj.cctv');
    this.sms(UNKNOWN(), 'I’m outside.', 3);
    this.after(5, () => {
      const d = this.door('room217');
      if (d) for (let i = 0; i < 3; i++) this.after(i * 0.45, () => g.audio.play('knock', { pos: d.center, volume: 1 }));
    });
    this.after(8, () => this.say('The diary said she recorded it. The security room has the CCTV.', 5));
    this.placePhonePhantom();
    g.checkpoint();
  }

  private cctvSolved(): void {
    this.set('cctvSolved');
    state.give('cctv_recording');
    this.g.hud.toast('cctv.copied');
  }

  onCctvClosed(): void {
    const g = this.g;
    if (this.flag('cctvSolved') && !this.flag('cctvAftermath')) {
      this.set('cctvAftermath');
      // She was standing right behind you on the monitor. Turn around: nothing.
      const behind = this.p.clone().add(V(-0.8, 1.5, 0));
      g.audio.play('whisper0', { pos: behind, volume: 1 });
      g.player.lookAt(behind, 0.5);
      g.player.trauma = 0.6;
      this.after(1.2, () => this.say('Nothing. There’s nothing there.', 3));
      this.after(4, () => this.startChapter4());
    }
  }

  private startChapter4(): void {
    const g = this.g;
    this.chapterCard(4);
    this.objective(this.flag('sawCipher') ? 'obj.records' : 'obj.symbols');
    this.after(5, () => this.say('The symbols in her diary… a study group code. The study room upstairs has a blackboard.', 6));
    this.after(20, () => {
      g.ai.allowedFloors = new Set([0, 2]);
      g.ai.activate(this.p, 0.35);
    });
    bus.emit('musicState', { state: 'TENSION' });
    g.checkpoint();
  }

  onDocumentClosed(id: string): void {
    if (id === 'diary' && state.chapter === 2) this.after(1, () => this.startChapter3());
    if (id === 'incident' && state.chapter === 4) this.after(0.5, () => this.blackout());
  }

  private blackout(): void {
    const g = this.g;
    this.chapterCard(5);
    this.set('blackout');
    power.set('GF', false);
    power.set('FF', false);
    power.set('SF', false);
    power.set('EMERGENCY', true);
    g.audio.play('powerDown', { volume: 1 });
    g.audio.play('thunderClose', { volume: 1 });
    g.weather.strike(true);
    this.applyLockdown(true);
    const fan = this.obj('fan217');
    if (fan) fan.userData.forceSpin = 7;
    this.sms(UNKNOWN(), 'You took it. Now bring me home.', 3);
    this.objective(state.has('diya') ? 'obj.ritual' : 'obj.findDiya');
    g.ai.deactivate();
    this.after(4, () => {
      g.ai.allowedFloors = new Set([0, 2]);
      g.ai.placeAt(V(19, 0, 0.2), Math.PI / 2, 'IDLE');
      g.ai.aggression = 0.85;
      g.ai.forceChase(this.p);
      g.audio.play('ghostScream', { pos: V(19, 1.6, 0), volume: 1 });
    });
    g.checkpoint();
  }

  private applyLockdown(on: boolean): void {
    for (const id of ['mainL', 'mainR']) {
      const d = this.door(id);
      if (!d) continue;
      if (on) {
        d.setOpen(false, 6, id === 'mainR');
        d.setLocked('story');
      } else {
        d.unlock();
        d.setOpen(true, 1.5);
      }
    }
    this.g.world.ext.collapsible.setClosed(on);
  }

  private tryRitual(): void {
    const g = this.g;
    if (state.chapter < 5) {
      g.hud.toast('inspect.table217', 5);
      return;
    }
    const need = ['id_card', 'photo', 'diary'].filter((i) => !state.has(i));
    if (need.length) {
      g.hud.toast('msg.needItems');
      return;
    }
    if (!state.has('diya')) {
      g.hud.toast('msg.needDiya');
      this.objective('obj.findDiya');
      return;
    }
    for (const i of ['id_card', 'photo', 'diary', 'diya']) state.take(i);
    this.set('ritualDone');
    this.ritualGroup.visible = true;
    this.diyaFixture.forced = 1;
    g.audio.play('templeBell', { volume: 0.8 });
    g.ai.deactivate();
    bus.emit('musicState', { state: 'DISCOVERY' });
    this.scripted = true;
    this.after(1.5, () => this.say('“Ananya Rao. You can go home now.”', 4));
    this.after(5, () => {
      g.lighting.surgeFlicker(2);
      g.audio.play('ghostMoan', { pos: this.ritualGroup.position.clone().add(V(0, 1, 0)), volume: 1 });
      this.applyLockdown(false);
      this.wicketTarget = 1;
      this.objective('obj.escape');
      this.scripted = false;
      if (this.secretUnlocked()) this.inviteLift();
      g.checkpoint();
    });
    this.after(20, () => {
      if (state.ending) return;
      g.ai.activate(this.p, 0.95);
      bus.emit('musicState', { state: 'TENSION' });
    });
  }

  /** Secret path: the lift on the second floor opens on its own, lit, waiting. */
  private inviteLift(): void {
    const lift = this.g.world.lift;
    lift.forcePower = true;
    lift.revealThird();
    lift.snap('2');
    lift.openDoors();
    lift.dwell = 30;
    this.g.audio.play('liftDing', { pos: V(1.65, 8, 1.5), volume: 1 });
    this.after(2, () => this.say('The lift. It’s… waiting for me.', 4));
  }

  private goodEnding(): void {
    const ev = EVIDENCE_IDS.filter((i) => state.evidence.has(i) || state.has(i) || state.usedItems.has(i)).length;
    void ev;
    this.g.ending('good');
  }

  private secretEnding(): void {
    const g = this.g;
    this.scripted = true;
    g.audio.play('phoneNotify', { volume: 1 });
    this.say('One unsent message. 02:07, 14 November 2016.', 4);
    this.after(3.5, () => g.ending('secret'));
  }

  emergencyCall(): string[] | null {
    if (state.chapter < 2) return null;
    return ['…Kaveri hostel… hello?', '(static)', '…she is still in the lift…', '…the alarm… nobody comes…'];
  }

  onPhoto(): void {
    const ph = this.g.phonePhantom;
    if (!ph.visible) return;
    const cam = this.g.engine.camera;
    const to = ph.pos
      .clone()
      .setY(ph.pos.y + 1.4)
      .sub(cam.position);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    if (to.length() < 25 && to.normalize().dot(fwd) > 0.85) {
      this.set('photoGhost');
      this.g.audio.play('whisper1', { volume: 0.8 });
      this.g.hud.toast('In the photo: a girl in a stained kurta, standing exactly where you are looking. The corridor is empty.', 6);
      ph.vanish(2);
    }
  }

  private placePhonePhantom(): void {
    const ph = this.g.phonePhantom;
    if (state.chapter < 3 || state.chapter > 4) {
      ph.hide();
      return;
    }
    const f = this.g.player.floor;
    const pos = f >= 2 ? V(9.0, 6.8, 0.6) : V(2.0, 0, 0.6);
    if (ph.pos.distanceTo(pos) > 0.5 || !ph.visible) {
      ph.snapIn(pos, f >= 2 ? -Math.PI / 2 : Math.PI / 2);
      ph.play('standStill');
    }
  }

  onChase(on: boolean): void {
    if (on) this.g.hud.toast('RUN.', 1.5);
  }

  private findFan(roomId: string): THREE.Object3D | null {
    const pts = this.ctx.points.get(roomId.replace('room', 'room'));
    let best: THREE.Object3D | null = null;
    let bd = 3;
    const p = pts ?? null;
    if (!p) return null;
    this.ctx.scene.traverse((o) => {
      if (o.userData.forceSpin === undefined) return;
      const d = o.position.distanceTo(p.clone().setY(p.y + 3.2));
      if (d < bd) {
        bd = d;
        best = o;
      }
    });
    return best;
  }

  private tvOn(): void {
    const tv = this.obj('tvCommon');
    const scr = this.obj('tvCommonScreen') as THREE.Mesh | undefined;
    if (!tv || !scr) return;
    tv.userData.on = true;
    this.tvOnT = 6;
    const old = scr.material;
    scr.material = this.ctx.mats.emissive(0xb8c8d8, 1.4);
    this.g.audio.play('tvStatic', { pos: tv.getWorldPosition(new THREE.Vector3()).setY(1.2), volume: 0.8 });
    this.after(6, () => {
      tv.userData.on = false;
      scr.material = old;
      this.g.audio.play('switchClick', { pos: tv.getWorldPosition(new THREE.Vector3()), volume: 0.6 });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------------------------
  update(dt: number): void {
    const g = this.g;
    // Timers.
    for (const tm of [...this.timers]) {
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        tm.fn();
      }
    }
    if (g.mode !== 'play') return;
    // Triggers.
    for (const tr of this.triggers) {
      if (this.fired.has(tr.id) || state.flags.has(`trig:${tr.id}`)) continue;
      if (!tr.test()) continue;
      this.fired.add(tr.id);
      if (tr.persist !== false) state.flags.add(`trig:${tr.id}`);
      tr.run();
    }
    // Knocking from 217 while you look for it.
    if (state.chapter === 2 && state.objective === 'obj.knock') {
      this.knockT -= dt;
      if (this.knockT <= 0) {
        this.knockT = 14 + Math.random() * 8;
        const d = this.door('room217');
        if (d)
          for (let i = 0; i < 3; i++)
            this.after(i * 0.42, () => g.audio.play('knock', { pos: d.center.clone().add(V(0, 0, 0.3)), volume: 1 }));
      }
    }
    // Animated world reactions.
    if (this.wicketOpen !== this.wicketTarget) {
      this.wicketOpen += Math.sign(this.wicketTarget - this.wicketOpen) * Math.min(Math.abs(this.wicketTarget - this.wicketOpen), dt * 0.8);
      const w = g.world.ext.wicket;
      w.rotation.y = -1.25 * this.wicketOpen;
      const c = w.userData.collider as { enabled: boolean } | undefined;
      if (c) c.enabled = this.wicketOpen < 0.6;
    }
    if (this.bedNudge > 0 && this.bedNudge < 1) {
      const bed = this.obj('bed218');
      if (this.bedNudge === 0.0001) g.audio.play('doorOpen', { pos: bed?.getWorldPosition(new THREE.Vector3()), volume: 1, rate: 0.6 });
      this.bedNudge = Math.min(1, this.bedNudge + dt * 4);
      if (bed) bed.position.x += dt * 4 * 0.25 * (bed.rotation.y > 1 ? -1 : 1);
    }
    if (this.stallBurst > 0 && this.stallBurst < 1) {
      const st = this.obj('stall1');
      if (this.stallBurst === 0.0001) {
        g.audio.play('doorSlam', { pos: st?.getWorldPosition(new THREE.Vector3()), volume: 1 });
        bus.emit('scare', { kind: 'stall' });
      }
      this.stallBurst = Math.min(1, this.stallBurst + dt * 6);
      if (st) st.rotation.y -= dt * 6 * 1.6;
    }
    if (this.curtainPuff > 0 && this.curtainPuff < 1) {
      this.curtainPuff = Math.min(1, this.curtainPuff + dt * 0.4);
      const c = this.obj('curtain203') as THREE.Mesh | undefined;
      if (c) {
        // A shape presses through the curtain, then withdraws.
        const k = Math.sin(this.curtainPuff * Math.PI);
        const pos = c.geometry.getAttribute('position') as THREE.BufferAttribute;
        const base = c.userData.base as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const bump =
            Math.exp(-((x * x) / 0.05 + ((y + 0.9) * (y + 0.9)) / 0.25)) * 0.25 +
            Math.exp(-((x * x) / 0.02 + ((y + 0.35) * (y + 0.35)) / 0.02)) * 0.12;
          pos.setZ(i, base[i]! - bump * k);
        }
        pos.needsUpdate = true;
        c.geometry.computeVertexNormals();
      }
    }
    if (this.tvOnT > 0) this.tvOnT -= dt;
    if (this.liftScareT > 0) this.liftScareT -= dt;
    // Phone-camera phantom follows the player's floor.
    if (state.chapter >= 3 && state.chapter <= 4 && !this.flag('photoGhost')) this.placePhonePhantom();
    // Chapter 5: find the diya objective resolution.
    if (state.chapter === 5 && state.objective === 'obj.findDiya' && state.has('diya')) this.objective('obj.ritual');
    // CCTV-only phantom outside CCTV mode stays hidden.
    if (g.mode === 'play' && !g.cctv.active) g.cctvPhantom.hide();
    void this.finalChaseArmed;
  }

  // -------------------------------------------------------------------------------------------
  // Save / reset
  // -------------------------------------------------------------------------------------------
  resetWorld(): void {
    this.timers = [];
    this.fired.clear();
    this.scripted = false;
    this.noteList = [];
    power.restore({ GF: false, FF: false, SF: false, EXT: true, EMERGENCY: false, BATTERY: true, STREET: true });
    for (const [id, init] of this.initialDoors) {
      const d = this.door(id);
      if (!d) continue;
      d.setLocked(init.lock);
      d.snap(init.open);
    }
    for (const [id, o] of this.ctx.objects) {
      if (['id_card', 'photo', 'diary', 'final_evidence', 'diya', 'battery_security', 'battery_212', 'battery_study'].includes(id))
        o.visible = true;
    }
    this.ritualGroup.visible = false;
    this.diyaFixture.forced = 0;
    this.remains.visible = false;
    this.wicketOpen = this.wicketTarget = 0;
    const w = this.g.world.ext.wicket;
    w.rotation.y = 0;
    const c = w.userData.collider as { enabled: boolean } | undefined;
    if (c) c.enabled = true;
    this.g.world.ext.collapsible.setClosed(false);
    const lift = this.g.world.lift;
    lift.forcePower = false;
    lift.grilleLocked = false;
    lift.dwell = 6;
    const fan212 = this.findFan('room212');
    if (fan212) fan212.userData.forceSpin = 6.5;
    const fan217 = this.obj('fan217');
    if (fan217) fan217.userData.forceSpin = 0;
    this.bedNudge = this.stallBurst = this.curtainPuff = 0;
    this.g.phonePhantom.hide();
    this.g.mirrorPhantom.hide();
    this.g.cctvPhantom.hide();
    this.g.ai.aggression = 0.5;
    bus.emit('musicState', { state: 'NORMAL' });
  }

  /** Re-applies flag-derived world state after loading a save. */
  restore(): void {
    const g = this.g;
    for (const f of state.flags) {
      if (f.startsWith('took:')) {
        const o = this.obj(f.slice(5));
        if (o) o.visible = false;
      }
    }
    if (this.flag('liftScare')) this.set('liftScare');
    if (this.flag('trig:courtyard') || state.chapter > 1) {
      this.wicketOpen = this.wicketTarget = 1;
      g.world.ext.wicket.rotation.y = -1.25;
      const c = g.world.ext.wicket.userData.collider as { enabled: boolean } | undefined;
      if (c) c.enabled = false;
    }
    if (this.flag('power')) {
      const fan212 = this.findFan('room212');
      if (fan212) fan212.userData.forceSpin = 0;
    }
    if (this.flag('blackout')) {
      const fan = this.obj('fan217');
      if (fan) fan.userData.forceSpin = 7;
      if (!this.flag('ritualDone')) g.world.ext.collapsible.setClosed(true);
    }
    if (this.flag('ritualDone')) {
      this.ritualGroup.visible = true;
      this.diyaFixture.forced = 1;
      if (this.secretUnlocked()) this.inviteLift();
    }
    // Objectives list for the phone notes.
    this.noteList = state.objective ? [{ key: state.objective, done: false }] : [];
    const ch = state.chapter;
    if (ch === 4) {
      g.ai.allowedFloors = new Set([0, 2]);
      g.ai.activate(this.p, 0.35);
    }
    if (ch === 5) {
      g.ai.allowedFloors = new Set([0, 2]);
      this.after(6, () => g.ai.activate(this.p, this.flag('ritualDone') ? 0.95 : 0.8));
    }
    if (ch === 2 && state.objective === 'obj.knock') this.knockT = 8;
    bus.emit('musicState', { state: ch >= 3 ? 'TENSION' : 'NORMAL' });
    g.hud.chapterCard(t(`ch.${ch}`), t(`ch.${ch}.title`));
  }
}
