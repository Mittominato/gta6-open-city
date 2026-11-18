// Missions and the story of Solmar Bay.
// Rook is new in town and owes Mara Voss a favour. Three jobs, chained:
// a courier run, a small heist, and a getaway to the pier. Each mission is
// a chain of steps with a marker in the world; the HUD shows the current
// objective and the distance to it, and the minimap shows a blip.
import { CFG, MISSIONS, SPOTS } from './config.js';

/** Create the mission tracker. `onEvent` is called for story moments. */
export function createMissions(onEvent) {
  let index = -1; // -1: no mission yet; 0..2: mission running; 3: story done
  let step = 0;
  let timer = 0;
  let holdProgress = 0;
  let done = [];
  let failed = false;

  function current() {
    if (index < 0 || index >= MISSIONS.length) return null;
    return MISSIONS[index];
  }

  function start(i) {
    index = i;
    step = 0;
    timer = i === 0 ? CFG.MISSION_1_TIMER : 0;
    holdProgress = 0;
    failed = false;
    const m = MISSIONS[i];
    onEvent({ type: 'mission-start', mission: m });
  }

  /** The world position of the current step's marker, or null. */
  function targetPos() {
    const m = current();
    if (!m) return null;
    const s = m.steps[step];
    if (!s) return null;
    return SPOTS[s.spot];
  }

  function objectiveText() {
    const m = current();
    if (!m) {
      if (index >= MISSIONS.length) return 'Story complete — Solmar Bay is yours. Free roam!';
      return 'Talk to Mara Voss — start the story from the menu';
    }
    const s = m.steps[step];
    if (!s) return m.title;
    if (s.hold && holdProgress > 0) {
      return `${s.label} — ${Math.ceil(CFG.ROBBERY_HOLD_SECONDS - holdProgress)}s`;
    }
    return s.label;
  }

  /**
   * Advance the mission chain. Returns an event object when something
   * notable happens (step done, mission done, timer out), else null.
   */
  function update(dt, playerPos, playerOnFoot) {
    const m = current();
    if (!m) return null;
    if (timer > 0) {
      timer -= dt;
      if (timer <= 0) {
        failed = true;
        onEvent({ type: 'mission-failed', mission: m, reason: 'Out of time' });
        return { type: 'mission-failed', mission: m };
      }
    }
    const s = m.steps[step];
    if (!s) return null;
    const target = SPOTS[s.spot];
    const d = Math.hypot(playerPos.x - target.x, playerPos.z - target.z);
    if (s.hold) {
      if (d < s.radius && playerOnFoot) {
        holdProgress += dt;
        if (holdProgress >= CFG.ROBBERY_HOLD_SECONDS) {
          holdProgress = 0;
          return advance();
        }
      } else {
        holdProgress = Math.max(0, holdProgress - dt * 2);
      }
      return null;
    }
    if (d < s.radius) return advance();
    return null;
  }

  function advance() {
    const m = current();
    step += 1;
    if (step >= m.steps.length) {
      const reward = CFG.MISSION_REWARDS[index];
      done.push(m.id);
      onEvent({ type: 'mission-done', mission: m, reward });
      const next = index + 1;
      if (next < MISSIONS.length) {
        start(next);
        return { type: 'mission-done', mission: m, reward, next: MISSIONS[next] };
      }
      index = MISSIONS.length;
      onEvent({ type: 'story-done' });
      return { type: 'story-done', mission: m, reward };
    }
    onEvent({ type: 'step-done', mission: m, step });
    return { type: 'step-done', mission: m, step };
  }

  return {
    start, update, targetPos, objectiveText, current,
    get index() { return index; },
    get step() { return step; },
    get timer() { return timer; },
    get done() { return done; },
    get failed() { return failed; },
    /** Restart the current mission after a failure. */
    retry() {
      if (index >= 0 && index < MISSIONS.length) start(index);
    },
  };
}
