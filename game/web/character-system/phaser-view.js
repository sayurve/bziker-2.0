import { validateCharacterDefinition } from './definition.js';

/** A Container of Images: no per-layer animations, sizing or independent clocks. */
export class PhaserCharacterView {
 #definition; #scene; #images = []; #signature = null; #destroyed = false;
 constructor(scene, definition, { x = 0, y = 0, scale = 1, allowDraft = false } = {}) {
  this.#definition = validateCharacterDefinition(definition, { allowDraft }); this.#scene = scene;
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) throw new TypeError('View position must be finite and uniform scale positive');
  this.container = scene.add.container(x, y); this.container.setScale(scale);
 }
 #preflight(layers) {
  const d = this.#definition;
  for (const layer of layers) {
   if (!this.#scene.textures.exists(layer.texture)) throw new Error(`Missing character texture: ${layer.texture}`);
   const texture = this.#scene.textures.get(layer.texture);
   if (layer.frame !== null && !texture.has(layer.frame)) throw new Error(`Missing character frame: ${layer.texture}/${layer.frame}`);
   const frame = texture.get(layer.frame === null ? undefined : layer.frame);
   if (!frame || frame.realWidth !== d.canvas.width || frame.realHeight !== d.canvas.height) throw new Error(`Character frame must preserve logical canvas ${d.canvas.width}x${d.canvas.height}: ${layer.texture}/${layer.frame}`);
  }
 }
 /** Preflight the entire candidate outfit before the controller commits it. */
 preflightOutfit(outfit) {
  if (this.#destroyed) throw new Error('Character view is destroyed');
  const d = this.#definition;
  for (const [key, pose] of Object.entries(d.poses)) this.#preflight(d.layers.map(id => outfit?.layers[id]?.[key] ?? pose.layers[id]));
  return this;
 }
 apply(snapshot) {
  if (this.#destroyed) throw new Error('Character view is destroyed');
  const d = this.#definition;
  if (snapshot.modelId !== d.id || snapshot.canvas.width !== d.canvas.width || snapshot.canvas.height !== d.canvas.height || snapshot.anchor.x !== d.anchor.x || snapshot.anchor.y !== d.anchor.y) throw new TypeError('Snapshot model/canvas/anchor mismatch');
  const pose = d.poses[snapshot.poseKey], order = d.layerOrder[snapshot.direction];
  if (!pose || snapshot.poseKey !== `${snapshot.action}/${snapshot.direction}/${snapshot.frameIndex}` || !Array.isArray(snapshot.layers) || snapshot.layers.length !== order?.length || !snapshot.layers.every((layer, i) => layer.id === order[i])) throw new TypeError('Snapshot pose/layer order mismatch');
  this.#preflight(snapshot.layers);
  const signature = JSON.stringify(snapshot.layers);
  if (signature === this.#signature) return this;
  const staged = [];
  try {
   for (const layer of snapshot.layers) {
    const image = this.#scene.add.image(0, 0, layer.texture, layer.frame === null ? undefined : layer.frame); staged.push(image);
    image.setOrigin(d.anchor.x / d.canvas.width, d.anchor.y / d.canvas.height);
   }
   this.container.add(staged);
  } catch (error) {
   this.container.remove(staged, false); for (const image of staged) image.destroy(); throw error;
  }
  const old = this.#images; this.#images = staged; this.#signature = signature;
  this.container.remove(old, true); return this;
 }
 setPosition(x, y) { if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Position must be finite'); this.container.setPosition(x, y); return this; }
 destroy() {
  if (this.#destroyed) return;
  this.#destroyed = true; this.container.remove(this.#images, true); this.#images = [];
  // Detach foreign children before Phaser Container.destroy cascades destruction.
  this.container.remove([...this.container.list], false); this.container.destroy();
 }
}
