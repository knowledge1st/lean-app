import type { Target } from '@lean/shared';
import type { Db } from '../db/client';

// T051 completará esta consulta leyendo targets del objetivo vigente en esa fecha.
export async function getTargetForDate(
  db: Db,
  userId: string,
  date: string,
): Promise<Target | null> {
  void db;
  void userId;
  void date;
  return null;
}
