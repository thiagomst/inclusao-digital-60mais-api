import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`A variável de ambiente ${name} é obrigatória.`);
  }
  return value;
}

const port = Number(process.env.PORT ?? 3000);
const databasePort = Number(process.env.DB_PORT ?? 3306);
const jwtSecret = required('JWT_SECRET');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT deve ser uma porta válida.');
}

if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error('DB_PORT deve ser uma porta válida.');
}

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve conter pelo menos 32 caracteres.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  database: {
    host: required('DB_HOST'),
    port: databasePort,
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    name: required('DB_NAME'),
  },
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
};
