import { newId, type EntityId } from './ids';

export type StoreName =
  | 'bibleEntries' | 'relationships' | 'books' | 'chapters' | 'scenes' | 'chatThreads';

export interface BaseEntity {
  id: EntityId;
  version: number;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

const base = (): BaseEntity => {
  const now = Date.now();
  return { id: newId(), version: 1, deleted: false, createdAt: now, updatedAt: now };
};

export type BibleEntryType =
  | 'character' | 'location' | 'item' | 'lore' | 'arc' | 'theme' | 'faction' | 'event';

export interface Facet {
  key: string;
  content: string;
  priority: number;
  revealedAtSceneId?: EntityId; // reserved for M1 spoiler scoping
}

export interface BibleEntry extends BaseEntity {
  type: BibleEntryType | string;
  name: string;
  aliases: string[];
  keys: string[];
  summary: string;             // derived from facets; may be flagged stale by callers
  facets: Facet[];             // canonical prose
  fields: Record<string, string | number>; // typed scalar attributes only
  tags: string[];
  priority: number;
  image?: EntityId;            // Blob ref (M1)
}

export interface Relationship extends BaseEntity {
  from: EntityId;
  to: EntityId;
  type: string;
  label?: string;
  directed: boolean;
}

export interface Book extends BaseEntity { title: string; synopsis: string; chapterOrder: EntityId[]; }
export interface Chapter extends BaseEntity {
  bookId: EntityId; title: string; synopsis: string; sceneOrder: EntityId[];
}

export interface SceneLink { entryId: EntityId; source: 'auto' | 'user'; state: 'active' | 'blocked'; }
export interface Scene extends BaseEntity {
  chapterId: EntityId;
  title: string;
  content: string;            // markdown prose
  synopsis: string;           // backward-facing summary
  synopsisForward?: string;   // reserved; injection default off
  linkedEntryIds: SceneLink[];
  pov?: string;
  tags: string[];
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string; turnId?: string; ts: number; }
export interface ChatThread extends BaseEntity { title: string; messages: ChatMessage[]; }

export const createBibleEntry = (
  p: { type: BibleEntry['type']; name: string } & Partial<BibleEntry>,
): BibleEntry => ({
  ...base(), aliases: [], keys: [], summary: '', facets: [], fields: {}, tags: [], priority: 0,
  ...p,
});

export const createRelationship = (
  p: { from: EntityId; to: EntityId; type: string } & Partial<Relationship>,
): Relationship => ({ ...base(), directed: false, ...p });

export const createBook = (p: { title: string } & Partial<Book>): Book =>
  ({ ...base(), synopsis: '', chapterOrder: [], ...p });

export const createChapter = (
  p: { bookId: EntityId; title: string } & Partial<Chapter>,
): Chapter => ({ ...base(), synopsis: '', sceneOrder: [], ...p });

export const createScene = (
  p: { chapterId: EntityId; title: string } & Partial<Scene>,
): Scene => ({ ...base(), content: '', synopsis: '', linkedEntryIds: [], tags: [], ...p });

export const createChatThread = (p: Partial<ChatThread> = {}): ChatThread =>
  ({ ...base(), title: 'Untitled', messages: [], ...p });

export type AnyEntity = BibleEntry | Relationship | Book | Chapter | Scene | ChatThread;
