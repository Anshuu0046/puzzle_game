/**
 * In-world documents the player can read. Each page is a small HTML fragment rendered on a
 * styled paper sheet by the document reader. Story text is authored here (English); add other
 * languages by providing the same ids under a new key.
 */
export type DocStyle = 'diary' | 'typed' | 'newspaper' | 'register' | 'note' | 'report' | 'photo' | 'notice' | 'screen';

export interface DocDef {
  id: string;
  title: string;
  style: DocStyle;
  pages: string[];
}

const DOCS: Record<string, DocDef> = {
  note_breakers: {
    id: 'note_breakers',
    title: 'Note taped above the desk',
    style: 'note',
    pages: [
      `<p class="big">POWER TRIP?</p>
       <p>Don't touch anything except the main panel in the electrical room.</p>
       <p>Key is on the board — tag <b>ELEC / DB</b>.</p>
       <p class="big">MAIN first.<br/>Then <b>3 → 1 → 2</b></p>
       <p>If you do 2 before 3 it trips EVERYTHING again. Old wiring. Don't ask.</p>
       <p class="sign">— Raju</p>`,
    ],
  },
  register: {
    id: 'register',
    title: 'Hostel movement register',
    style: 'register',
    pages: [
      `<table>
        <tr><th>Date</th><th>Name</th><th>Room</th><th>Out</th><th>In</th><th>Sign</th></tr>
        <tr><td>02-11</td><td>K. Menon</td><td>203</td><td>18:10</td><td>21:40</td><td>K.M.</td></tr>
        <tr><td>02-11</td><td>S. Iyer</td><td>212</td><td>19:00</td><td>20:55</td><td>S.I.</td></tr>
        <tr><td>03-11</td><td>Home — Diwali break</td><td>ALL</td><td></td><td></td><td>Warden</td></tr>
        <tr><td>13-11</td><td><b>Ananya Rao</b></td><td>217</td><td>—</td><td>23:58</td><td>A.R.</td></tr>
        <tr><td>14-11</td><td><b>Ananya Rao</b></td><td>217</td><td>02:04</td><td></td><td></td></tr>
        <tr><td>14-11</td><td><b>Ananya Rao</b></td><td>217</td><td>02:04</td><td></td><td></td></tr>
        <tr><td>14-11</td><td><b>Ananya Rao</b></td><td>217</td><td>02:04</td><td></td><td></td></tr>
        <tr><td>—</td><td><b>Ananya Rao</b></td><td>217</td><td>02:07</td><td></td><td></td></tr>
      </table>
      <p class="hand red">The same name, again and again, in different ink. The last line is still wet.</p>`,
    ],
  },
  boothlog: {
    id: 'boothlog',
    title: 'Night watchman’s log',
    style: 'register',
    pages: [
      `<p class="hand">Rounds — Kaveri B</p>
       <p class="hand">23:00 All rooms locked. Students gone for break. Only me.</p>
       <p class="hand">00:40 Lights on 2nd floor flickering again. Told Estate 4 times.</p>
       <p class="hand">01:55 Lift alarm ringing. LIFT IS SEALED SINCE 2016. No power to it.</p>
       <p class="hand">02:07 Somebody walking upstairs. Not going inside. NOT going inside.</p>
       <p class="hand red">Going home. Let warden sir come himself.</p>`,
    ],
  },
  noticeboard: {
    id: 'noticeboard',
    title: 'Lobby notice board',
    style: 'notice',
    pages: [
      `<h3>NOTICE</h3><p>Room 217 shall remain sealed until further orders. Students are strictly prohibited from entering or tampering with the seal.</p><p class="sign">Chief Warden, R. Krishnamurthy</p>`,
      `<h3>MISSING</h3><p><b>ANANYA RAO</b>, B.Tech ECE III year, Room 217. Last seen 13-11-2016 night.</p><p>Any information may be given to the hostel office or the local police station.</p><p class="hand red">she never left</p>`,
      `<h3>LIFT</h3><p>The lift is OUT OF ORDER and has been decommissioned. Students must not use it under any circumstances.</p><p class="sign">Estate Office</p>`,
    ],
  },
  note216: {
    id: 'note216',
    title: 'Note on the desk in 216',
    style: 'note',
    pages: [
      `<p>Kavya —</p>
       <p>Don't bother asking R.K. for the 217 key. He keeps it in the steel cabinet in his office with that dial lock.</p>
       <p>Everybody knows his code. Same number on his cycle lock, his cupboard, everything. <b>The day she "left"</b>. He circles it on every calendar in this building like he wants to remember.</p>
       <p>Day, then month. Four digits.</p>
       <p>Please don't go in there. I can still hear the knocking at night.</p>
       <p class="sign">— P.</p>`,
    ],
  },
  notes217: {
    id: 'notes217',
    title: 'Notes pinned to the wall',
    style: 'note',
    pages: [
      `<p class="hand">Complaint #1 — lift jerks between 2 and terrace. Warden says "use stairs".</p>
       <p class="hand">Complaint #4 — generator diesel register doesn't match. 400 L "used" in a month with no power cuts??</p>
       <p class="hand">Complaint #6 — maintenance fee 2015-16 collected. NO maintenance done.</p>
       <p class="hand red">don't trust R.K.</p>`,
    ],
  },
  diary: {
    id: 'diary',
    title: 'Ananya’s diary',
    style: 'diary',
    pages: [
      `<p class="date">2 Aug 2016</p>
       <p>Third year. Room 217 again — same broken table, same fan that only works on speed 3. Divya says the room is unlucky. I say the room is cheap.</p>
       <p>Signal is terrible inside the block. The only place Amma's calls go through is the terrace. So, the terrace it is. Every night.</p>
       <span class="sym">☾</span>`,
      `<p class="date">19 Sep 2016</p>
       <p>The lift got stuck between 2 and the terrace landing with me inside for ten minutes. Alarm bell rang and rang. Nobody came. Raju anna said the warden told him to "ignore it, it's always ringing".</p>
       <p>Filed a complaint. Warden smiled and said "use the stairs, beta".</p>
       <span class="sym">✶</span>`,
      `<p class="date">27 Sep 2016</p>
       <p>Birthday! Priya and Kavya got me a cake from Lakshmi Sweets. We ate it on the terrace in the rain. Twenty.</p>
       <p>I keep the symbols in the margins for the study group code. Nobody else bothers to read the blackboard.</p>
       <span class="sym">△</span>`,
      `<p class="date">30 Oct 2016</p>
       <p>I looked at the generator diesel register in the office while R.K. was out. 400 litres "used" in October. There was ONE power cut. The maintenance money for the lift — collected from every one of us — the lift hasn't been serviced since 2014.</p>
       <p>I photocopied everything. I'm going to the Principal after Diwali.</p>
       <span class="sym">○</span>`,
      `<p class="date">13 Nov 2016</p>
       <p>Came back early from home. Hostel is empty. R.K. saw me at the gate and his face changed. He asked if I "still had those papers". I said yes.</p>
       <p>He said the power might go tonight.</p>
       <p>Amma will be awake. I'll call her from the terrace at 2.</p>`,
      `<p class="date">—</p>
       <p class="hand red">the lift stopped</p>
       <p class="hand red">the alarm is ringing nobody comes</p>
       <p class="hand red">its so dark</p>
       <p class="hand red">2:07</p>
       <p class="note">The rest of the pages are stuck together with something dark.</p>`,
    ],
  },
  photo: {
    id: 'photo',
    title: 'Photograph',
    style: 'photo',
    pages: [`<div class="photo"></div><p class="hand">me, Divya, Priya, Kavya — before everything</p><p class="hand">Aug 2016</p>`],
  },
  cctvLog: {
    id: 'cctvLog',
    title: 'CAM02_14112016_0204.avi',
    style: 'screen',
    pages: [
      `<p>02:04:11 — Subject (female, 20s, purple dupatta) walks east to west along ground floor corridor.</p>
       <p>02:04:40 — Subject calls lift. Car arrives. Subject enters.</p>
       <p>02:05:02 — Lift indicator: G → 1 → 2 → <b>3</b>.</p>
       <p>02:07:00 — Power fails. Emergency lighting does not activate.</p>
       <p>02:07:31 — Lift alarm. Alarm continues until 03:12.</p>
       <p>03:40:15 — Male figure (warden) enters frame with a torch. Looks up at the lift indicator. Leaves.</p>
       <p>04:55:02 — Two men carry cement bags up the stairs.</p>
       <p class="red">END OF RECORDING</p>`,
    ],
  },
  incident: {
    id: 'incident',
    title: 'CONFIDENTIAL — Warden’s incident log',
    style: 'report',
    pages: [
      `<h3>14-11-2016</h3>
       <p>02:07 — Power failure, Block B. Generator could not be started (no diesel).</p>
       <p>02:30 — Raju reports lift alarm. Instructed him the lift is "out of order" and to ignore. Told him to go home.</p>
       <p>03:40 — Checked lift. Indicator shows terrace landing. Did not open.</p>
       <p>04:30 — Called Murugan (contractor). Terrace landing to be bricked "for safety". Cash, no bill.</p>`,
      `<h3>15-11-2016</h3>
       <p>Informed Principal: student A. Rao "left the hostel without permission, likely went home". Room 217 sealed pending enquiry.</p>
       <p>Lift officially decommissioned w.e.f. today.</p>
       <p>Diesel register corrected. Maintenance file removed.</p>
       <p class="red">She had the photocopies. Not found in room. Must check terrace.</p>
       <p class="sign">— R. Krishnamurthy</p>`,
    ],
  },
  studentfile: {
    id: 'studentfile',
    title: 'Student record — 14EC217',
    style: 'typed',
    pages: [
      `<table class="kv">
        <tr><td>Name</td><td>ANANYA RAO</td></tr>
        <tr><td>Roll No.</td><td>14EC217</td></tr>
        <tr><td>Branch</td><td>Electronics &amp; Communication</td></tr>
        <tr><td>Date of birth</td><td>27-09-1996</td></tr>
        <tr><td>Hostel</td><td>Kaveri B — Room 217</td></tr>
        <tr><td>CGPA</td><td>9.12</td></tr>
        <tr><td>Remarks</td><td>Class representative. Filed 6 complaints re: hostel maintenance (2016).</td></tr>
        <tr><td>Status</td><td class="red">"LEFT WITHOUT INTIMATION" — 15-11-2016 (stamp, warden)</td></tr>
       </table>`,
    ],
  },
  oldregister: {
    id: 'oldregister',
    title: 'Hostel register, 2016',
    style: 'register',
    pages: [
      `<table><tr><th>Room</th><th>Name</th><th>Remarks</th></tr>
       <tr><td>216</td><td>Kavya N.</td><td>Vacated 18-11-2016 (on request)</td></tr>
       <tr><td>217</td><td>Ananya Rao</td><td>—</td></tr>
       <tr><td>217</td><td>Ananya Rao</td><td>—</td></tr>
       <tr><td>217</td><td>Ananya Rao</td><td>—</td></tr>
       <tr><td>217</td><td>Ananya Rao</td><td>—</td></tr>
       <tr><td>217</td><td>Ananya Rao</td><td>—</td></tr>
       <tr><td>218</td><td>Divya S.</td><td>Vacated 20-11-2016 (on request)</td></tr></table>
       <p class="hand red">Every page from November onward has only her name on it. Page after page after page.</p>`,
    ],
  },
  newspaper: {
    id: 'newspaper',
    title: 'The Deccan Evening Post — 17 Nov 2016',
    style: 'newspaper',
    pages: [
      `<h2>Engineering student goes missing from college hostel</h2>
       <h4>Family alleges negligence; college says she "left on her own"</h4>
       <p>Ananya Rao (20), a third-year Electronics student of Vidyanagar Institute of Technology, has been missing since Monday, her family said. Hostel authorities maintain that the student left Kaveri Hostel without informing the office.</p>
       <p>"She called me every night from the terrace at two o'clock, because there is no signal anywhere else. That night the call never came," her mother told this paper.</p>
       <p>The college has denied any lapse. Police have registered a missing person case.</p>`,
    ],
  },
};

export function getDoc(id: string): DocDef | undefined {
  return DOCS[id];
}

export const DOC_IDS = Object.keys(DOCS);
