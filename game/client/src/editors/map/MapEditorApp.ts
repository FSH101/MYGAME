import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  GizmoManager,
  HemisphericLight,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import { v4 as uuidv4 } from "@lukeed/uuid";
import type { RendererHandle } from "../../render/initRenderer";
import { initRenderer } from "../../render/initRenderer";
import { ModelLibrary, type ModelInstance, type ModelTemplate } from "../common/ModelLibrary";

interface MapObject {
  id: string;
  instance: ModelInstance;
  template: ModelTemplate;
}

interface ExportedMapObject {
  id: string;
  modelFile: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface ExportedMapData {
  version: 1;
  createdAt: string;
  objects: ExportedMapObject[];
}

interface PanelRefs {
  root: HTMLDivElement;
  modelList: HTMLDivElement;
  placementList: HTMLDivElement;
  log: HTMLDivElement;
  jsonArea: HTMLTextAreaElement;
  fileInput: HTMLInputElement;
  selectedModelLabel: HTMLSpanElement;
  deleteButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  clearSelectionButton: HTMLButtonElement;
}

export class MapEditorApp {
  private renderer: RendererHandle;
  private scene: Scene;
  private library: ModelLibrary;
  private gizmos: GizmoManager;
  private readonly objects = new Map<string, MapObject>();
  private selectedModelId: string | null = null;
  private selectedObjectId: string | null = null;
  private readonly refs: PanelRefs;

  constructor(private readonly container: HTMLElement) {
    this.renderer = initRenderer(container, {});
    this.scene = new Scene(this.renderer.engine);
    this.scene.clearColor = new Color4(0.07, 0.09, 0.12, 1);

    this.library = new ModelLibrary(this.scene);

    this.createCamera();
    this.createEnvironment();
    this.setupPicking();

    this.gizmos = new GizmoManager(this.scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.gizmos.positionGizmoEnabled = true;
    this.gizmos.rotationGizmoEnabled = true;
    this.gizmos.scaleGizmoEnabled = true;

    this.refs = this.createPanel();
    this.renderer.start(() => this.scene.render());
  }

  dispose(): void {
    this.renderer.stop();
    this.renderer.dispose();
    this.gizmos.dispose();
    this.scene.dispose();
  }

  private createCamera(): void {
    const camera = new ArcRotateCamera(
      "mapCamera",
      Math.PI / 4,
      Math.PI / 3,
      120,
      new Vector3(0, 0, 0),
      this.scene,
    );
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 600;
    camera.wheelPrecision = 50;
    camera.panningSensibility = 450;
    camera.attachControl(this.renderer.canvas, true);
  }

  private createEnvironment(): void {
    const light = new HemisphericLight("sun", new Vector3(0.25, 1, 0.1), this.scene);
    light.intensity = 1.15;

    const ground = MeshBuilder.CreateGround("ground", { width: 400, height: 400 }, this.scene);
    ground.receiveShadows = true;
    ground.isPickable = true;
    ground.metadata = { __editorGround: true };

    const gridMaterial = new GridMaterial("gridMaterial", this.scene);
    gridMaterial.gridRatio = 5;
    gridMaterial.opacity = 0.35;
    gridMaterial.mainColor = new Color3(0.9, 0.9, 0.9);
    gridMaterial.lineColor = new Color3(0.2, 0.4, 0.6);
    const grid = MeshBuilder.CreateGround("grid", { width: 400, height: 400, subdivisions: 1 }, this.scene);
    grid.isPickable = false;
    grid.material = gridMaterial;
    grid.position.y = 0.01;
  }

  private setupPicking(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        const event = pointerInfo.event as PointerEvent;
        if (event.button !== 0) {
          return;
        }
        if (event.composedPath().some((node) => node instanceof HTMLElement && node.closest(".map-editor"))) {
          return;
        }
        const pick = pointerInfo.pickInfo;
        if (!pick || !pick.hit || !pick.pickedMesh) {
          this.setSelectedObject(null);
          return;
        }
        const anchor = this.resolveAnchor(pick.pickedMesh);
        if (anchor) {
          this.selectObjectByAnchor(anchor);
          return;
        }
        if (this.selectedModelId) {
          this.spawnObject(pick.pickedPoint ?? new Vector3(0, 0, 0));
        }
      }
    });
  }

  private resolveAnchor(mesh: AbstractMesh): AbstractMesh | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      if (this.isAnchor(current)) {
        return current;
      }
      current = current.parent as AbstractMesh | null;
    }
    return null;
  }

  private isAnchor(mesh: AbstractMesh): boolean {
    for (const object of this.objects.values()) {
      if (object.instance.anchor === mesh) {
        return true;
      }
    }
    return false;
  }

  private selectObjectByAnchor(anchor: AbstractMesh): void {
    for (const [id, object] of this.objects) {
      if (object.instance.anchor === anchor) {
        this.setSelectedObject(id);
        return;
      }
    }
    this.setSelectedObject(null);
  }

  private spawnObject(point: Vector3): void {
    const modelId = this.selectedModelId;
    if (!modelId) {
      return;
    }
    try {
      const instance = this.library.instantiate(modelId);
      instance.anchor.position.copyFrom(point);
      const template = this.library.getTemplate(modelId);
      if (!template) throw new Error("Шаблон не найден после создания");
      const id = uuidv4();
      const mapObject: MapObject = { id, instance, template };
      this.objects.set(id, mapObject);
      this.updatePlacements();
      this.setSelectedObject(id);
      this.log(`Объект ${template.displayName} добавлен на карту`);
    } catch (error) {
      this.logError(error);
    }
  }

  private setSelectedModel(id: string | null): void {
    this.selectedModelId = id;
    this.refs.selectedModelLabel.textContent = id
      ? this.library.getTemplate(id)?.displayName ?? ""
      : "не выбрана";
  }

  private setSelectedObject(id: string | null): void {
    this.selectedObjectId = id;
    if (!id) {
      this.gizmos.attachToMesh(null);
      this.refs.deleteButton.disabled = true;
      this.refs.clearSelectionButton.disabled = true;
      return;
    }
    const object = this.objects.get(id);
    if (!object) {
      this.gizmos.attachToMesh(null);
      this.refs.deleteButton.disabled = true;
      this.refs.clearSelectionButton.disabled = true;
      return;
    }
    this.gizmos.attachToMesh(object.instance.anchor);
    this.refs.deleteButton.disabled = false;
    this.refs.clearSelectionButton.disabled = false;
    this.highlightPlacement(id);
  }

  private highlightPlacement(id: string): void {
    for (const element of Array.from(this.refs.placementList.querySelectorAll<HTMLDivElement>(".placement"))) {
      element.classList.toggle("selected", element.dataset.id === id);
    }
  }

  private updatePlacements(): void {
    this.refs.placementList.innerHTML = "";
    for (const [id, object] of this.objects) {
      const div = document.createElement("div");
      div.className = "placement";
      div.dataset.id = id;
      div.textContent = `${object.template.displayName}`;
      div.addEventListener("click", () => this.setSelectedObject(id));
      this.refs.placementList.appendChild(div);
    }
  }

  private createPanel(): PanelRefs {
    const root = document.createElement("div");
    root.className = "map-editor";
    root.innerHTML = `
      <style>
        .map-editor {
          position: absolute;
          inset: 0;
          pointer-events: none;
          font-family: 'Segoe UI', sans-serif;
          color: #f4e3c2;
        }
        .map-editor .panel {
          position: absolute;
          top: 1rem;
          left: 1rem;
          width: 320px;
          max-height: calc(100% - 2rem);
          background: rgba(12, 17, 24, 0.92);
          border-radius: 16px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          pointer-events: auto;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }
        .map-editor h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .map-editor .section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .map-editor input[type="file"] {
          width: 100%;
        }
        .map-editor .models,
        .map-editor .placements {
          display: grid;
          gap: 0.35rem;
          max-height: 140px;
          overflow-y: auto;
        }
        .map-editor .models .model,
        .map-editor .placements .placement {
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .map-editor .models .model:hover,
        .map-editor .placements .placement:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .map-editor .models .model.selected,
        .map-editor .placements .placement.selected {
          background: rgba(255, 198, 0, 0.28);
        }
        .map-editor .log {
          background: rgba(0, 0, 0, 0.35);
          border-radius: 10px;
          padding: 0.6rem;
          max-height: 120px;
          overflow-y: auto;
          font-size: 0.8rem;
          line-height: 1.4;
        }
        .map-editor textarea {
          width: 100%;
          min-height: 80px;
          border-radius: 10px;
          border: none;
          padding: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          color: inherit;
          resize: vertical;
        }
        .map-editor button {
          border: none;
          border-radius: 10px;
          padding: 0.5rem 0.75rem;
          background: linear-gradient(135deg, rgba(255, 198, 0, 0.55), rgba(255, 145, 0, 0.65));
          color: #1b232d;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .map-editor button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .map-editor button:not(:disabled):hover {
          transform: translateY(-1px);
        }
        .map-editor .selected-model {
          font-size: 0.85rem;
          opacity: 0.85;
        }
      </style>
      <div class="panel">
        <div class="section">
          <h2>Библиотека моделей</h2>
          <input type="file" accept=".glb,.gltf" multiple />
          <div class="selected-model">Выбрана: <span class="selected-model-name">не выбрана</span></div>
          <div class="models"></div>
        </div>
        <div class="section">
          <h2>Объекты на карте</h2>
          <div class="placements"></div>
          <div class="actions">
            <button class="clear-selection" disabled>Снять выделение</button>
            <button class="delete" disabled>Удалить объект</button>
          </div>
        </div>
        <div class="section">
          <h2>Импорт / экспорт</h2>
          <textarea class="json" placeholder="Здесь появится JSON карты"></textarea>
          <button class="export">Экспортировать</button>
          <button class="import">Импортировать</button>
        </div>
        <div class="section">
          <h2>Журнал</h2>
          <div class="log"></div>
        </div>
      </div>
    `;
    this.container.appendChild(root);

    const panel: PanelRefs = {
      root,
      modelList: root.querySelector<HTMLDivElement>(".models")!,
      placementList: root.querySelector<HTMLDivElement>(".placements")!,
      log: root.querySelector<HTMLDivElement>(".log")!,
      jsonArea: root.querySelector<HTMLTextAreaElement>(".json")!,
      fileInput: root.querySelector<HTMLInputElement>("input[type=file]")!,
      selectedModelLabel: root.querySelector<HTMLSpanElement>(".selected-model-name")!,
      deleteButton: root.querySelector<HTMLButtonElement>(".delete")!,
      exportButton: root.querySelector<HTMLButtonElement>(".export")!,
      importButton: root.querySelector<HTMLButtonElement>(".import")!,
      clearSelectionButton: root.querySelector<HTMLButtonElement>(".clear-selection")!,
    };

    panel.fileInput.addEventListener("change", async () => {
      const files = panel.fileInput.files;
      if (!files || files.length === 0) {
        return;
      }
      await this.handleFiles(files);
      panel.fileInput.value = "";
    });

    panel.deleteButton.addEventListener("click", () => {
      if (!this.selectedObjectId) return;
      const object = this.objects.get(this.selectedObjectId);
      if (!object) return;
      object.instance.dispose();
      this.objects.delete(this.selectedObjectId);
      this.setSelectedObject(null);
      this.updatePlacements();
      this.log(`Объект ${object.template.displayName} удалён`);
    });

    panel.exportButton.addEventListener("click", () => {
      const data = this.exportMap();
      panel.jsonArea.value = JSON.stringify(data, null, 2);
      this.log("Карта экспортирована в JSON");
    });

    panel.importButton.addEventListener("click", () => {
      try {
        const text = panel.jsonArea.value.trim();
        if (!text) {
          throw new Error("Поле JSON пустое");
        }
        const data = JSON.parse(text) as ExportedMapData;
        this.importMap(data);
        this.log("Карта импортирована");
      } catch (error) {
        this.logError(error);
      }
    });

    panel.clearSelectionButton.addEventListener("click", () => this.setSelectedObject(null));

    return panel;
  }

  private async handleFiles(files: FileList | File[]): Promise<void> {
    try {
      const templates = await this.library.importFiles(files);
      this.updateModelList();
      if (templates.length > 0) {
        this.setSelectedModel(templates[templates.length - 1].id);
      }
      templates.forEach((template) => this.log(`Модель ${template.fileName} импортирована`));
    } catch (error) {
      this.logError(error);
    }
  }

  private updateModelList(): void {
    this.refs.modelList.innerHTML = "";
    const templates = this.library.list();
    for (const template of templates) {
      const div = document.createElement("div");
      div.className = "model";
      div.textContent = template.displayName;
      div.dataset.id = template.id;
      div.addEventListener("click", () => {
        this.setSelectedModel(template.id);
        this.highlightModel(template.id);
      });
      this.refs.modelList.appendChild(div);
    }
    if (this.selectedModelId) {
      this.highlightModel(this.selectedModelId);
    }
  }

  private highlightModel(id: string): void {
    for (const element of Array.from(this.refs.modelList.querySelectorAll<HTMLDivElement>(".model"))) {
      element.classList.toggle("selected", element.dataset.id === id);
    }
  }

  private exportMap(): ExportedMapData {
    const objects: ExportedMapObject[] = [];
    for (const object of this.objects.values()) {
      const anchor = object.instance.anchor;
      objects.push({
        id: object.id,
        modelFile: object.template.fileName,
        position: [anchor.position.x, anchor.position.y, anchor.position.z],
        rotation: [anchor.rotation.x, anchor.rotation.y, anchor.rotation.z],
        scale: [anchor.scaling.x, anchor.scaling.y, anchor.scaling.z],
      });
    }
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      objects,
    };
  }

  private importMap(data: ExportedMapData): void {
    for (const object of this.objects.values()) {
      object.instance.dispose();
    }
    this.objects.clear();
    this.setSelectedObject(null);

    for (const item of data.objects) {
      const template = this.library.findByFileName(item.modelFile);
      if (!template) {
        this.log(`Модель ${item.modelFile} не найдена в библиотеке, объект пропущен`);
        continue;
      }
      const instance = this.library.instantiate(template.id);
      instance.anchor.position.set(item.position[0], item.position[1], item.position[2]);
      instance.anchor.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
      instance.anchor.scaling.set(item.scale[0], item.scale[1], item.scale[2]);
      const mapObject: MapObject = { id: item.id ?? uuidv4(), instance, template };
      this.objects.set(mapObject.id, mapObject);
    }
    this.updatePlacements();
  }

  private log(message: string): void {
    const entry = document.createElement("div");
    entry.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
    this.refs.log.appendChild(entry);
    this.refs.log.scrollTop = this.refs.log.scrollHeight;
  }

  private logError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.log(`Ошибка: ${message}`);
  }
}
