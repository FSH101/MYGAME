import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";

const TERRAIN_SIZE = 500;
const TERRAIN_SUBDIVISIONS = 80;
const BASE_ELEVATION = 0;
const WALKABLE_OFFSET = 0.92;

export function createTerrain(scene: Scene): Mesh {
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: TERRAIN_SIZE, height: TERRAIN_SIZE, subdivisions: TERRAIN_SUBDIVISIONS },
    scene,
  );

  const positions = ground.getVerticesData("position");
  if (positions) {
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      positions[i + 1] = sampleTerrainHeight(x, z);
    }
    ground.updateVerticesData("position", positions);
    ground.convertToFlatShadedMesh();
  }

  const material = new StandardMaterial("terrain", scene);
  material.diffuseColor = new Color3(0.36, 0.24, 0.16);
  material.specularColor = new Color3(0.05, 0.05, 0.05);
  material.backFaceCulling = true;
  ground.material = material;
  ground.receiveShadows = true;
  ground.checkCollisions = true;

  return ground;
}

export function getTerrainHeight(x: number, z: number): number {
  return sampleTerrainHeight(x, z) + BASE_ELEVATION;
}

export function getWalkableHeight(x: number, z: number): number {
  return getTerrainHeight(x, z) + WALKABLE_OFFSET;
}

function sampleTerrainHeight(x: number, z: number): number {
  const gentle = pseudoSimplex(x * 0.03, z * 0.03) * 4;
  const detail = pseudoSimplex(x * 0.1, z * 0.1) * 1.2;
  return gentle + detail;
}

function pseudoSimplex(x: number, y: number): number {
  return (Math.sin(x * 1.3 + Math.cos(y * 1.7)) + Math.sin(y * 1.9)) * 0.5;
}
