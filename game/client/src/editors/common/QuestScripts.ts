export type QuestRequirement = KillRequirement | CollectRequirement;

export interface KillRequirement {
  type: "kill";
  targetName: string;
  count: number;
}

export interface CollectRequirement {
  type: "collect";
  itemName: string;
  count: number;
}

export interface QuestDefinition {
  id: string;
  title: string;
  description?: string;
  requirement: QuestRequirement;
}

export interface QuestScript {
  dialogTitle: string;
  quests: QuestDefinition[];
}

export interface QuestScriptWithMeta extends QuestScript {
  sourceName: string;
}

export function parseQuestScript(data: unknown, sourceName: string): QuestScriptWithMeta {
  const script = ensureQuestScript(data, sourceName);
  return { ...script, sourceName };
}

export function ensureQuestScript(data: unknown, sourceName: string): QuestScript {
  if (!data || typeof data !== "object") {
    throw new Error(`Файл ${sourceName} не содержит объект сценария`);
  }
  const dialogTitle = readString((data as Record<string, unknown>).dialogTitle, "dialogTitle", sourceName);
  if (!dialogTitle) {
    throw new Error(`В сценарии ${sourceName} отсутствует заголовок диалога (dialogTitle)`);
  }
  const questsRaw = (data as Record<string, unknown>).quests;
  if (!Array.isArray(questsRaw) || questsRaw.length === 0) {
    throw new Error(`В сценарии ${sourceName} не найден список квестов (quests)`);
  }
  const quests: QuestDefinition[] = questsRaw.map((entry, index) => parseQuest(entry, index, sourceName));
  return { dialogTitle, quests };
}

export function describeQuest(quest: QuestDefinition): string {
  switch (quest.requirement.type) {
    case "kill":
      return `${quest.title} — устранить ${quest.requirement.count}× ${quest.requirement.targetName}`;
    case "collect":
      return `${quest.title} — принести ${quest.requirement.count}× ${quest.requirement.itemName}`;
    default:
      return quest.title;
  }
}

function parseQuest(entry: unknown, index: number, sourceName: string): QuestDefinition {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Квест №${index + 1} в файле ${sourceName} имеет неверный формат`);
  }
  const record = entry as Record<string, unknown>;
  const id = readString(record.id, `quests[${index}].id`, sourceName) || `quest_${index + 1}`;
  const title = readString(record.title, `quests[${index}].title`, sourceName) || id;
  const descriptionValue = record.description;
  const description = typeof descriptionValue === "string" ? descriptionValue : undefined;
  const requirement = parseRequirement(record.requirement, index, sourceName);
  return { id, title, description, requirement };
}

function parseRequirement(raw: unknown, index: number, sourceName: string): QuestRequirement {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Квест №${index + 1} в файле ${sourceName} не содержит требования`);
  }
  const record = raw as Record<string, unknown>;
  const typeValue = record.type;
  if (typeValue !== "kill" && typeValue !== "collect") {
    throw new Error(
      `Квест №${index + 1} в файле ${sourceName} содержит неизвестный тип требования: ${String(typeValue)}`,
    );
  }
  if (typeValue === "kill") {
    const targetName = readString(record.targetName, `quests[${index}].requirement.targetName`, sourceName);
    const count = readPositiveInt(record.count, `quests[${index}].requirement.count`, sourceName);
    return { type: "kill", targetName, count };
  }
  const itemName = readString(record.itemName, `quests[${index}].requirement.itemName`, sourceName);
  const count = readPositiveInt(record.count, `quests[${index}].requirement.count`, sourceName);
  return { type: "collect", itemName, count };
}

function readString(value: unknown, path: string, sourceName: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (value === undefined) {
    return "";
  }
  throw new Error(`Поле ${path} в файле ${sourceName} должно быть непустой строкой`);
}

function readPositiveInt(value: unknown, path: string, sourceName: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  throw new Error(`Поле ${path} в файле ${sourceName} должно быть положительным числом`);
}
