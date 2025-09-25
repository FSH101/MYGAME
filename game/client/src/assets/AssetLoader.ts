import { AssetContainer, Scene, SceneLoader, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

export type AssetDescriptor = {
  key: string;
  type: "gltf";
  url: string;
};

const gltfTemplates = new Map<string, AssetContainer>();
let instanceCounter = 0;

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
    if (descriptor.type === "gltf") {
      if (!gltfTemplates.has(descriptor.key)) {
        const { rootUrl, fileName } = splitUrl(descriptor.url);
        const container = await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene);
        gltfTemplates.set(descriptor.key, container);
      }
    }
    completed += 1;
    onProgress?.(completed / descriptors.length);
  }
}

export function instantiateGLTF(key: string, parent: TransformNode): AssetContainer {
  const template = gltfTemplates.get(key);
  if (!template) {
    throw new Error(`Asset template '${key}' is not loaded`);
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
  for (const container of gltfTemplates.values()) {
    container.dispose();
  }
  gltfTemplates.clear();
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
