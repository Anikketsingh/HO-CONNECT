import { settings as settingsTable, type Db } from '@hoc/db';
import { resolveSettings, type Settings } from '@hoc/shared';

/** Business settings from the `settings` table, merged over the defaults in @hoc/shared. */
export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable);
  return resolveSettings(rows);
}
