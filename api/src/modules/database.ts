import { Kysely, MysqlDialect } from 'kysely'
import mysql from 'mysql2'
import type { Database } from './models'

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
});
  
export const db = new Kysely<Database>({
    dialect: new MysqlDialect({ pool }),
})

