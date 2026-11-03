import * as THREE from 'three';
import type { BoardId } from '../../rules';
import { SpriteSheet, SpriteTag, paletteTexture } from './sheets';

const VERTEX = /* glsl */ `
uniform vec4 uvRect;     // atlas rect: u, v of the bottom-left corner, then width and height (negative = mirrored)
uniform vec2 frameSize;  // world units
uniform vec2 anchor;     // feet position inside the frame, 0-1 from the left and from the bottom
uniform float roll;      // screen-space rotation, so a toppling or spinning piece still reads
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uvRect.xy + uv * uvRect.zw;
  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 worldScale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vec2 corner = (position.xy + 0.5 - anchor) * frameSize * worldScale;
  float c = cos(roll), s = sin(roll);
  mvPosition.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D indexMap;
uniform sampler2D paletteMap;
uniform float paletteRow;
uniform vec3 tint;
uniform vec3 emissive;
uniform float emissiveIntensity;
uniform float opacity;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main() {
  float index = floor(texture2D(indexMap, vUv).r * 255.0 + 0.5);
  vec4 color = texture2D(paletteMap, vec2((index + 0.5) / 256.0, paletteRow));
  if (color.a < 0.5) discard;
  gl_FragColor = vec4(color.rgb * tint + emissive * emissiveIntensity, opacity);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * Palette-swapped pixel sprite. Exposes `color`, `emissive` and `emissiveIntensity` like the toon
 * material of the 3D pieces, so the capture reactions (burn, zap) work on both.
 */
export class PixelSpriteMaterial extends THREE.ShaderMaterial {
  constructor(sheet: SpriteSheet) {
    super({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        indexMap: { value: sheet.texture },
        paletteMap: { value: paletteTexture },
        paletteRow: { value: 0 },
        uvRect: { value: new THREE.Vector4() },
        frameSize: { value: new THREE.Vector2() },
        anchor: { value: new THREE.Vector2() },
        roll: { value: 0 },
        tint: { value: new THREE.Color(0xffffff) },
        emissive: { value: new THREE.Color(0x000000) },
        emissiveIntensity: { value: 0 },
        opacity: { value: 1 },
      },
    });
    // Pull the sprite a little toward the camera so its feet never flicker against the floor.
    this.polygonOffset = true;
    this.polygonOffsetUnits = -4;
  }

  get color(): THREE.Color { return this.uniforms.tint.value; }
  get emissive(): THREE.Color { return this.uniforms.emissive.value; }
  get emissiveIntensity(): number { return this.uniforms.emissiveIntensity.value; }
  set emissiveIntensity(value: number) { this.uniforms.emissiveIntensity.value = value; }
}

const quad = new THREE.PlaneGeometry(1, 1);
const facing = new THREE.Vector3();
const view = new THREE.Vector3();
const up = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();

/**
 * A piece drawn as a camera-facing pixel sprite, Doom style: the body's +z axis is where the piece
 * faces, and every camera that draws it picks the matching one of 8 viewing angles.
 */
export class SpriteBody extends THREE.Mesh<THREE.PlaneGeometry, PixelSpriteMaterial> {
  readonly isSpriteBody = true;
  tag: SpriteTag = 'idle';
  step = 0;
  private lastRotation = 0;

  constructor(readonly sheet: SpriteSheet, options: { ghost?: boolean } = {}) {
    super(quad, new PixelSpriteMaterial(sheet));
    this.frustumCulled = false; // the quad is resized in the shader, so its bounds would lie
    if (options.ghost) {
      this.material.transparent = true;
      this.material.depthTest = false;
      this.material.uniforms.opacity.value = 0.45;
      this.renderOrder = 20;
    }
  }

  /** Team colors for a board (Overworld or Underworld look). Also clears burn and zap tints. */
  setLook(color: 0 | 1, board: BoardId): void {
    this.material.uniforms.paletteRow.value = this.sheet.rowCenter(color, board);
    this.material.color.setHex(0xffffff);
    this.material.emissive.setHex(0x000000);
    this.material.emissiveIntensity = 0;
  }

  /** Shows a step of an animation (clamped to its length; tags a sheet lacks fall back to idle). */
  pose(tag: SpriteTag, step = 0): void {
    this.tag = tag;
    this.step = step;
    // Floating pieces hover, but their corpse lies on the floor.
    this.position.y = tag === 'death' ? 0 : (this.sheet.data?.hover ?? 0);
  }

  /** Number of steps in an animation (0 if the sheet does not have it or is not loaded yet). */
  steps(tag: SpriteTag): number { return this.sheet.data?.tags[tag]?.steps.length ?? 0; }

  /** Step on which an attack animation lands. */
  contact(tag: SpriteTag): number { return this.sheet.data?.tags[tag]?.contact ?? 0; }

  override onBeforeRender = (_renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera): void => {
    const data = this.sheet.data;
    const u = this.material.uniforms;
    if (!data) { u.frameSize.value.set(0, 0); return; }
    if (this.position.y === 0 && this.tag !== 'death' && data.hover) this.position.y = data.hover; // loaded after pose()
    const tag = data.tags[this.tag] ?? data.tags.idle!;
    const [frameIndex, mirrored] = tag.steps[Math.min(this.step, tag.steps.length - 1)][this.rotationFor(camera)];
    const frame = data.frames[frameIndex];
    const { w: width, h: height } = data.size;
    u.uvRect.value.set(
      (mirrored ? frame.x + frame.w : frame.x) / width, (frame.y + frame.h) / height,
      (mirrored ? -frame.w : frame.w) / width, -frame.h / height,
    );
    u.frameSize.value.set(frame.w * data.unitsPerTexel, frame.h * data.unitsPerTexel);
    const anchorX = frame.ax / frame.w;
    u.anchor.value.set(mirrored ? 1 - anchorX : anchorX, 1 - frame.ay / frame.h);
    u.roll.value = this.rollFor(camera);
  };

  /** Doom rotation index 0-7 (front, front-left, left, back-left, back, back-right, right, front-right). */
  private rotationFor(camera: THREE.Camera): number {
    this.getWorldDirection(facing).setY(0);
    if (facing.lengthSq() < 0.05) return this.lastRotation; // lying flat: keep the last angle
    facing.normalize();
    camera.getWorldDirection(view).setY(0);
    if (view.lengthSq() < 1e-4) view.setFromMatrixColumn(camera.matrixWorld, 1).setY(0); // straight down: screen-up is "away"
    view.normalize();
    const towardCamera = -facing.dot(view);
    const towardViewerLeft = facing.x * view.z - facing.z * view.x; // facing · (-right), right = (-view.z, 0, view.x)
    const angle = Math.atan2(towardViewerLeft, towardCamera);
    this.lastRotation = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    return this.lastRotation;
  }

  /** How far the body's up axis leans on screen, so tilts and tumbles from the 3D animations still show. */
  private rollFor(camera: THREE.Camera): number {
    up.setFromMatrixColumn(this.matrixWorld, 1).normalize();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const x = up.dot(cameraRight), y = up.dot(cameraUp);
    return x * x + y * y < 0.04 ? 0 : Math.atan2(-x, y);
  }
}

export const isSpriteBody = (object: THREE.Object3D | undefined): object is SpriteBody =>
  !!object && (object as Partial<SpriteBody>).isSpriteBody === true;
