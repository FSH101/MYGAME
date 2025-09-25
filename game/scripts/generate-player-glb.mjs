import { writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetDir = resolve(__dirname, "../client/public/assets/models");
const outputPath = resolve(targetDir, "player.glb");

const COMPONENTS = {
  SCALAR: 1,
  VEC3: 3,
  VEC4: 4,
};

const COMPONENT_TYPE = {
  FLOAT: 5126,
  UNSIGNED_SHORT: 5123,
};

const TARGET = {
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
};

function createUnitCube() {
  const positions = [];
  const normals = [];
  const faces = [
    { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { normal: [1, 0, 0], corners: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { normal: [-1, 0, 0], corners: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { normal: [0, 1, 0], corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { normal: [0, -1, 0], corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];

  for (const face of faces) {
    for (const corner of face.corners) {
      positions.push(...corner);
      normals.push(...face.normal);
    }
  }

  const indices = [];
  for (let face = 0; face < faces.length; face++) {
    const offset = face * 4;
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

class BinaryWriter {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  append(typedArray) {
    const data = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const offset = this.buffer.length;
    this.buffer = Buffer.concat([this.buffer, data]);
    const padding = (4 - (data.length % 4)) % 4;
    if (padding) {
      this.buffer = Buffer.concat([this.buffer, Buffer.alloc(padding)]);
    }
    return { offset, length: data.length };
  }
}

function addAccessor({ arrays, componentType, type, target, minMax }) {
  const { typedArray, writer, bufferViews, accessors } = arrays;
  const { offset, length } = writer.append(typedArray);
  const bufferViewIndex = bufferViews.length;
  bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: length,
    ...(target ? { target } : {}),
  });
  const accessorIndex = accessors.length;
  const count = typedArray.length / COMPONENTS[type];
  const accessor = {
    bufferView: bufferViewIndex,
    componentType,
    count,
    type,
  };
  if (minMax) {
    accessor.min = minMax.min;
    accessor.max = minMax.max;
  }
  accessors.push(accessor);
  return accessorIndex;
}

function computeMinMax(array, components) {
  const min = Array(components).fill(Infinity);
  const max = Array(components).fill(-Infinity);
  for (let i = 0; i < array.length; i += components) {
    for (let c = 0; c < components; c++) {
      const value = array[i + c];
      if (value < min[c]) min[c] = value;
      if (value > max[c]) max[c] = value;
    }
  }
  return { min, max };
}

function quatFromEuler(xDeg, yDeg, zDeg) {
  const x = (xDeg * Math.PI) / 180;
  const y = (yDeg * Math.PI) / 180;
  const z = (zDeg * Math.PI) / 180;
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

function flatten(list) {
  return list.flat();
}

function generate() {
  const cube = createUnitCube();
  const writer = new BinaryWriter();
  const bufferViews = [];
  const accessors = [];

  const posAccessor = addAccessor({
    arrays: { typedArray: cube.positions, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC3",
    target: TARGET.ARRAY_BUFFER,
    minMax: computeMinMax(cube.positions, 3),
  });

  const normalAccessor = addAccessor({
    arrays: { typedArray: cube.normals, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC3",
    target: TARGET.ARRAY_BUFFER,
  });

  const indexAccessor = addAccessor({
    arrays: { typedArray: cube.indices, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.UNSIGNED_SHORT,
    type: "SCALAR",
    target: TARGET.ELEMENT_ARRAY_BUFFER,
  });

  // Animations data
  const idleTimes = new Float32Array([0, 0.75, 1.5]);
  const idleRotations = new Float32Array(flatten([
    quatFromEuler(0, 0, 3),
    quatFromEuler(0, 0, -3),
    quatFromEuler(0, 0, 3),
  ]));
  const idleTranslations = new Float32Array(flatten([
    [0, 0.9, 0],
    [0, 0.95, 0],
    [0, 0.9, 0],
  ]));

  const runTimes = new Float32Array([0, 0.2, 0.4, 0.6]);
  const runRotations = new Float32Array(flatten([
    quatFromEuler(15, 0, 0),
    quatFromEuler(-15, 0, 0),
    quatFromEuler(15, 0, 0),
    quatFromEuler(-15, 0, 0),
  ]));
  const runTranslations = new Float32Array(flatten([
    [0, 0.9, 0],
    [0, 0.84, 0],
    [0, 0.9, 0],
    [0, 0.84, 0],
  ]));

  const attackTimes = new Float32Array([0, 0.18, 0.36, 0.54]);
  const attackRotations = new Float32Array(flatten([
    quatFromEuler(0, 0, 0),
    quatFromEuler(0, 35, 0),
    quatFromEuler(0, -20, 0),
    quatFromEuler(0, 0, 0),
  ]));

  const idleTimeAccessor = addAccessor({
    arrays: { typedArray: idleTimes, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "SCALAR",
  });
  const idleRotAccessor = addAccessor({
    arrays: { typedArray: idleRotations, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC4",
  });
  const idleTransAccessor = addAccessor({
    arrays: { typedArray: idleTranslations, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC3",
  });

  const runTimeAccessor = addAccessor({
    arrays: { typedArray: runTimes, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "SCALAR",
  });
  const runRotAccessor = addAccessor({
    arrays: { typedArray: runRotations, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC4",
  });
  const runTransAccessor = addAccessor({
    arrays: { typedArray: runTranslations, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC3",
  });

  const attackTimeAccessor = addAccessor({
    arrays: { typedArray: attackTimes, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "SCALAR",
  });
  const attackRotAccessor = addAccessor({
    arrays: { typedArray: attackRotations, writer, bufferViews, accessors },
    componentType: COMPONENT_TYPE.FLOAT,
    type: "VEC4",
  });

  const animations = [];

  animations.push({
    name: "idle",
    samplers: [
      { input: idleTimeAccessor, output: idleRotAccessor, interpolation: "LINEAR" },
      { input: idleTimeAccessor, output: idleTransAccessor, interpolation: "LINEAR" },
    ],
    channels: [
      { sampler: 0, target: { node: 1, path: "rotation" } },
      { sampler: 1, target: { node: 1, path: "translation" } },
    ],
  });

  animations.push({
    name: "run",
    samplers: [
      { input: runTimeAccessor, output: runRotAccessor, interpolation: "LINEAR" },
      { input: runTimeAccessor, output: runTransAccessor, interpolation: "LINEAR" },
    ],
    channels: [
      { sampler: 0, target: { node: 1, path: "rotation" } },
      { sampler: 1, target: { node: 1, path: "translation" } },
    ],
  });

  animations.push({
    name: "attack",
    samplers: [
      { input: attackTimeAccessor, output: attackRotAccessor, interpolation: "LINEAR" },
    ],
    channels: [
      { sampler: 0, target: { node: 1, path: "rotation" } },
    ],
  });

  const gltf = {
    asset: {
      generator: "scripts/generate-player-glb.mjs",
      version: "2.0",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "PlayerRoot", children: [1, 2, 3] },
      { name: "Body", mesh: 0, translation: [0, 0.9, 0], scale: [0.5, 1.8, 0.4] },
      { name: "Helmet", mesh: 0, translation: [0, 1.9, 0], scale: [0.35, 0.35, 0.35] },
      { name: "Pack", mesh: 0, translation: [0, 1.2, -0.35], scale: [0.4, 0.6, 0.2] },
    ],
    meshes: [
      {
        name: "UnitCube",
        primitives: [
          {
            attributes: {
              POSITION: posAccessor,
              NORMAL: normalAccessor,
            },
            indices: indexAccessor,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "BodyMaterial",
        pbrMetallicRoughness: {
          baseColorFactor: [0.85, 0.72, 0.55, 1],
          metallicFactor: 0.1,
          roughnessFactor: 0.7,
        },
      },
    ],
    buffers: [{ byteLength: writer.buffer.length }],
    bufferViews,
    accessors,
    animations,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);

  const binPadding = (4 - (writer.buffer.length % 4)) % 4;
  const binChunk = Buffer.concat([writer.buffer, Buffer.alloc(binPadding)]);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}
function syncExternalModels() {
  mkdirSync(targetDir, { recursive: true });
  const sources = [
    resolve(__dirname, "../models"),
    resolve(__dirname, "../../models"),
  ];
  let copied = false;
  for (const source of sources) {
    if (!existsSync(source)) {
      continue;
    }
    if (relative(source, targetDir) === "") {
      continue;
    }
    try {
      cpSync(source, targetDir, { recursive: true, force: true });
      copied = true;
      console.log(`Скопированы пользовательские модели из ${relative(process.cwd(), source) || source}`);
    } catch (error) {
      console.warn(`Не удалось скопировать модели из ${source}`, error);
    }
  }
  return copied;
}

function main() {
  const copied = syncExternalModels();
  if (existsSync(outputPath)) {
    if (copied) {
      console.log("Обнаружен пользовательский player.glb, генерация заглушки пропущена");
    } else {
      console.log("player.glb уже существует, генерация заглушки не требуется");
    }
    return;
  }

  const glb = generate();
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(outputPath, glb);
  console.log(`Сгенерирован резервный player.glb (${glb.length} байт)`);
}

main();
