export type Entity = number;

export class World {
  private nextEntity = 1;
  readonly entities = new Set<Entity>();
  private stores = new Map<string, Map<Entity, unknown>>();

  create(): Entity {
    const id = this.nextEntity++;
    this.entities.add(id);
    return id;
  }

  destroy(entity: Entity): void {
    this.entities.delete(entity);
    for (const store of this.stores.values()) {
      store.delete(entity);
    }
  }

  ensure<T>(name: string): Map<Entity, T> {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
    return this.stores.get(name)! as Map<Entity, T>;
  }

  set<T>(entity: Entity, name: string, value: T): void {
    this.ensure<T>(name).set(entity, value);
  }

  get<T>(entity: Entity, name: string): T | undefined {
    return this.ensure<T>(name).get(entity);
  }

  query(...names: string[]): Entity[] {
    return Array.from(this.entities).filter((entity) => names.every((name) => this.ensure(name).has(entity)));
  }
}
