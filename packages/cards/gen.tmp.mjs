import { readFileSync, writeFileSync } from 'node:fs';
const [tag, setKey, prefix, metaJson, out] = process.argv.slice(2);
const meta = JSON.parse(metaJson);
const d = JSON.parse(readFileSync('scripts/data/arena-jumpin-packets.json','utf8')).filter(p=>p.set.includes(`(${tag})`));
const by = new Map(JSON.parse(readFileSync('src/generated/scryfall.json','utf8')).map(c=>[c.name,c]));
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const isLand = (n) => /Land/.test(by.get(n)?.typeLine ?? '');
let s = '';
for (const p of d) {
  const names=[...p.fixed.map(f=>f[0]),...p.slots.flat().map(a=>a[1])];
  const cols=new Set(names.flatMap(n=>by.get(n)?.colors||[]));
  const [id, face, blurb] = meta[p.name];
  const spells = p.fixed.filter(([n])=>!isLand(n)), lands = p.fixed.filter(([n])=>isLand(n));
  s += `  {\n    id: '${prefix}${id}',\n    name: ${q(p.name)},\n    colors: [${[...'WUBRG'].filter(c=>cols.has(c)).map(c=>`'${c}'`).join(', ')}],\n    face: ${q(face)},\n    blurb: ${q(blurb)},\n    set: '${setKey}',\n    source: 'arena',\n    spells: [\n${spells.map(([n,k])=>`      [${q(n)}, ${k}],`).join('\n')}\n    ],\n    slots: [\n${p.slots.map(sl=>`      [\n${sl.map(([w,n])=>`        { card: ${q(n)}, weight: ${w} },`).join('\n')}\n      ],`).join('\n')}\n    ],\n    lands: [${lands.map(([n,k])=>`[${q(n)}, ${k}]`).join(', ')}],\n  },\n`;
}
writeFileSync(out, s);
