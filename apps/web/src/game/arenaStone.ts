import * as T from 'three';

/** Shared stone maps: broad weathering, mineral grain, pits and damp perimeter staining. */
export function createStoneTextures(): {
  map: T.Texture;
  bumpMap: T.Texture;
  roughnessMap: T.Texture;
} {
  const width = 1024,
    height = 512;
  let seed = 17329;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const field = (columns: number) => {
    const rows = Math.ceil(columns * 0.6);
    const values = Float32Array.from({ length: (columns + 1) * (rows + 1) }, random);
    return (u: number, v: number) => {
      const x = u * columns,
        y = v * rows,
        ix = Math.floor(x),
        iy = Math.floor(y);
      const fx = x - ix,
        fy = y - iy;
      const a = fx * fx * (3 - 2 * fx),
        b = fy * fy * (3 - 2 * fy);
      const offset = iy * (columns + 1) + ix;
      const top = values[offset]! * (1 - a) + values[offset + 1]! * a;
      const bottom = values[offset + columns + 1]! * (1 - a) + values[offset + columns + 2]! * a;
      return top * (1 - b) + bottom * b;
    };
  };
  const cloud = field(12),
    veins = field(40),
    grain = field(140),
    fine = field(430);
  const diffuse = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(diffuse.length),
    roughness = new Uint8Array(diffuse.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width,
        v = y / height,
        index = (y * width + x) * 4;
      const broad = cloud(u, v),
        medium = veins(u, v),
        micro = grain(u, v),
        detail = fine(u, v);
      const pits = Math.max(0, 0.25 - detail) * 20;
      const perimeter = 1 - Math.min(1, Math.min(u, 1 - u, v, 1 - v) * 8);
      const damp = perimeter * Math.max(0, broad - 0.25) * 22;
      const minerals = Math.max(0, medium - 0.65) * 24;
      const tone =
        106 +
        (broad - 0.5) * 42 +
        (medium - 0.5) * 24 +
        (micro - 0.5) * 7 +
        (detail - 0.5) * 3 -
        pits;
      diffuse[index] = tone + minerals * 0.8 - damp;
      diffuse[index + 1] = tone + 3 - damp * 0.35;
      diffuse[index + 2] = tone + 4 - minerals * 0.4 - damp * 1.1;
      const elevation = 128 + (medium - 0.5) * 24 + (micro - 0.5) * 22 + (detail - 0.5) * 10 - pits;
      const matte = 218 + (broad - 0.5) * 24 + micro * 18 - damp;
      for (let c = 0; c < 3; c++) {
        relief[index + c] = elevation;
        roughness[index + c] = matte;
      }
      diffuse[index + 3] = relief[index + 3] = roughness[index + 3] = 255;
    }
  const texture = (bytes: Uint8Array, color = false) => {
    const result = new T.DataTexture(bytes, width, height, T.RGBAFormat);
    result.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    result.wrapS = result.wrapT = T.RepeatWrapping;
    result.magFilter = T.LinearFilter;
    result.minFilter = T.LinearMipmapLinearFilter;
    result.generateMipmaps = true;
    result.anisotropy = 4;
    result.needsUpdate = true;
    return result;
  };
  return {
    map: texture(diffuse, true),
    bumpMap: texture(relief),
    roughnessMap: texture(roughness),
  };
}
