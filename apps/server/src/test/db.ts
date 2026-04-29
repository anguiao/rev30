import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'

export async function createTestDb() {
  const client = new PGlite()

  await client.exec(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      username text NOT NULL,
      nickname text NOT NULL,
      email text,
      phone text,
      status smallint NOT NULL DEFAULT 1,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now(),
      deleted_at timestamp with time zone
    );

    CREATE UNIQUE INDEX users_username_unique ON users(username);
    CREATE UNIQUE INDEX users_email_unique ON users(email);
    CREATE UNIQUE INDEX users_phone_unique ON users(phone);
  `)

  return drizzle(client, { schema })
}
