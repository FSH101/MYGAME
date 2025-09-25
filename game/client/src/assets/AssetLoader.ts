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
  const directories = getCandidateDirectories(directory);

  const glbContainer = await tryLoadGlbCandidates(scene, directories, baseName);
  if (glbContainer) {
    return glbContainer;
  }

  const fbxContainer = await tryLoadFbxCandidates(scene, directories, baseName);
  if (fbxContainer) {
    return fbxContainer;
  }

  let lastError: unknown = null;
  const maxCandidates = createCandidateUrls(directories, baseName, [".max"]);
  for (const candidate of maxCandidates) {
    const { directory: candidateDir, baseName: candidateBase } = splitPath(candidate);
    maxLoader.setResourcePath(candidateDir);
    maxLoader.setPath(candidateDir);
    try {
      const object = await maxLoader.loadAsync(candidate);

      const textures = await prepareTextures(candidateDir, candidateBase);
      applyMaterials(object, textures);
      normalizeModel(object);

      const glb = await exportToGlb(object, []);
      const container = await SceneLoader.LoadAssetContainerAsync("data:", glb, scene, undefined, ".glb");
      return container;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    logger.warn(`Импорт .max не удался, пробуем резервный GLB для ${baseName}`, lastError);
  } else {
    logger.warn(`Файл .max для ${baseName} не найден, пробуем резервный GLB`);
  }

  return loadGlbFallback(scene, directories, baseName);
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

async function loadGlbFallback(scene: Scene, directories: string[], baseName: string): Promise<AssetContainer> {
  const candidates = createCandidateUrls(directories, baseName, [".glb"]);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const { rootUrl, fileName } = splitUrl(candidate);
      return await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Не удалось загрузить резервный GLB ${baseName}`);
}

function getCandidateDirectories(directory: string): string[] {
  const directories = new Set<string>();
  const variants = new Set<string>();

  const normalized = normalizeDirectory(directory);
  variants.add(normalized);

  if (typeof window !== "undefined") {
    try {
      const base = document.baseURI ?? window.location.href;
      const absolute = new URL(directory || "./", base).pathname;
      variants.add(normalizeDirectory(absolute));
    } catch (error) {
      logger.warn("Не удалось вычислить абсолютный путь для ассетов", error);
    }
  }

  for (const variant of variants) {
    const cleaned = variant.replace(/\\/g, "/");
    const normalizedVariant = normalizeDirectory(cleaned);
    if (normalizedVariant) {
      directories.add(normalizedVariant);
    }

    const withoutLeadingSlash = cleaned.replace(/^\/+/, "");
    if (withoutLeadingSlash) {
      directories.add(normalizeDirectory(withoutLeadingSlash));
      directories.add(normalizeDirectory(`/${withoutLeadingSlash}`));
    }
  }

  const additional = new Set<string>();
  for (const dir of directories) {
    const stripped = dir.replace(/^\/+/, "");
    if (stripped.includes("assets/models/")) {
      const alternate = stripped.replace("assets/models/", "models/");
      additional.add(alternate);
      additional.add(`/${alternate}`);
    }
  }

  for (const dir of additional) {
    const normalizedDir = normalizeDirectory(dir);
    if (normalizedDir) {
      directories.add(normalizedDir);
    }
  }

  return Array.from(directories);
}

function normalizeDirectory(directory: string): string {
  if (!directory) {
    return "";
  }
  let normalized = directory.replace(/\\/g, "/");
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  return normalized;
}

function createCandidateUrls(directories: string[], baseName: string, extensions: string[]): string[] {
  const candidates = new Set<string>();
  const nameVariants = new Set<string>([baseName, baseName.toLowerCase()]);
  for (const directory of directories) {
    const dir = normalizeDirectory(directory);
    for (const name of nameVariants) {
      for (const ext of extensions) {
        const variants = [ext, ext.toUpperCase()];
        for (const variant of variants) {
          candidates.add(`${dir}${name}${variant}`);
        }
      }
    }
  }
  return Array.from(candidates);
}

async function tryLoadGlbCandidates(scene: Scene, directories: string[], baseName: string): Promise<AssetContainer | null> {
  const glbCandidates = createCandidateUrls(directories, baseName, [".glb", ".gltf"]);
  for (const candidate of glbCandidates) {
    try {
      const { rootUrl, fileName } = splitUrl(candidate);
      return await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
    } catch (error) {
      // continue to next candidate
    }
  }
  return null;
}

async function tryLoadFbxCandidates(scene: Scene, directories: string[], baseName: string): Promise<AssetContainer | null> {
  const fbxCandidates = createCandidateUrls(directories, baseName, [".fbx"]);
  for (const candidate of fbxCandidates) {
    try {
      return await loadFBXTemplate(scene, candidate);
    } catch (error) {
      // continue to next candidate
    }
  }
  return null;
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
