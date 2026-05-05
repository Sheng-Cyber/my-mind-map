import Dexie, { type EntityTable } from "dexie";
import type { MindMapRecord } from "../types/mindMap";

export const db = new Dexie("MindMapDatabase") as Dexie & {
  maps: EntityTable<MindMapRecord, "id">;
};

db.version(1).stores({
  maps: "id, title, createdAt, updatedAt",
});

db.version(2).stores({
  maps: "id, title, createdAt, updatedAt, deletedAt",
});

function toSummary({ id, title, createdAt, updatedAt, deletedAt }: MindMapRecord) {
  return {
    id,
    title,
    createdAt,
    updatedAt,
    deletedAt,
  };
}

export async function listMapSummaries() {
  const maps = await db.maps.orderBy("updatedAt").reverse().toArray();
  return maps.filter((map) => !map.deletedAt).map(toSummary);
}

export async function listDeletedMapSummaries() {
  const maps = await db.maps.orderBy("deletedAt").reverse().toArray();
  return maps.filter((map) => Boolean(map.deletedAt)).map(toSummary);
}

export async function getMap(id: string) {
  return db.maps.get(id);
}

export async function putMap(map: MindMapRecord) {
  await db.maps.put(map);
}

export async function deleteMap(id: string) {
  await db.maps.delete(id);
}

export async function deleteExpiredMaps(cutoffIso: string) {
  const expiredMaps = await db.maps
    .where("deletedAt")
    .below(cutoffIso)
    .primaryKeys();

  if (expiredMaps.length > 0) {
    await db.maps.bulkDelete(expiredMaps);
  }
}
