import mysql from 'mysql2/promise';
import { env } from '../config/env';

export const db = mysql.createPool({
  host: env.database.host,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
  port: env.database.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});
