import * as THREE from 'three';
import {
  ApplyForce, BatchedRenderer, Bezier, ConeEmitter, ConstantColor, ConstantValue, IntervalValue,
  ParticleSystem, PiecewiseBezier, SizeOverLife, Vector3, Vector4,
} from 'three.quarks';
import { Easing, start, tween } from './tween';

export type Palette = 'ember' | 'gold' | 'violet';
const COLORS: Record<Palette, [number, number, number]> = {
  ember: [1, 0.42, 0.1],
  gold: [1, 0.85, 0.4],
  violet: [0.62, 0.35, 1],
};

const softTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

const crackTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.translate(64, 64);
  g.lineCap = 'round';
  for (const [w, color] of [[7, 'rgba(255,90,20,0.55)'], [3, 'rgba(15,5,5,0.95)']] as [number, string][]) {
    seed = 7;
    g.strokeStyle = color;
    g.lineWidth = w;
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
      let x = 0, y = 0;
      g.beginPath();
      g.moveTo(0, 0);
      for (let s = 0; s < 4; s++) {
        a += (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * (10 + rnd() * 10);
        y += Math.sin(a) * (10 + rnd() * 10);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  return new THREE.CanvasTexture(c);
})();

/** Particles (three.quarks), cracks, light columns and flashes. */
export class Fx {
  batch = new BatchedRenderer();
  /** Real-time deadline (ms) until which particles may still be alive. */
  busyUntil = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.batch);
  }

  update(dtSeconds: number): void { this.batch.update(dtSeconds); }

  get active(): boolean { return performance.now() < this.busyUntil; }

  burst(at: THREE.Vector3, palette: Palette, count = 36, opts: { speed?: number; spread?: number; life?: number } = {}): void {
    const [r, g, b] = COLORS[palette];
    const life = opts.life ?? 1;
    const ps = new ParticleSystem({
      duration: 1,
      looping: false,
      autoDestroy: true,
      worldSpace: true,
      startLife: new IntervalValue(0.45 * life, 1.0 * life),
      startSpeed: new IntervalValue(0.8 * (opts.speed ?? 1), 2.6 * (opts.speed ?? 1)),
      startSize: new IntervalValue(0.07, 0.17),
      startColor: new ConstantColor(new Vector4(r, g, b, 1) as never),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [{ time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 }],
      shape: new ConeEmitter({ radius: 0.28, angle: opts.spread ?? Math.PI / 4, thickness: 1, arc: Math.PI * 2 }),
      behaviors: [
        new ApplyForce(new Vector3(0, 1, 0) as never, new ConstantValue(1.6)),
        new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])),
      ],
      material: new THREE.MeshBasicMaterial({
        map: softTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }),
      renderOrder: 40,
    });
    ps.emitter.position.copy(at);
    ps.emitter.rotation.x = -Math.PI / 2; // cone fires along +z; point it up
    this.scene.add(ps.emitter);
    this.batch.addSystem(ps);
    this.busyUntil = Math.max(this.busyUntil, performance.now() + 1400 * life);
    setTimeout(() => { this.scene.remove(ps.emitter); }, 1800 * life);
  }

  /** Cracks a tile: a glowing fissure that fades in, lingers, then fades out. */
  crack(parent: THREE.Object3D, x: number, z: number): void {
    const mat = new THREE.MeshBasicMaterial({
      map: crackTexture, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2), mat);
    mesh.position.set(x, 0.025, z);
    mesh.renderOrder = 3;
    parent.add(mesh);
    const o = { v: 0 };
    start(tween(o).to({ v: 1 }, 120).onUpdate(() => { mat.opacity = o.v; }).onComplete(() => {
      start(tween(o).to({ v: 0 }, 900).delay(700).onUpdate(() => { mat.opacity = o.v; }).onComplete(() => {
        parent.remove(mesh); mesh.geometry.dispose(); mat.dispose();
      }));
    }));
  }

  /** A column of light that flares and fades, for a rising piece. */
  column(parent: THREE.Object3D, x: number, z: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbfe6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 7, 16, 1, true), mat);
    mesh.position.set(x, 3.5, z);
    mesh.renderOrder = 6;
    parent.add(mesh);
    const o = { v: 0 };
    start(tween(o).to({ v: 1 }, 700).easing(Easing.Cubic.Out).onUpdate(() => {
      mat.opacity = 0.85 * (1 - o.v);
      mesh.scale.set(1 - 0.7 * o.v, 1, 1 - 0.7 * o.v);
    }).onComplete(() => { parent.remove(mesh); mesh.geometry.dispose(); mat.dispose(); }));
  }

  /** A pulsing tile glow, used for the check flash. */
  flashTile(parent: THREE.Object3D, x: number, z: number, color = 0xff2a2a): void {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2), mat);
    mesh.position.set(x, 0.05, z);
    mesh.renderOrder = 8;
    parent.add(mesh);
    const o = { v: 0 };
    start(tween(o).to({ v: 1 }, 260).yoyo(true).repeat(3).onUpdate(() => { mat.opacity = 0.75 * o.v; }).onComplete(() => {
      parent.remove(mesh); mesh.geometry.dispose(); mat.dispose();
    }));
  }
}
