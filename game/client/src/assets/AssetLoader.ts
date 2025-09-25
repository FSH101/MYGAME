import { AssetContainer, Scene, SceneLoader, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import {
  AnimationClip,
  Box3,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SkinnedMesh,
  Texture,
  TextureLoader,
  Vector3 as ThreeVector3,
  SRGBColorSpace,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { TDSLoader } from "three/examples/jsm/loaders/TDSLoader.js";
import { logger } from "../core/Logger";

export type AssetDescriptor = {
  key: string;
  type: "gltf" | "fbx" | "max";
  url: string;
};

const assetTemplates = new Map<string, AssetContainer>();
let instanceCounter = 0;

const textureLoader = new TextureLoader();
const fbxLoader = new FBXLoader();
const maxLoader = new TDSLoader();

textureLoader.setCrossOrigin("anonymous");

type TextureMapSet = {
  color?: Texture;
  normal?: Texture;
  roughness?: Texture;
  metalness?: Texture;
  ao?: Texture;
};

const COLOR_SUFFIXES = ["", "_albedo", "_basecolor", "_base_color", "_diffuse", "_color"];
const NORMAL_SUFFIXES = ["_normal", "_norm", "_normalmap"];
const ROUGHNESS_SUFFIXES = ["_roughness", "_rough", "_gloss", "_glossiness"];
const METAL_SUFFIXES = ["_metalness", "_metal", "_metallic", "_spec", "_specular"];
const AO_SUFFIXES = ["_ao", "_occlusion", "_ambientocclusion"];
const FALLBACK_NAMES = ["", "texture", "material"];
const TEXTURE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp"];

export async function loadAssets(
  scene: Scene,
  descriptors: AssetDescriptor[],
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (descriptors.length === 0) {
    onProgress?.(1);
    return;
  }

  let completed = 0;
  for (const descriptor of descriptors) {
    if (!assetTemplates.has(descriptor.key)) {
      try {
        if (descriptor.type === "gltf") {
          const { rootUrl, fileName } = splitUrl(descriptor.url);
          const container = await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
          assetTemplates.set(descriptor.key, container);
        } else if (descriptor.type === "fbx") {
          const container = await loadFBXTemplate(scene, descriptor.url);
          assetTemplates.set(descriptor.key, container);
        } else if (descriptor.type === "max") {
          const container = await loadMaxTemplate(scene, descriptor.url);
          assetTemplates.set(descriptor.key, container);
        }
      } catch (error) {
        logger.warn(`Не удалось загрузить ассет ${descriptor.url}`, error);
        assetTemplates.set(descriptor.key, createFailedContainer(scene, descriptor));
      }
    }
    completed += 1;
    onProgress?.(completed / descriptors.length);
  }
}

export function instantiateAsset(key: string, parent: TransformNode): AssetContainer {
  const template = assetTemplates.get(key);
  if (!template) {
    throw new Error(`Asset template '${key}' is not loaded`);
  }
  const metadata = (template as AssetContainer & { metadata?: unknown }).metadata as
    | { __wastelandFailed?: true }
    | undefined;
  if (metadata?.__wastelandFailed) {
    throw new Error(`Asset template '${key}' недоступен`);
  }
  const instanceName = `${key}_instance_${instanceCounter++}`;
  const instance = template.instantiateModelsToScene((name) => `${instanceName}_${name}`, parent);
  instance.addAllToScene();
  for (const node of instance.rootNodes) {
    if (!node.parent) {
      node.parent = parent;
    }
  }
  for (const mesh of instance.meshes) {
    if (!mesh.parent) {
      mesh.parent = parent;
    }
  }
  return instance;
}

export function disposeInstance(container: AssetContainer): void {
  container.dispose();
}

export function clearAssetCache(): void {
  for (const container of assetTemplates.values()) {
    container.dispose();
  }
  assetTemplates.clear();
  instanceCounter = 0;
}

function splitUrl(url: string): { rootUrl: string; fileName: string } {
  const idx = url.lastIndexOf("/");
  if (idx === -1) {
    return { rootUrl: "", fileName: url };
  }
  const rootUrl = url.slice(0, idx + 1);
  const fileName = url.slice(idx + 1);
  return { rootUrl, fileName };
}

async function loadFBXTemplate(scene: Scene, url: string): Promise<AssetContainer> {
  const { directory, baseName } = splitPath(url);
  const object = await fbxLoader.loadAsync(url);
  const animations = (object.animations as AnimationClip[]) ?? [];

  const textures = await prepareTextures(directory, baseName);
  applyMaterials(object, textures);
  normalizeModel(object);

  const glb = await exportToGlb(object, animations);
  const container = await SceneLoader.LoadAssetContainerAsync("data:", glb, scene, undefined, ".glb");
  return container;
}

async function loadMaxTemplate(scene: Scene, url: string): Promise<AssetContainer> {
  const { directory, baseName } = splitPath(url);
  maxLoader.setResourcePath(directory);
  maxLoader.setPath(directory);
  try {
    const object = await maxLoader.loadAsync(url);

    const textures = await prepareTextures(directory, baseName);
    applyMaterials(object, textures);
    normalizeModel(object);

    const glb = await exportToGlb(object, []);
    const container = await SceneLoader.LoadAssetContainerAsync("data:", glb, scene, undefined, ".glb");
    return container;
  } catch (error) {
    logger.warn(`Импорт .max не удался, пробуем резервный GLB для ${baseName}`, error);
    return loadGlbFallback(scene, directory, baseName);
  }
}

function splitPath(url: string): { directory: string; baseName: string } {
  const trimmed = url.split("?")[0];
  const lastSlash = trimmed.lastIndexOf("/");
  const directory = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : "";
  const filename = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const dot = filename.lastIndexOf(".");
  const baseName = dot >= 0 ? filename.slice(0, dot) : filename;
  return { directory, baseName };
}

async function prepareTextures(directory: string, baseName: string): Promise<TextureMapSet> {
  const maps: TextureMapSet = {};

  maps.color = await loadTextureBySuffix(directory, baseName, COLOR_SUFFIXES, { color: true });
  maps.normal = await loadTextureBySuffix(directory, baseName, NORMAL_SUFFIXES, { flipY: false });

  const roughness = await loadTextureBySuffix(directory, baseName, ROUGHNESS_SUFFIXES, {});
  const metalness = await loadTextureBySuffix(directory, baseName, METAL_SUFFIXES, {});
  const ao = await loadTextureBySuffix(directory, baseName, AO_SUFFIXES, {});

  if (!roughness && metalness && metalness.isTexture) {
    maps.roughness = metalness.clone();
    maps.roughness.wrapS = maps.roughness.wrapT = RepeatWrapping;
  } else {
    maps.roughness = roughness ?? undefined;
  }
  maps.metalness = metalness ?? undefined;
  maps.ao = ao ?? undefined;

  return maps;
}

interface TextureOptions {
  color?: boolean;
  flipY?: boolean;
}

async function loadTextureBySuffix(
  directory: string,
  baseName: string,
  suffixes: string[],
  options: TextureOptions,
): Promise<Texture | undefined> {
  const baseCandidates = [baseName, baseName.toLowerCase()];
  const searchNames = new Set<string>();
  for (const base of baseCandidates) {
    for (const suffix of suffixes) {
      searchNames.add(`${base}${suffix}`);
      if (suffix.startsWith("_")) {
        searchNames.add(`${base}${suffix.slice(1)}`);
      }
    }
  }
  for (const suffix of suffixes) {
    searchNames.add(suffix.replace(/^_/, ""));
  }
  for (const fallback of FALLBACK_NAMES) {
    for (const suffix of suffixes) {
      searchNames.add(`${fallback}${suffix}`.replace(/^_/, ""));
    }
  }

  for (const name of searchNames) {
    for (const ext of TEXTURE_EXTENSIONS) {
      const variants = [ext, ext.toUpperCase()];
      for (const variant of variants) {
        const candidate = `${directory}${name}.${variant}`;
        const texture = await tryLoadTexture(candidate, options);
        if (texture) {
          return texture;
        }
        const nestedCandidate = `${directory}textures/${name}.${variant}`;
        const nestedTexture = await tryLoadTexture(nestedCandidate, options);
        if (nestedTexture) {
          return nestedTexture;
        }
      }
    }
  }
  return undefined;
}

async function tryLoadTexture(url: string, options: TextureOptions): Promise<Texture | undefined> {
  try {
    const texture = await textureLoader.loadAsync(url);
    texture.name = url;
    if (options.color && "colorSpace" in texture) {
      (texture as Texture & { colorSpace: typeof SRGBColorSpace }).colorSpace = SRGBColorSpace;
    }
    if (options.flipY === false) {
      texture.flipY = false;
    }
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  } catch (err) {
    return undefined;
  }
}

function applyMaterials(root: Object3D, textures: TextureMapSet): void {
  root.traverse((node) => {
    if (node instanceof Mesh || node instanceof SkinnedMesh) {
      const mesh = node as Mesh;
      let material = mesh.material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
      if (!material || Array.isArray(material)) {
        material = new MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.8 });
      }

      material.map = textures.color ?? material.map ?? undefined;
      material.normalMap = textures.normal ?? material.normalMap ?? undefined;
      material.metalnessMap = textures.metalness ?? material.metalnessMap ?? undefined;
      material.roughnessMap = textures.roughness ?? material.roughnessMap ?? undefined;
      material.aoMap = textures.ao ?? material.aoMap ?? undefined;

      if (textures.color) {
        material.color.setScalar(1.0);
      }
      if (textures.metalness) {
        material.metalness = 1.0;
      }
      if (textures.roughness) {
        material.roughness = 1.0;
      }
      material.needsUpdate = true;
      mesh.material = material;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

function normalizeModel(object: Object3D): void {
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new ThreeVector3());
  const targetHeight = 1.8;
  if (size.y > 0 && Math.abs(size.y - targetHeight) > 0.01) {
    const scale = targetHeight / size.y;
    object.scale.multiplyScalar(scale);
    object.updateMatrixWorld(true);
    box.setFromObject(object);
  }
  const minY = box.min.y;
  if (minY !== 0) {
    object.position.y -= minY;
    object.updateMatrixWorld(true);
  }
}

async function exportToGlb(object: Object3D, animations: AnimationClip[]): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else if (result instanceof Blob) {
          result.arrayBuffer().then(resolve).catch(reject);
        } else {
          const text = JSON.stringify(result);
          resolve(new TextEncoder().encode(text).buffer);
        }
      },
      (error) => reject(error),
      { binary: true, animations },
    );
  });
}

async function loadGlbFallback(scene: Scene, directory: string, baseName: string): Promise<AssetContainer> {
  const fallbackUrl = `${directory}${baseName}.glb`;
  const { rootUrl, fileName } = splitUrl(fallbackUrl);
  return SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
}

function createFailedContainer(scene: Scene, descriptor: AssetDescriptor): AssetContainer {
  const container = new AssetContainer(scene);
  (container as AssetContainer & { metadata?: Record<string, unknown> }).metadata = {
    __wastelandFailed: true,
    key: descriptor.key,
    url: descriptor.url,
  };
  return container;
}
