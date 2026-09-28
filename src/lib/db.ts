import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

type SqlTag = <T = Record<string, any>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

/**
 * Single `sql` tagged template used by the whole app.
 * - DATABASE_URL set → postgres.js (Neon)
 * - otherwise        → PGlite persisted in ./.pglite (local dev), schema applied on first use
 * Only plain parameterized queries are used, so both drivers behave the same.
 */
function createNeonSql(url: string): SqlTag {
  const client = postgres(url, { ssl: 'require' });
  return (strings, ...values) => client(strings, ...(values as any[])) as unknown as Promise<any[]>;
}

function createPgliteSql(): SqlTag {
  const g = globalThis as { __pglite?: Promise<any> };
  // Reuse the instance across dev-server HMR reloads (PGlite holds a lock on the data dir)
  g.__pglite ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = await PGlite.create(resolve(process.cwd(), '.pglite'));
    await db.exec(readFileSync(resolve(process.cwd(), 'schema.sql'), 'utf8'));
    return db;
  })();

  return async (strings, ...values) => {
    const db = await g.__pglite!;
    const text = strings.reduce((acc, s, i) => acc + (i > 0 ? `$${i}` : '') + s, '');
    const res = await db.query(text, values);
    return res.rows;
  };
}

const url = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;
if (!url && !import.meta.env.DEV) {
  // PGlite is for local dev only: serverless file systems are read-only
  throw new Error('DATABASE_URL is not set: configure it in the Vercel environment variables');
}
const sql: SqlTag = url ? createNeonSql(url) : createPgliteSql();

export default sql;
