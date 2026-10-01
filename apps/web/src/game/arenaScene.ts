import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ArenaDetail, ArenaReaction } from './arena.ts';

export interface ArenaRenderer {
  react(reactions: ArenaReaction[]): void;
  dispose(): void;
}

const COLORS = {
  W: '#eee6bf',
  U: '#80b5dd',
  B: '#ad8bbe',
  R: '#edab74',
  G: '#9ec791',
  C: '#d9b46a',
};

export async function createArena(
  canvas: HTMLCanvasElement,
  detail: Exclude<ArenaDetail, 'static'>,
  fail: () => void,
  signal: AbortSignal,
): Promise<ArenaRenderer> {
  const response = await fetch('/arena/sandstone-arena.glb', { signal });
  if (!response.ok) throw new Error(`Arena asset request failed: ${response.status}`);
  const asset = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  signal.throwIfAborted();
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, detail === 'low' ? 1 : 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  const scene = new T.Scene();
  scene.background = new T.Color('#17150b');
  // Fade the finite earth surround into the background on very wide screens.
  scene.fog = new T.Fog('#17150b', 34, 43);
  // A steep perspective view gives the far rim a subtle taper, while keeping
  // scenery close to the overhead orientation of the DOM cards.
  const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 32, 7);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const island = new T.Group();
  island.add(asset.scene);
  scene.add(island);
  // Two unlit meshes with baked lighting avoid runtime shadow passes.
  const textures: T.Texture[] = [];
  asset.scene.traverse((object) => {
    if (object instanceof T.Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material))
          if (value instanceof T.Texture && !textures.includes(value)) textures.push(value);
      }
    }
  });
  let seed = 74613;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowCtx = glowCanvas.getContext('2d')!;
  const gradient = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.15, '#fff8');
  gradient.addColorStop(1, '#fff0');
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, 64, 64);
  const glowTexture = new T.CanvasTexture(glowCanvas);
  textures.push(glowTexture);
  const motes: T.Sprite[] = [],
    fog: T.Sprite[] = [];
  for (let i = 0; i < (detail === 'low' ? 12 : 28); i++) {
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        map: glowTexture,
        color: '#d2d994',
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    sprite.position.set(
      (i % 2 ? -1 : 1) * (10.8 + random() * 3),
      0.6 + random() * 2,
      (random() - 0.5) * 15,
    );
    sprite.scale.setScalar(0.07 + random() * 0.08);
    sprite.userData.home = sprite.position.clone();
    island.add(sprite);
    motes.push(sprite);
  }
  if (detail === 'balanced')
    for (let i = 0; i < 10; i++) {
      const sprite = new T.Sprite(
        new T.SpriteMaterial({
          map: glowTexture,
          color: '#91b6a5',
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
        }),
      );
      sprite.position.set((i % 2 ? -1 : 1) * (12 + random() * 4), -0.8, (random() - 0.5) * 22);
      sprite.scale.set(8, 2.5, 1);
      sprite.userData.home = sprite.position.clone();
      island.add(sprite);
      fog.push(sprite);
    }
  // Small luminous rune stones surround the platform, with a shared emissive material.
  const runeMaterial = new T.MeshStandardMaterial({
    color: '#7e8c79',
    emissive: '#bcb876',
    emissiveIntensity: 0.22,
    roughness: 0.7,
  });
  for (const x of [-10, 10])
    for (const z of [-4.6, -2.3, 2.3, 4.6]) {
      const rune = new T.Mesh(new T.TorusGeometry(0.12, 0.018, 4, 12), runeMaterial);
      rune.rotation.x = -Math.PI / 2;
      rune.position.set(x, 0.39, z);
      island.add(rune);
    }
  const pulseMaterial = () =>
    new T.MeshBasicMaterial({
      color: '#d9b46a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    });
  const pulsePool = Array.from({ length: 6 }, () => {
    const mesh = new T.Mesh(new T.RingGeometry(0.7, 1, 40), pulseMaterial());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const pulses: {
    mesh: (typeof pulsePool)[number];
    start: number;
    duration: number;
    strength: number;
    size: number;
  }[] = [];
  const runePulses: { start: number; duration: number; strength: number; color: T.Color }[] = [];
  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -0.28);
  const screenPoint = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new T.Vector2(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2),
      camera,
    );
    return ray.ray.intersectPlane(plane, new T.Vector3());
  };
  const table = canvas.closest('.table')!;
  let disposed = false,
    frame = 0,
    last = 0,
    nextFrame = 0,
    clock = 0,
    sampledAt = 0,
    samples = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const resize = () => {
    if (disposed) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    const aspect = r.width / r.height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const fields = table.querySelectorAll('.battlefield');
    if (fields.length === 2) {
      const a = fields[0]!.getBoundingClientRect(),
        b = fields[1]!.getBoundingClientRect();
      // Center the scenery in the whole viewport; the UI has an asymmetric action column.
      // Symmetric margins keep both pillar bases visible while the floor spans the card rows.
      const margin = r.width * 0.035;
      const centerX = r.left + r.width / 2;
      const centerY = (a.top + b.bottom) / 2;
      const top = screenPoint(centerX, a.top - 12),
        bottom = screenPoint(centerX, b.bottom + 12),
        left = screenPoint(r.left + margin, centerY),
        right = screenPoint(r.right - margin, centerY);
      if (top && bottom && left && right) {
        const scale = Math.min((right.x - left.x) / 20, (bottom.z - top.z) / 12);
        island.position.set((left.x + right.x) / 2, 0, (top.z + bottom.z) / 2);
        // Preserve the authored stone and seal proportions at every aspect ratio.
        island.scale.setScalar(scale);
      }
    }
    renderOnce();
  };
  function renderOnce() {
    if (disposed || document.hidden) return;
    renderer.render(scene, camera);
    canvas.dataset.ready = 'true';
  }
  const clearPulses = () => {
    pulses.length = runePulses.length = 0;
    pulsePool.forEach((p) => {
      p.visible = false;
    });
    runeMaterial.emissive.set('#bcb876');
    runeMaterial.emissiveIntensity = 0.22;
  };
  const tick = (time: number) => {
    frame = 0;
    if (disposed || document.hidden || motion.matches) return;
    // Do not spend GPU time rendering ambient scenery at 144/240 Hz.
    if (time < nextFrame) {
      frame = requestAnimationFrame(tick);
      return;
    }
    nextFrame = Math.max(nextFrame + 1000 / 60, time);
    clock += last ? Math.min(0.05, (time - last) / 1000) : 0;
    last = time;
    motes.forEach((m, i) => {
      const home = m.userData.home as T.Vector3;
      m.position.y = home.y + Math.sin(clock * 0.45 + i) * 0.25;
      m.position.x = home.x + Math.sin(clock * 0.25 + i * 2) * 0.2;
      (m.material as T.SpriteMaterial).opacity = 0.35 + Math.sin(clock + i) * 0.2;
    });
    fog.forEach((m, i) => {
      m.position.z = (m.userData.home as T.Vector3).z + Math.sin(clock * 0.12 + i) * 1.2;
    });
    const brightnessScale = Math.min(
      1,
      0.3 / (pulses.reduce((sum, p) => sum + p.strength, 0) || 1),
    );
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]!,
        age = (time - p.start) / p.duration;
      p.mesh.visible = age >= 0 && age < 1;
      if (age >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      if (age < 0) continue;
      p.mesh.scale.setScalar(p.size * (0.5 + age * 1.3));
      p.mesh.material.opacity = Math.sin(age * Math.PI) * p.strength * brightnessScale;
    }
    runeMaterial.emissiveIntensity = 0.22;
    for (let i = runePulses.length - 1; i >= 0; i--) {
      const p = runePulses[i]!,
        age = (time - p.start) / p.duration;
      if (age >= 1) {
        runePulses.splice(i, 1);
        continue;
      }
      if (age >= 0) {
        runeMaterial.emissive.copy(p.color);
        runeMaterial.emissiveIntensity = Math.min(
          0.85,
          runeMaterial.emissiveIntensity + Math.sin(age * Math.PI) * p.strength * 2,
        );
      }
    }
    renderOnce();
    samples++;
    if (time - sampledAt > 1000) {
      canvas.dataset.fps = String(Math.round((samples * 1000) / (time - sampledAt)));
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      canvas.dataset.triangles = String(renderer.info.render.triangles);
      samples = 0;
      sampledAt = time;
    }
    frame = requestAnimationFrame(tick);
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    nextFrame = 0;
    clearPulses();
    if (document.hidden || disposed) return;
    renderOnce();
    sampledAt = performance.now();
    samples = 0;
    if (!motion.matches) frame = requestAnimationFrame(tick);
  };
  const onLoss = (event: Event) => {
    event.preventDefault();
    fail();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  table.querySelectorAll('.battlefield').forEach((f) => observer.observe(f));
  const styleObserver = new MutationObserver(resize);
  styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  document.addEventListener('visibilitychange', resume);
  motion.addEventListener('change', resume);
  canvas.addEventListener('webglcontextlost', onLoss);
  resize();
  resume();

  return {
    react(reactions) {
      if (disposed || motion.matches || document.hidden) return;
      const now = performance.now();
      for (const reaction of reactions) {
        if (reaction.kind === 'runes') {
          const existing = runePulses.find((p) =>
            p.color.equals(new T.Color(COLORS[reaction.hue])),
          );
          if (existing) {
            existing.start = now;
            existing.strength = Math.min(0.3, existing.strength + reaction.strength * 0.25);
          } else if (runePulses.length < 5)
            runePulses.push({
              start: now,
              duration: reaction.duration,
              strength: reaction.strength,
              color: new T.Color(COLORS[reaction.hue]),
            });
          continue;
        }
        let point: T.Vector3 | null = island.position.clone();
        if (reaction.target) {
          const target = reaction.target;
          const element =
            'player' in target
              ? table.querySelector(`[data-player="${CSS.escape(target.player)}"]`)
              : table.querySelector(`[data-oid="${CSS.escape(target.object)}"]`);
          if (!element) continue;
          const r = element.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          point = screenPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!point) continue;
          // Badges sit beyond the platform: keep their reaction on the corresponding rim.
          point.x = T.MathUtils.clamp(
            point.x,
            island.position.x - 9.5 * island.scale.x,
            island.position.x + 9.5 * island.scale.x,
          );
          point.z = T.MathUtils.clamp(
            point.z,
            island.position.z - 5.5 * island.scale.z,
            island.position.z + 5.5 * island.scale.z,
          );
        }
        const existing = pulses.find(
          (p) => p.mesh.position.distanceTo(point) < 0.8 && p.start <= now,
        );
        if (existing) {
          existing.strength = Math.min(0.24, existing.strength + reaction.strength * 0.25);
          continue;
        }
        const mesh = pulsePool.find((m) => !pulses.some((p) => p.mesh === m));
        if (!mesh) continue;
        mesh.position.copy(point);
        mesh.position.y = 0.29;
        mesh.material.color.set(COLORS[reaction.hue]);
        pulses.push({
          mesh,
          start: now + reaction.delay,
          duration: reaction.duration,
          strength: reaction.strength,
          size: reaction.kind === 'surface' ? 3 : 0.7,
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      styleObserver.disconnect();
      document.removeEventListener('visibilitychange', resume);
      motion.removeEventListener('change', resume);
      canvas.removeEventListener('webglcontextlost', onLoss);
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      scene.traverse((object) => {
        if (object instanceof T.Mesh) geometries.add(object.geometry);
        if (object instanceof T.Mesh || object instanceof T.Sprite)
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
            materials.add(m),
          );
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => {
        t.dispose();
        if (t.image instanceof ImageBitmap) t.image.close();
      });
      renderer.dispose();
      canvas.dataset.ready = 'false';
    },
  };
}
