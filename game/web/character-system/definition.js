/** Authored character data. Validation is structural; it never approves artwork. */
export const DIRECTIONS = Object.freeze(['down', 'left', 'right', 'up']);
export const poseKey = (action, direction, frameIndex) => `${action}/${direction}/${frameIndex}`;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = message => { throw new TypeError(`Character definition: ${message}`); };
const object = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail(`${label} must be an object`); return v; };
const name = (v, label) => { if (typeof v !== 'string' || !v.trim() || v.includes('/') || ['__proto__', 'constructor', 'prototype'].includes(v)) fail(`${label} must be a nonempty identifier without /`); };
const positive = (v, label) => { if (!Number.isFinite(v) || v <= 0) fail(`${label} must be positive and finite`); };
const point = (v, label) => { object(v, label); if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) fail(`${label} requires finite x/y`); };
const approval = (v, options) => { if (v.status !== 'approved' && !(options.allowDraft === true && v.status === 'draft')) fail('status must be approved (draft requires explicit allowDraft)'); };
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === b.length && b.every(k => a.includes(k));
export function freezeCharacterData(value) {
 if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const entry of Object.values(value)) freezeCharacterData(entry); Object.freeze(value); }
 return value;
}
function reference(value, label) {
 object(value, label);
 if (typeof value.texture !== 'string' || !value.texture.trim()) fail(`${label} requires texture key`);
 if (!own(value, 'frame') || !(value.frame === null || typeof value.frame === 'string' && value.frame.length > 0 || Number.isInteger(value.frame) && value.frame >= 0)) fail(`${label} requires explicit frame (null for full PNG)`);
 for (const key of Object.keys(value)) if (!['texture', 'frame'].includes(key)) fail(`${label}: unsupported per-frame ${key}; use constant logical canvas and anchor`);
}
export function validateCharacterDefinition(value, options = {}) {
 object(value, 'model'); name(value.id, 'id'); approval(value, options);
 if (!['layered', 'legacy-composite'].includes(value.mode)) fail('mode must be layered or legacy-composite');
 object(value.canvas, 'canvas'); positive(value.canvas.width, 'canvas.width'); positive(value.canvas.height, 'canvas.height');
 if (!Number.isInteger(value.canvas.width) || !Number.isInteger(value.canvas.height)) fail('canvas dimensions must be integer pixels');
 point(value.anchor, 'anchor');
 if (value.anchor.x < 0 || value.anchor.x > value.canvas.width || value.anchor.y < 0 || value.anchor.y > value.canvas.height) fail('anchor must lie on logical canvas');
 if (!Array.isArray(value.layers) || !value.layers.length || new Set(value.layers).size !== value.layers.length) fail('layers must contain distinct identifiers');
 value.layers.forEach(id => name(id, 'layer'));
 if (value.mode === 'legacy-composite' && value.layers.length !== 1) fail('legacy-composite has exactly one complete-pose layer');
 if (!sameSet(value.directions, DIRECTIONS)) fail('four authored directions required: down,left,right,up');
 object(value.layerOrder, 'layerOrder');
 for (const dir of DIRECTIONS) if (!sameSet(value.layerOrder[dir], value.layers)) fail(`layerOrder.${dir} must include each layer exactly once`);
 object(value.actions, 'actions');
 if (!own(value.actions, 'idle') || !own(value.actions, 'walk')) fail('idle and walk actions required');
 object(value.poses, 'poses');
 const expected = []; let attachmentNames = null;
 for (const [action, clip] of Object.entries(value.actions)) {
  name(action, 'action'); object(clip, action);
  if (typeof clip.loop !== 'boolean') fail(`${action}.loop must be boolean`);
  if (!Array.isArray(clip.frames) || !clip.frames.length) fail(`${action} requires frames`);
  for (const frame of clip.frames) { object(frame, 'frame duration'); positive(frame.durationMs, `${action}.durationMs`); }
  if (!Number.isFinite(clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0))) fail(`${action} duration overflows`);
  if (action === 'walk' || own(clip, 'distancePerCycle')) {
   positive(clip.distancePerCycle, `${action}.distancePerCycle`);
   if (!clip.loop) fail(`${action} distance clock must loop`);
  }
  for (const dir of DIRECTIONS) for (let i = 0; i < clip.frames.length; i++) {
   const key = poseKey(action, dir, i); expected.push(key); const pose = value.poses[key]; object(pose, `pose ${key}`); object(pose.layers, `${key}.layers`);
   if (!sameSet(Object.keys(pose.layers), value.layers)) fail(`${key} must cover every model layer`);
   for (const id of value.layers) reference(pose.layers[id], `${key}/${id}`);
   object(pose.attachments, `${key}.attachments`);
   if (attachmentNames === null) attachmentNames = Object.keys(pose.attachments);
   if (!sameSet(Object.keys(pose.attachments), attachmentNames)) fail(`${key} requires the same named attachments as every pose`);
   for (const [id, p] of Object.entries(pose.attachments)) { name(id, 'attachment'); point(p, `${key}/${id}`); }
  }
 }
 if (!sameSet(Object.keys(value.poses), expected)) fail('poses must exactly cover action/direction/frame keys');
 return freezeCharacterData(structuredClone(value));
}
export function validateOutfit(definition, value, options = {}) {
 const d = validateCharacterDefinition(definition, options);
 object(value, 'outfit'); name(value.id, 'outfit.id'); approval(value, options);
 if (value.modelId !== d.id) fail(`outfit ${value.id} is incompatible with model ${d.id}`);
 object(value.layers, 'outfit.layers');
 if (!Object.keys(value.layers).length) fail('outfit must replace at least one declared layer');
 for (const [id, poses] of Object.entries(value.layers)) {
  if (!d.layers.includes(id)) fail(`outfit layer ${id} does not belong to model`);
  object(poses, `outfit ${id}`);
  if (!sameSet(Object.keys(poses), Object.keys(d.poses))) fail(`outfit ${id} requires complete pose coverage`);
  for (const [key, ref] of Object.entries(poses)) reference(ref, `outfit ${id}/${key}`);
 }
 return freezeCharacterData(structuredClone(value));
}
