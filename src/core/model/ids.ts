export type EntityId = string;
export const newId = (): EntityId => crypto.randomUUID();
