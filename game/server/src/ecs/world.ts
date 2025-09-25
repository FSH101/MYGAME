import { randomUUID } from "crypto";
import type { Entity } from "./components";

export interface ComponentStore<T> {
  data: Map<Entity, T>;
}

export class World {
  private nextEntity = 1;
  entities = new Set<Entity>();
  components = new Map<string, ComponentStore<unknown>>();
  tags = new Map<Entity, Set<string>>();

  createEntity(): Entity {
    const id = this.nextEntity++;
    this.entities.add(id);
    return id;
  }

  destroyEntity(entity: Entity): void {
    this.entities.delete(entity);
    for (const store of this.components.values()) {
      store.data.delete(entity);
    }
    this.tags.delete(entity);
  }

  getStore<T>(name: string): ComponentStore<T> {
    if (!this.components.has(name)) {
      this.components.set(name, { data: new Map() });
    }
    return this.components.get(name)! as ComponentStore<T>;
  }

  addComponent<T>(entity: Entity, name: string, value: T): void {
    this.getStore<T>(name).data.set(entity, value);
  }

  getComponent<T>(entity: Entity, name: string): T | undefined {
    return this.getStore<T>(name).data.get(entity);
  }

  removeComponent(entity: Entity, name: string): void {
    this.getStore<unknown>(name).data.delete(entity);
  }

  query(...names: string[]): Entity[] {
    return Array.from(this.entities).filter((entity) =>
      names.every((name) => this.getStore<unknown>(name).data.has(entity))
    );
  }

  addTag(entity: Entity, tag: string): void {
    if (!this.tags.has(entity)) {
      this.tags.set(entity, new Set());
    }
    this.tags.get(entity)!.add(tag);
  }

  hasTag(entity: Entity, tag: string): boolean {
    return this.tags.get(entity)?.has(tag) ?? false;
  }

  findByTag(tag: string): Entity[] {
    return Array.from(this.tags.entries())
      .filter(([, tags]) => tags.has(tag))
      .map(([entity]) => entity);
  }
}

export function createEntityId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
