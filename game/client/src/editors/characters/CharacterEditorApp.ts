import {
  ArcRotateCamera,
  Color3,
  Color4,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { v4 as uuidv4 } from "@lukeed/uuid";
import type { RendererHandle } from "../../render/initRenderer";
import { initRenderer } from "../../render/initRenderer";
import { ModelLibrary, type ModelInstance } from "../common/ModelLibrary";

interface CharacterStats {
  health: number;
  stamina: number;
  attack: number;
  defense: number;
  speed: number;
}

type CharacterKind = "player" | "mob";

interface CharacterDefinition {
  id: string;
  name: string;
  kind: CharacterKind;
  stats: CharacterStats;
  modelFile?: string;
}

interface CharacterState extends CharacterDefinition {
  instance?: ModelInstance;
}

interface PanelRefs {
  root: HTMLDivElement;
  fileInput: HTMLInputElement;
  modelList: HTMLDivElement;
  characterList: HTMLDivElement;
  form: HTMLFormElement;
  nameInput: HTMLInputElement;
  kindSelect: HTMLSelectElement;
  stats: Record<keyof CharacterStats, HTMLInputElement>;
  modelSelect: HTMLSelectElement;
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  jsonArea: HTMLTextAreaElement;
  log: HTMLDivElement;
  addButton: HTMLButtonElement;
  removeButton: HTMLButtonElement;
}

interface ExportedCharacterData {
  version: 1;
  createdAt: string;
  characters: CharacterDefinition[];
}

export class CharacterEditorApp {
  private renderer: RendererHandle;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private library: ModelLibrary;
  private characters = new Map<string, CharacterState>();
  private selectedCharacterId: string | null = null;
  private readonly refs: PanelRefs;

  constructor(private readonly container: HTMLElement) {
    this.renderer = initRenderer(container, {});
    this.scene = new Scene(this.renderer.engine);
    this.scene.clearColor = new Color4(0.06, 0.08, 0.12, 1);

    this.camera = new ArcRotateCamera(
      "characterCamera",
      Math.PI / 4,
      Math.PI / 3,
      6,
      new Vector3(0, 1.2, 0),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 2;
    this.camera.upperRadiusLimit = 15;
    this.camera.attachControl(this.renderer.canvas, true);
    this.camera.wheelPrecision = 40;
    this.camera.target = new Vector3(0, 1, 0);

    const light = new HemisphericLight("sun", new Vector3(0.25, 1, 0.2), this.scene);
    light.intensity = 1.2;
    light.diffuse = new Color3(1, 1, 0.95);

    this.library = new ModelLibrary(this.scene);

    this.refs = this.createPanel();

    this.renderer.start(() => this.scene.render());
  }

  dispose(): void {
    this.renderer.stop();
    this.renderer.dispose();
    this.scene.dispose();
  }

  private createPanel(): PanelRefs {
    const root = document.createElement("div");
    root.className = "character-editor";
    root.innerHTML = `
      <style>
        .character-editor {
          position: absolute;
          inset: 0;
          pointer-events: none;
          font-family: 'Segoe UI', sans-serif;
          color: #f4e3c2;
        }
        .character-editor .panel {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 360px;
          max-height: calc(100% - 2rem);
          background: rgba(12, 17, 24, 0.92);
          border-radius: 16px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          pointer-events: auto;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }
        .character-editor h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .character-editor .section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .character-editor input[type="file"] {
          width: 100%;
        }
        .character-editor .models,
        .character-editor .characters {
          display: grid;
          gap: 0.35rem;
          max-height: 120px;
          overflow-y: auto;
        }
        .character-editor .models .model,
        .character-editor .characters .character {
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .character-editor .models .model:hover,
        .character-editor .characters .character:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .character-editor .models .model.selected,
        .character-editor .characters .character.selected {
          background: rgba(102, 215, 255, 0.28);
        }
        .character-editor form {
          display: grid;
          gap: 0.45rem;
        }
        .character-editor label {
          display: flex;
          flex-direction: column;
          font-size: 0.85rem;
          gap: 0.25rem;
        }
        .character-editor input[type="text"],
        .character-editor input[type="number"],
        .character-editor select {
          border: none;
          border-radius: 10px;
          padding: 0.45rem 0.6rem;
          background: rgba(255, 255, 255, 0.08);
          color: inherit;
        }
        .character-editor button {
          border: none;
          border-radius: 10px;
          padding: 0.5rem 0.75rem;
          background: linear-gradient(135deg, rgba(102, 215, 255, 0.55), rgba(83, 138, 255, 0.65));
          color: #102030;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .character-editor button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .character-editor button:not(:disabled):hover {
          transform: translateY(-1px);
        }
        .character-editor textarea {
          width: 100%;
          min-height: 80px;
          border-radius: 10px;
          border: none;
          padding: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          color: inherit;
          resize: vertical;
        }
        .character-editor .log {
          background: rgba(0, 0, 0, 0.35);
          border-radius: 10px;
          padding: 0.6rem;
          max-height: 120px;
          overflow-y: auto;
          font-size: 0.8rem;
          line-height: 1.4;
        }
      </style>
      <div class="panel">
        <div class="section">
          <h2>Библиотека моделей</h2>
          <input type="file" accept=".glb,.gltf" multiple />
          <div class="models"></div>
        </div>
        <div class="section">
          <h2>Персонажи</h2>
          <button class="add">Добавить персонажа</button>
          <div class="characters"></div>
          <button class="remove" disabled>Удалить выбранного</button>
        </div>
        <div class="section">
          <h2>Характеристики</h2>
          <form class="details">
            <label>Имя
              <input name="name" type="text" placeholder="Название" required />
            </label>
            <label>Роль
              <select name="kind">
                <option value="player">Игрок</option>
                <option value="mob">Моб</option>
              </select>
            </label>
            <label>Модель
              <select name="model">
                <option value="">— не назначена —</option>
              </select>
            </label>
            <label>Здоровье
              <input name="health" type="number" min="1" max="9999" step="1" />
            </label>
            <label>Выносливость
              <input name="stamina" type="number" min="0" max="9999" step="1" />
            </label>
            <label>Атака
              <input name="attack" type="number" min="0" max="999" step="1" />
            </label>
            <label>Защита
              <input name="defense" type="number" min="0" max="999" step="1" />
            </label>
            <label>Скорость
              <input name="speed" type="number" min="0" max="100" step="0.1" />
            </label>
          </form>
        </div>
        <div class="section">
          <h2>Импорт / экспорт</h2>
          <textarea class="json" placeholder="Здесь появится JSON персонажей"></textarea>
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

    const statsInputs = {
      health: root.querySelector<HTMLInputElement>('input[name="health"]')!,
      stamina: root.querySelector<HTMLInputElement>('input[name="stamina"]')!,
      attack: root.querySelector<HTMLInputElement>('input[name="attack"]')!,
      defense: root.querySelector<HTMLInputElement>('input[name="defense"]')!,
      speed: root.querySelector<HTMLInputElement>('input[name="speed"]')!,
    } satisfies Record<keyof CharacterStats, HTMLInputElement>;

    const panel: PanelRefs = {
      root,
      fileInput: root.querySelector<HTMLInputElement>('input[type="file"]')!,
      modelList: root.querySelector<HTMLDivElement>('.models')!,
      characterList: root.querySelector<HTMLDivElement>('.characters')!,
      form: root.querySelector<HTMLFormElement>('form.details')!,
      nameInput: root.querySelector<HTMLInputElement>('input[name="name"]')!,
      kindSelect: root.querySelector<HTMLSelectElement>('select[name="kind"]')!,
      stats: statsInputs,
      modelSelect: root.querySelector<HTMLSelectElement>('select[name="model"]')!,
      exportButton: root.querySelector<HTMLButtonElement>('.export')!,
      importButton: root.querySelector<HTMLButtonElement>('.import')!,
      jsonArea: root.querySelector<HTMLTextAreaElement>('.json')!,
      log: root.querySelector<HTMLDivElement>('.log')!,
      addButton: root.querySelector<HTMLButtonElement>('.add')!,
      removeButton: root.querySelector<HTMLButtonElement>('.remove')!,
    };

    panel.fileInput.addEventListener("change", async () => {
      const files = panel.fileInput.files;
      if (!files || files.length === 0) return;
      await this.handleModelFiles(files);
      panel.fileInput.value = "";
    });

    panel.addButton.addEventListener("click", () => this.createCharacter());
    panel.removeButton.addEventListener("click", () => this.removeSelected());

    panel.exportButton.addEventListener("click", () => {
      const data = this.exportCharacters();
      panel.jsonArea.value = JSON.stringify(data, null, 2);
      this.log("Список персонажей экспортирован в JSON");
    });

    panel.importButton.addEventListener("click", () => {
      try {
        const text = panel.jsonArea.value.trim();
        if (!text) {
          throw new Error("Поле JSON пустое");
        }
        const data = JSON.parse(text) as ExportedCharacterData;
        this.importCharacters(data);
        this.log("Персонажи импортированы");
      } catch (error) {
        this.logError(error);
      }
    });

    panel.form.addEventListener("change", () => this.syncFormToCharacter());
    panel.form.addEventListener("input", () => this.syncFormToCharacter());

    return panel;
  }

  private async handleModelFiles(files: FileList | File[]): Promise<void> {
    try {
      const templates = await this.library.importFiles(files);
      this.updateModelList();
      this.log(`${templates.length} моделей добавлено в библиотеку`);
    } catch (error) {
      this.logError(error);
    }
  }

  private updateModelList(): void {
    this.refs.modelList.innerHTML = "";
    const select = this.refs.modelSelect;
    select.innerHTML = '<option value="">— не назначена —</option>';

    for (const template of this.library.list()) {
      const modelDiv = document.createElement("div");
      modelDiv.className = "model";
      modelDiv.textContent = template.displayName;
      modelDiv.dataset.id = template.id;
      modelDiv.addEventListener("click", () => {
        this.highlightModelById(template.id);
        this.refs.modelSelect.value = template.fileName;
        this.syncFormToCharacter();
      });
      this.refs.modelList.appendChild(modelDiv);

      const option = document.createElement("option");
      option.value = template.fileName;
      option.textContent = template.displayName;
      select.appendChild(option);
    }

    const character = this.selectedCharacterId ? this.characters.get(this.selectedCharacterId) : undefined;
    if (character?.modelFile) {
      select.value = character.modelFile;
    }
    this.highlightModelByFile(character?.modelFile);
  }

  private highlightModelById(id: string | null): void {
    for (const element of Array.from(this.refs.modelList.querySelectorAll<HTMLDivElement>(".model"))) {
      element.classList.toggle("selected", id !== null && element.dataset.id === id);
    }
  }

  private highlightModelByFile(fileName?: string): void {
    if (!fileName) {
      this.highlightModelById(null);
      return;
    }
    const template = this.library.findByFileName(fileName);
    this.highlightModelById(template?.id ?? null);
  }

  private createCharacter(): void {
    const id = uuidv4();
    const character: CharacterState = {
      id,
      name: `Новый персонаж ${this.characters.size + 1}`,
      kind: "mob",
      stats: {
        health: 100,
        stamina: 50,
        attack: 10,
        defense: 5,
        speed: 1.5,
      },
    };
    this.characters.set(id, character);
    this.updateCharacterList();
    this.selectCharacter(id);
    this.log(`Создан персонаж ${character.name}`);
  }

  private removeSelected(): void {
    if (!this.selectedCharacterId) return;
    const character = this.characters.get(this.selectedCharacterId);
    if (!character) return;
    character.instance?.dispose();
    this.characters.delete(this.selectedCharacterId);
    this.selectedCharacterId = null;
    this.updateCharacterList();
    this.updateForm(null);
    this.refs.removeButton.disabled = true;
    this.log(`Персонаж ${character.name} удалён`);
  }

  private updateCharacterList(): void {
    this.refs.characterList.innerHTML = "";
    for (const [id, character] of this.characters) {
      const div = document.createElement("div");
      div.className = "character";
      div.dataset.id = id;
      div.textContent = `${character.name} — ${character.kind === "player" ? "Игрок" : "Моб"}`;
      div.addEventListener("click", () => this.selectCharacter(id));
      this.refs.characterList.appendChild(div);
    }
    this.highlightSelectedCharacter();
  }

  private highlightSelectedCharacter(): void {
    for (const element of Array.from(this.refs.characterList.querySelectorAll<HTMLDivElement>(".character"))) {
      element.classList.toggle("selected", element.dataset.id === this.selectedCharacterId);
    }
  }

  private selectCharacter(id: string): void {
    const character = this.characters.get(id);
    if (!character) return;
    this.selectedCharacterId = id;
    this.refs.removeButton.disabled = false;
    this.updateForm(character);
    this.highlightSelectedCharacter();
    this.syncPreview(character);
  }

  private updateForm(character: CharacterState | null): void {
    const { nameInput, kindSelect, stats, modelSelect } = this.refs;
    if (!character) {
      nameInput.value = "";
      kindSelect.value = "mob";
      modelSelect.value = "";
      for (const key of Object.keys(stats) as Array<keyof CharacterStats>) {
        stats[key].value = "";
      }
      this.highlightModelById(null);
      return;
    }
    nameInput.value = character.name;
    kindSelect.value = character.kind;
    modelSelect.value = character.modelFile ?? "";
    stats.health.value = character.stats.health.toString();
    stats.stamina.value = character.stats.stamina.toString();
    stats.attack.value = character.stats.attack.toString();
    stats.defense.value = character.stats.defense.toString();
    stats.speed.value = character.stats.speed.toString();
    this.highlightModelByFile(character.modelFile);
  }

  private syncFormToCharacter(): void {
    if (!this.selectedCharacterId) return;
    const character = this.characters.get(this.selectedCharacterId);
    if (!character) return;

    character.name = this.refs.nameInput.value;
    character.kind = this.refs.kindSelect.value as CharacterKind;
    character.modelFile = this.refs.modelSelect.value || undefined;
    character.stats = {
      health: Number(this.refs.stats.health.value) || 0,
      stamina: Number(this.refs.stats.stamina.value) || 0,
      attack: Number(this.refs.stats.attack.value) || 0,
      defense: Number(this.refs.stats.defense.value) || 0,
      speed: Number(this.refs.stats.speed.value) || 0,
    };

    this.updateCharacterList();
    this.highlightSelectedCharacter();
    this.syncPreview(character);
  }

  private syncPreview(character: CharacterState): void {
    character.instance?.dispose();
    character.instance = undefined;

    if (!character.modelFile) {
      return;
    }
    const template = this.library.findByFileName(character.modelFile);
    if (!template) {
      this.log(`Модель ${character.modelFile} не найдена. Загрузите её и попробуйте снова.`);
      return;
    }
    const instance = this.library.instantiate(template.id);
    instance.anchor.position.set(0, 0, 0);
    this.centerPreview(instance);
    character.instance = instance;
  }

  private centerPreview(instance: ModelInstance): void {
    const meshes = instance.container.meshes;
    if (meshes.length === 0) {
      return;
    }
    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (const mesh of meshes) {
      const bounding = mesh.getBoundingInfo();
      min.x = Math.min(min.x, bounding.boundingBox.minimumWorld.x);
      min.y = Math.min(min.y, bounding.boundingBox.minimumWorld.y);
      min.z = Math.min(min.z, bounding.boundingBox.minimumWorld.z);
      max.x = Math.max(max.x, bounding.boundingBox.maximumWorld.x);
      max.y = Math.max(max.y, bounding.boundingBox.maximumWorld.y);
      max.z = Math.max(max.z, bounding.boundingBox.maximumWorld.z);
    }
    const center = new Vector3((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
    instance.anchor.position.set(-center.x, -center.y, -center.z);
  }

  private exportCharacters(): ExportedCharacterData {
    const characters: CharacterDefinition[] = [];
    for (const character of this.characters.values()) {
      characters.push({
        id: character.id,
        name: character.name,
        kind: character.kind,
        stats: character.stats,
        modelFile: character.modelFile,
      });
    }
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      characters,
    };
  }

  private importCharacters(data: ExportedCharacterData): void {
    for (const character of this.characters.values()) {
      character.instance?.dispose();
    }
    this.characters.clear();

    for (const entry of data.characters) {
      const id = entry.id ?? uuidv4();
      const character: CharacterState = {
        ...entry,
        id,
      };
      this.characters.set(id, character);
    }
    this.updateCharacterList();
    const first = this.characters.values().next().value as CharacterState | undefined;
    if (first) {
      this.selectCharacter(first.id);
    } else {
      this.updateForm(null);
    }
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
