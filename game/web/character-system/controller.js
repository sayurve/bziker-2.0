import {advanceDistancePhase} from './clock.js';
import { validateCharacterDefinition, validateOutfit, poseKey, freezeCharacterData } from './definition.js';

/** Owns all clocks. Views only consume a single immutable snapshot. */
export class CharacterController {
 #definition; #outfit = null; #action = 'idle'; #direction = 'down'; #elapsed = 0; #distance = 0; #reducedMotion; #options;
 constructor(definition, { outfit = null, allowDraft = false, reducedMotion = false } = {}) {
  this.#options = { allowDraft }; this.#definition = validateCharacterDefinition(definition, this.#options); this.#reducedMotion = Boolean(reducedMotion);
  if (outfit) this.#outfit = validateOutfit(this.#definition, outfit, this.#options);
 }
 get definition() { return this.#definition; }
 get outfit() { return this.#outfit; }
 get snapshot() { return this.#snapshot(this.#outfit); }
 #snapshot(outfit) {
  const d = this.#definition, clip = d.actions[this.#action];
  const total = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const phase = clip.distancePerCycle !== undefined ? this.#distance / clip.distancePerCycle : this.#elapsed / total;
  let frameIndex = 0;
  if (!this.#reducedMotion) {
   if (clip.distancePerCycle !== undefined) frameIndex = Math.min(clip.frames.length - 1, Math.floor(phase * clip.frames.length));
   else { let end = 0; frameIndex = clip.frames.length - 1; for (let i = 0; i < clip.frames.length; i++) { end += clip.frames[i].durationMs; if (this.#elapsed < end) { frameIndex = i; break; } } }
  }
  const key = poseKey(this.#action, this.#direction, frameIndex), pose = d.poses[key];
  return freezeCharacterData({ modelId: d.id, mode: d.mode, action: this.#action, direction: this.#direction, frameIndex, poseKey: key, phase, complete: !clip.loop && this.#elapsed >= total, outfitId: outfit?.id ?? null, canvas: d.canvas, anchor: d.anchor, attachments: pose.attachments, layers: d.layerOrder[this.#direction].map(id => ({ id, ...(outfit?.layers[id]?.[key] ?? pose.layers[id]) })) });
 }
 setState({ action = this.#action, direction = this.#direction } = {}) {
  if (!Object.hasOwn(this.#definition.actions, action)) throw new TypeError(`Unknown character action ${action}`);
  if (!this.#definition.directions.includes(direction)) throw new TypeError(`Unknown character direction ${direction}`);
  if (action !== this.#action) { this.#elapsed = 0; this.#distance = 0; }
  this.#action = action; this.#direction = direction; return this.snapshot;
 }
 advance({ deltaMs = 0, distance = 0 } = {}) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0 || !Number.isFinite(distance) || distance < 0) throw new TypeError('deltaMs and distance must be finite and nonnegative');
  const clip = this.#definition.actions[this.#action];
  if (clip.distancePerCycle !== undefined) {
   if (!this.#reducedMotion) this.#distance = advanceDistancePhase(this.#distance,distance,clip.distancePerCycle);
  } else {
   const total = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
   this.#elapsed = clip.loop ? advanceDistancePhase(this.#elapsed,deltaMs,total) : (deltaMs>=total-this.#elapsed?total:this.#elapsed+deltaMs);
  }
  return this.snapshot;
 }
 stop() { this.#elapsed = 0; this.#distance = 0; this.#action = 'idle'; return this.snapshot; }
 teleport({ direction = this.#direction } = {}) {
  if (!this.#definition.directions.includes(direction)) throw new TypeError(`Unknown character direction ${direction}`);
  this.#direction = direction; return this.stop();
 }
 setReducedMotion(enabled) { this.#reducedMotion = Boolean(enabled); this.#elapsed = 0; this.#distance = 0; return this.snapshot; }
 /** With a view, loading/render errors leave both the visible outfit and controller unchanged. */
 setOutfit(outfit, view = null) {
  const candidate = outfit === null ? null : validateOutfit(this.#definition, outfit, this.#options);
  const snapshot = this.#snapshot(candidate);
  if (view) { view.preflightOutfit?.(candidate); view.apply(snapshot); }
  this.#outfit = candidate; return snapshot;
 }
}
