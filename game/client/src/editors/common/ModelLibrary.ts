import { AbstractMesh, AssetContainer, MeshBuilder, Scene, Vector3 } from "@babylonjs/core";
import { v4 as uuidv4 } from "@lukeed/uuid";
import { loadContainerFromLocalFile, resolveLocalModel } from "../../assets/LocalModelLoader";

export interface ModelTemplate {
  id: string;
  fileName: string;
  displayName: string;
  container: AssetContainer;
}

export interface ModelInstance {
  id: string;
  templateId: string;
  anchor: AbstractMesh;
  container: AssetContainer;
  dispose(): void;
}

export class ModelLibrary {
  private templates = new Map<string, ModelTemplate>();

  constructor(private readonly scene: Scene) {}

  async importFiles(files: FileList | File[]): Promise<ModelTemplate[]> {
    const list = Array.from(files);
    const results: ModelTemplate[] = [];
    for (const file of list) {
      const template = await this.importFile(file);
      results.push(template);
    }
    return results;
  }

  async importFile(file: File): Promise<ModelTemplate> {
    const source = resolveLocalModel(file);
    const container = await loadContainerFromLocalFile(this.scene, source);
    container.removeAllFromScene();
    const fileName = file.name;
    const displayName = this.makeDisplayName(fileName);
    const id = uuidv4();
    const template: ModelTemplate = {
      id,
      fileName,
      displayName,
      container,
    };
    this.templates.set(id, template);
    return template;
  }

  list(): ModelTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): ModelTemplate | undefined {
    return this.templates.get(id);
  }

  findByFileName(fileName: string): ModelTemplate | undefined {
    const normalized = fileName.trim().toLowerCase();
    for (const template of this.templates.values()) {
      if (template.fileName.trim().toLowerCase() === normalized) {
        return template;
      }
    }
    return undefined;
  }

  instantiate(templateId: string): ModelInstance {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Шаблон модели ${templateId} не найден`);
    }
    const anchor = MeshBuilder.CreateBox(`anchor_${templateId}_${Date.now()}`, { size: 0.1 }, this.scene);
    anchor.isVisible = false;
    anchor.isPickable = false;
    anchor.scaling = new Vector3(1, 1, 1);
    anchor.rotationQuaternion = null;

    const instanceContainer = template.container.instantiateModelsToScene(
      (name) => `${anchor.name}_${name}`,
      anchor,
    );
    instanceContainer.addAllToScene();

    for (const node of instanceContainer.rootNodes) {
      if (node.parent === null) {
        node.parent = anchor;
      }
    }
    for (const mesh of instanceContainer.meshes) {
      if (!mesh.parent) {
        mesh.parent = anchor;
      }
    }

    const instanceId = uuidv4();

    return {
      id: instanceId,
      templateId,
      anchor,
      container: instanceContainer,
      dispose: () => {
        instanceContainer.dispose();
        anchor.dispose();
      },
    };
  }

  private makeDisplayName(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    if (dot === -1) {
      return fileName;
    }
    return fileName.slice(0, dot);
  }
}
