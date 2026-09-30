import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ArenaDetail, ArenaReaction } from './arena.ts';
import { createStoneTextures } from './arenaStone.ts';

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

export function createArena(
  canvas: HTMLCanvasElement,
  detail: Exclude<ArenaDetail, 'static'>,
  fail: () => void,
): ArenaRenderer {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, detail === 'low' ? 1 : 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = detail === 'balanced';
  renderer.shadowMap.type = T.PCFShadowMap;
  // Only the scenery casts shadows; its transforms change on layout updates.
  renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene();
  scene.background = new T.Color('#101e1b');
  scene.fog = new T.FogExp2('#1b3029', 0.018);
  const camera = new T.OrthographicCamera(-16, 16, 10, -10, 0.1, 100);
  camera.position.set(0, 28, 14);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const island = new T.Group();
  scene.add(island);
  scene.add(new T.HemisphereLight('#b5c7b8', '#233128', 2.1));
  const sunlight = new T.DirectionalLight('#e7dec3', 3.2);
  sunlight.position.set(-10, 18, -9);
  sunlight.castShadow = detail === 'balanced';
  sunlight.shadow.mapSize.set(512, 512);
  Object.assign(sunlight.shadow.camera, {
    left: -22,
    right: 22,
    top: 22,
    bottom: -22,
    near: 1,
    far: 60,
  });
  sunlight.shadow.bias = -0.002;
  sunlight.shadow.normalBias = 0.08;
  scene.add(sunlight);
  const coolLight = new T.DirectionalLight('#7fa8ad', 0.7);
  coolLight.position.set(12, 8, 12);
  scene.add(coolLight);

  // Fixed seed keeps rematches and resizes visually stable; unrelated to the game RNG.
  let seed = 74613;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const textures: T.Texture[] = [];
  const noise = (base: string, moss = false) => {
    const surface = document.createElement('canvas');
    surface.width = surface.height = 256;
    const ctx = surface.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,235,.055)' : 'rgba(0,0,0,.09)';
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 3);
    }
    if (moss)
      for (let i = 0; i < 110; i++) {
        ctx.fillStyle = `rgba(102,123,69,${random() * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(
          random() * 256,
          random() * 256,
          random() * 22,
          random() * 12,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    const texture = new T.CanvasTexture(surface);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    textures.push(texture);
    return texture;
  };
  const stone = new T.MeshStandardMaterial({
    color: '#9b9e96',
    map: noise('#7c817c', true),
    roughness: 0.96,
  });
  const stoneMaps = createStoneTextures();
  textures.push(stoneMaps.map, stoneMaps.bumpMap, stoneMaps.roughnessMap);
  // Keep the original decoration seed consumption unchanged when replacing materials.
  stone.map = stoneMaps.map;
  stone.bumpMap = stoneMaps.bumpMap;
  stone.bumpScale = 0.025;
  stone.roughnessMap = stoneMaps.roughnessMap;
  stone.color.set('#c5c5c0');
  const stoneLight = new T.MeshStandardMaterial({
    color: '#cecdc5',
    ...stoneMaps,
    bumpScale: 0.025,
    roughness: 0.96,
  });
  const stoneDark = new T.MeshStandardMaterial({
    color: '#b7bbb5',
    ...stoneMaps,
    bumpScale: 0.025,
    roughness: 0.96,
  });
  const edge = new T.MeshStandardMaterial({
    color: '#666f63',
    map: noise('#687066', true),
    roughness: 1,
  });
  const rock = new T.MeshStandardMaterial({ color: '#35483d', roughness: 1, flatShading: true });
  const bark = new T.MeshStandardMaterial({ color: '#4c4a35', roughness: 1 });
  const moss = new T.MeshStandardMaterial({ color: '#536a3d', roughness: 1 });
  const leaf = new T.MeshStandardMaterial({ color: '#355840', roughness: 1, flatShading: true });
  const leafLight = new T.MeshStandardMaterial({
    color: '#536e44',
    roughness: 1,
    flatShading: true,
  });
  const brass = new T.MeshStandardMaterial({ color: '#958467', roughness: 0.75, metalness: 0.25 });
  const engraving = new T.MeshStandardMaterial({ color: '#49584d', roughness: 1 });
  const crack = new T.MeshStandardMaterial({ color: '#303c36', roughness: 1 });
  const mossCanvas = document.createElement('canvas');
  mossCanvas.width = mossCanvas.height = 128;
  const mossCtx = mossCanvas.getContext('2d')!;
  for (let i = 0; i < 120; i++) {
    const angle = random() * Math.PI * 2,
      distance = random() * 45;
    const x = 64 + Math.cos(angle) * distance,
      y = 64 + Math.sin(angle) * distance;
    const radius = 3 + random() * 9;
    const patch = mossCtx.createRadialGradient(x, y, 0, x, y, radius);
    patch.addColorStop(0, '#8b9b6caa');
    patch.addColorStop(1, '#8b9b6c00');
    mossCtx.fillStyle = patch;
    mossCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const mossTexture = new T.CanvasTexture(mossCanvas);
  mossTexture.colorSpace = T.SRGBColorSpace;
  textures.push(mossTexture);
  const mossStain = new T.MeshStandardMaterial({
    map: mossTexture,
    color: '#6f7e57',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    roughness: 1,
  });
  const buckets = new Map<T.Material, T.BufferGeometry[]>();
  const add = (
    geometry: T.BufferGeometry,
    material: T.Material,
    position: number[],
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
  ) => {
    const matrix = new T.Matrix4().compose(
      new T.Vector3(...position),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
      new T.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    // All primitives expose position/normal/uv; removing indices allows merging unlike primitives.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const list = buckets.get(material) ?? [];
    list.push(flat);
    buckets.set(material, list);
  };
  const box = (
    mat: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
  ) => add(new T.BoxGeometry(w, h, d), mat, [x, y, z], [1, 1, 1], [0, yaw, 0]);
  const branch = (points: T.Vector3[], radius: number, mat: T.Material) =>
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points), 12, radius, 5, false), mat, [0, 0, 0]);

  // Layered floating island, masonry rim and individually weathered floor slabs.
  box(rock, 0, -0.9, 0, 20.8, 1.8, 12.8);
  box(edge, 0, -0.15, 0, 20.7, 0.55, 12.7);
  // Fit uneven flagstones together, rather than repeating a rectangular tile grid.
  const sites: T.Vector2[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 8; col++)
      sites.push(
        new T.Vector2(
          -8.75 + col * 2.5 + (random() - 0.5) * 1.5,
          -5 + row * 2 + (random() - 0.5) * 1.25,
        ),
      );
  for (const site of sites) {
    let polygon = [
      new T.Vector2(-10, -6),
      new T.Vector2(10, -6),
      new T.Vector2(10, 6),
      new T.Vector2(-10, 6),
    ];
    for (const other of sites) {
      if (other === site) continue;
      const normal = other.clone().sub(site);
      const offset = (other.lengthSq() - site.lengthSq()) / 2;
      const clipped: T.Vector2[] = [];
      polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length]!;
        const da = a.dot(normal) - offset,
          db = b.dot(normal) - offset;
        if (da <= 0) clipped.push(a);
        if (da <= 0 !== db <= 0) clipped.push(a.clone().lerp(b, da / (da - db)));
      });
      polygon = clipped;
    }
    const center = polygon
      .reduce((sum, p) => sum.add(p), new T.Vector2())
      .divideScalar(polygon.length);
    const shape = new T.Shape();
    polygon.forEach((p, i) => {
      const local = p.clone().sub(center).multiplyScalar(0.99);
      if (i === 0) shape.moveTo(local.x, local.y);
      else shape.lineTo(local.x, local.y);
    });
    shape.closePath();
    const slab = new T.ExtrudeGeometry(shape, {
      depth: 0.2,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.018,
      bevelSegments: 1,
      steps: 1,
    });
    // Project one continuous weathering map across the floor instead of repeating a tiny
    // texture in each polygon's default extrusion UVs. This changes only texture coordinates.
    const positions = slab.getAttribute('position'),
      uv = slab.getAttribute('uv');
    for (let i = 0; i < positions.count; i++)
      uv.setXY(
        i,
        (positions.getX(i) + center.x + 10) / 20,
        (positions.getY(i) + center.y + 6) / 12,
      );
    const variant = random();
    add(
      slab,
      variant < 0.15 ? stoneLight : variant > 0.85 ? stoneDark : stone,
      [center.x, 0.215 + random() * 0.012, center.y],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
    if (random() < 0.4) {
      const end = polygon[0]!.clone().lerp(center, 0.35);
      const start = center.clone().lerp(end, 0.25);
      const length = start.distanceTo(end);
      box(
        crack,
        (start.x + end.x) / 2,
        0.244,
        (start.y + end.y) / 2,
        length,
        0.003,
        0.012,
        -Math.atan2(end.y - start.y, end.x - start.x),
      );
    }
  }
  for (let x = -10; x <= 10; x += 1)
    for (const z of [-6.25, 6.25]) box(edge, x, 0.15, z, 0.96, 0.45, 0.42);
  for (let z = -5.5; z <= 5.5; z += 1)
    for (const x of [-10.25, 10.25]) box(edge, x, 0.15, z, 0.42, 0.45, 0.96);
  // A worn ritual seal and broken inset border give the floor an authored focal point.
  for (const radius of [2.55, 2.7, 3.12]) {
    for (let arc = 0; arc < 5; arc++) {
      const start = (arc * Math.PI * 2) / 5 + 0.08;
      add(
        new T.RingGeometry(
          radius,
          radius + (radius > 3 ? 0.035 : 0.022),
          40,
          1,
          start,
          (Math.PI * 2) / 5 - 0.18,
        ),
        engraving,
        [0, 0.247, 0],
        [1, 1, 1],
        [-Math.PI / 2, 0, 0],
      );
    }
  }
  for (let mark = 0; mark < 20; mark++) {
    const angle = (mark * Math.PI) / 10;
    const radius = 2.91;
    box(
      engraving,
      Math.cos(angle) * radius,
      0.25,
      Math.sin(angle) * radius,
      mark % 4 ? 0.09 : 0.22,
      0.004,
      0.025,
      -angle,
    );
    if (mark % 4 === 0)
      add(
        new T.RingGeometry(0.13, 0.15, 4),
        engraving,
        [Math.cos(angle) * 2.32, 0.251, Math.sin(angle) * 2.32],
        [1, 1, 1],
        [-Math.PI / 2, 0, 0],
      );
  }
  for (const z of [-5.1, 5.1])
    for (const x of [-5.8, 0, 5.8]) box(engraving, x, 0.247, z, 5.2, 0.004, 0.035);
  for (const x of [-8.7, 8.7])
    for (const z of [-2.8, 2.8]) box(engraving, x, 0.247, z, 0.035, 0.004, 4.7);
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (9.25 + random() * 0.55),
      z = (random() - 0.5) * 10.5;
    add(
      new T.PlaneGeometry(1.1 + random() * 0.7, 1 + random() * 0.8),
      mossStain,
      [x, 0.245, z],
      [1, 1, 1],
      [-Math.PI / 2, 0, random() * Math.PI],
    );
  }
  box(brass, 0, 0.243, 0, 19.8, 0.008, 0.028);
  for (const x of [-9.6, 9.6])
    for (let z = -5.5; z < 6; z += 0.6) box(brass, x, 0.249, z, 0.15, 0.012, 0.025, Math.PI / 4);
  for (let i = 0; i < 45; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (9.8 + random() * 2.5),
      z = (random() - 0.5) * 15;
    add(
      new T.IcosahedronGeometry(1, 0),
      rock,
      [x, -1.2 - random() * 2.8, z],
      [0.6 + random(), 1 + random() * 2, 0.6 + random()],
      [random(), random(), random()],
    );
  }
  // Broken fluted pillars, toppled masonry and moss at the four corners.
  for (const x of [-9.9, 9.9])
    for (const z of [-5.8, 5.8]) {
      const h = 1.7 + random() * 2.5;
      box(edge, x, 0.05, z, 1.6, 0.55, 1.6);
      box(stone, x, 0.4, z, 1.3, 0.2, 1.3);
      add(new T.CylinderGeometry(0.46, 0.58, h, 8), stone, [x, h / 2 + 0.5, z]);
      for (let n = 0; n < 8; n++) {
        const a = (n * Math.PI) / 4;
        add(new T.CylinderGeometry(0.075, 0.085, h - 0.12, 5), edge, [
          x + Math.cos(a) * 0.46,
          h / 2 + 0.5,
          z + Math.sin(a) * 0.46,
        ]);
      }
      box(edge, x + 0.08, h + 0.53, z, 1.1, 0.3, 1.06, 0.12);
      for (let i = 0; i < 7; i++) {
        const px = x + (random() - 0.5) * 3,
          pz = z + (random() - 0.5) * 3;
        add(
          new T.DodecahedronGeometry(0.45, 0),
          i % 3 ? edge : moss,
          [px, 0.15, pz],
          [1.2, 0.5, 1],
          [random(), random(), random()],
        );
      }
    }
  // Twisted roots cling to the rim rather than crossing beneath cards.
  for (const side of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const z = -7 + i * 2;
      branch(
        [
          new T.Vector3(side * (12 + random()), -1, z - 1),
          new T.Vector3(side * 11.2, 0.5, z - 0.5),
          new T.Vector3(side * 10.5, 0.4, z + 0.2),
          new T.Vector3(side * (9.8 + random() * 0.4), 0.24, z + 0.7),
        ],
        0.05 + random() * 0.08,
        bark,
      );
    }
  // Short foreground canopy clusters soften the corners and frame the player bands.
  for (const z of [-8.2, 8.2])
    for (const side of [-1, 1])
      for (let n = 0; n < 6; n++) {
        const x = side * (8.5 + random() * 3.5),
          pz = z + (random() - 0.5) * 2;
        add(
          new T.IcosahedronGeometry(1, 1),
          n % 2 ? leafLight : leaf,
          [x, -0.3 + random(), pz],
          [1.1, 0.7, 1],
          [random(), random(), 0],
        );
        branch(
          [
            new T.Vector3(side * 12, -1, z),
            new T.Vector3(x, 0.3, pz),
            new T.Vector3(x - side, 0.4, pz + 0.5),
          ],
          0.08,
          bark,
        );
      }
  // Distant canopy layers frame the ravine; tree crowns use shared merged meshes.
  for (let i = 0; i < 45; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (12.7 + random() * 10),
      z = -15 + random() * 29;
    const y = -4 - random() * 3,
      h = 3 + random() * 4;
    add(new T.CylinderGeometry(0.15, 0.36, h, 6), bark, [x, y + h / 2, z]);
    for (let n = 0; n < 3; n++) {
      add(
        new T.IcosahedronGeometry(1, 1),
        n % 2 ? leafLight : leaf,
        [x + (random() - 0.5), y + h - n * 0.6, z],
        [1.4 + n * 0.35, 1.5, 1.4 + n * 0.35],
        [0, random(), 0],
      );
    }
  }
  for (const [material, parts] of buckets) {
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) throw new Error('Arena geometry could not be assembled');
    const mesh = new T.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.castShadow =
      material !== brass && material !== engraving && material !== crack && material !== mossStain;
    island.add(mesh);
  }

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
  const fronds: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>[] = [];
  const frondMaterial = new T.MeshStandardMaterial({
    color: '#6a8050',
    side: T.DoubleSide,
    roughness: 1,
  });
  for (let i = 0; i < 12; i++) {
    const frond = new T.Mesh(new T.PlaneGeometry(0.12, 0.75), frondMaterial);
    frond.position.set((i % 2 ? -1 : 1) * (10.3 + random() * 0.8), 0.5, (random() - 0.5) * 12);
    frond.rotation.set(-0.4, random() * Math.PI, 0.4);
    frond.userData.tilt = frond.rotation.z;
    island.add(frond);
    fronds.push(frond);
  }
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
    camera.left = -10 * aspect;
    camera.right = 10 * aspect;
    camera.updateProjectionMatrix();
    const fields = table.querySelectorAll('.battlefield');
    if (fields.length === 2) {
      const a = fields[0]!.getBoundingClientRect(),
        b = fields[1]!.getBoundingClientRect();
      // Center the scenery in the whole viewport; the UI has an asymmetric action column.
      // Symmetric margins keep both pillar bases visible while the floor spans the card rows.
      const margin = r.width * 0.035;
      const top = screenPoint(r.left + margin, a.top - 12),
        bottom = screenPoint(r.right - margin, b.bottom + 12);
      if (top && bottom) {
        island.position.set((top.x + bottom.x) / 2, 0, (top.z + bottom.z) / 2);
        island.scale.set(Math.max(8, bottom.x - top.x) / 20, 1, Math.max(6, bottom.z - top.z) / 12);
      }
    }
    renderer.shadowMap.needsUpdate = true;
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
    fronds.forEach((m, i) => {
      m.rotation.z = (m.userData.tilt as number) + Math.sin(clock * 0.6 + i) * 0.06;
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
      textures.forEach((t) => t.dispose());
      sunlight.shadow.dispose();
      renderer.dispose();
      canvas.dataset.ready = 'false';
    },
  };
}
