import * as THREE from 'three';
import type { Rect } from './coords';

/** Low-res pixels per board square: about one sprite texel per pixel, like the original Doom sprites. */
const PIXELS_PER_SQUARE = 72;

/**
 * Draws the scene into a low-resolution target and scales it up with hard edges, so the 3D board,
 * the particles and the pixel-art pieces all share one chunky pixel grid.
 */
export class PixelPass {
  readonly target: THREE.WebGLRenderTarget;
  /** Low-res pixels per css pixel. */
  private scale = 1;
  private cssHeight = 1;
  private readonly screen = new THREE.Scene();
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    // Half-float keeps dark gradients (Underworld fog) from banding; fall back to bytes where unsupported.
    const floatTargets = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      type: floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });
    const upscale = new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false });
    this.screen.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), upscale));
  }

  /** Sizes the target for a canvas of css size `width` × `height` that shows `visibleSquares` squares top to bottom. */
  resize(width: number, height: number, visibleSquares: number): void {
    const pixelRatio = this.renderer.getPixelRatio();
    const factor = Math.max(1, Math.round((height * pixelRatio) / visibleSquares / PIXELS_PER_SQUARE));
    this.scale = pixelRatio / factor;
    this.cssHeight = height;
    this.target.setSize(Math.ceil(width * this.scale), Math.ceil(height * this.scale));
  }

  /** Fills the whole low-res canvas with one color. */
  clear(color: number): void {
    this.useRegion();
    this.renderer.setClearColor(color, 1);
    this.renderer.clear();
  }

  /** Renders `camera`'s view into a css-pixel rectangle of the canvas (top-left origin), or into all of it. */
  render(scene: THREE.Scene, camera: THREE.Camera, rect?: Rect): void {
    this.useRegion(rect);
    this.renderer.render(scene, camera);
  }

  /** Scales the finished low-res image up onto the canvas. */
  present(): void {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.screen, this.screenCamera);
  }

  private useRegion(rect?: Rect): void {
    const target = this.target;
    if (rect) {
      const x = Math.round(rect.x * this.scale), w = Math.round(rect.w * this.scale), h = Math.round(rect.h * this.scale);
      const y = Math.round((this.cssHeight - rect.y - rect.h) * this.scale);
      target.viewport.set(x, y, w, h);
      target.scissor.set(x, y, w, h);
      target.scissorTest = true;
    } else {
      target.viewport.set(0, 0, target.width, target.height);
      target.scissorTest = false;
    }
    this.renderer.setRenderTarget(target); // applies the target's viewport and scissor
  }
}
