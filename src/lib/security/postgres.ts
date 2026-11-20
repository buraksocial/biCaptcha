import { Pool, type PoolClient } from 'pg';
import { Unavailable } from './config';
import { HttpError } from './http';
let pool: Pool | undefined;
export function postgres() {
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? '')) throw new Unavailable('Postgres required');
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 2000, statement_timeout: 3000, query_timeout: 4000, idle_in_transaction_session_timeout: 5000 });
    pool.on('error', () => {});
  }
  return pool;
}
export async function transaction<T>(body: (client: PoolClient) => Promise<T>, db = postgres()): Promise<T> {
  let client: PoolClient | undefined;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const result = await body(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (e instanceof HttpError || e instanceof Unavailable) throw e;
    throw new Unavailable('Durable security state unavailable');
  } finally { client?.release(); }
}
export async function audit(c: PoolClient, actor: string, kind: string, subject: string) {
  await c.query('INSERT INTO audit_event(actor,kind,subject) VALUES($1,$2,$3)', [actor, kind, subject]);
}
