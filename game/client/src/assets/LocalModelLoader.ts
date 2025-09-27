import type { AssetContainer, Scene } from "@babylonjs/core";
import { loadContainerFromGlbData } from "./AssetLoader";

export type SupportedLocalModelType = "glb" | "gltf";

export interface LocalModelSource {
  file: File;
  type: SupportedLocalModelType;
}

const SUPPORTED_EXTENSIONS = new Map<string, SupportedLocalModelType>([
  ["glb", "glb"],
  ["gltf", "gltf"],
]);

export function resolveLocalModel(file: File): LocalModelSource {
  const name = file.name ?? "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    throw new Error("Файл без расширения не поддерживается");
  }
  const ext = name
    .slice(dot + 1)
    .trim()
    .toLowerCase();
  const type = SUPPORTED_EXTENSIONS.get(ext);
  if (!type) {
    const supported = Array.from(SUPPORTED_EXTENSIONS.keys())
      .map((value) => `*.${value}`)
      .join(", ");
    throw new Error(`Формат ${ext} не поддерживается. Доступные форматы: ${supported}`);
  }
  return { file, type };
}

export async function loadContainerFromLocalFile(
  scene: Scene,
  source: LocalModelSource,
): Promise<AssetContainer> {
  if (source.type === "glb") {
    return await loadContainerFromGlbData(scene, source.file);
  }
  if (source.type === "gltf") {
    const buffer = await source.file.arrayBuffer();
    const blob = new Blob([buffer], { type: "model/gltf+json" });
    return await loadContainerFromGlbData(scene, blob);
  }
  throw new Error(`Неизвестный тип источника: ${source.type}`);
}
