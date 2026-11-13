const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const { db } = require('../dist/database/db');
const app = require('../dist/app').default;
const originalExecute = db.execute.bind(db);
const users = new Map();
const sessions = new Map();
const students = new Map();
let nextUserId = 7;
let nextStudentId = 41;
let studentListQueryCount = 0;
let sessionTableExists = true;
let server;
let baseUrl;

db.execute = async (query, values = []) => {
  const sql = String(query);
  if (sql.startsWith('INSERT INTO usuarios')) {
    const user = { id: nextUserId++, nome: values[0], email: values[1], senha_hash: values[2] };
    users.set(user.email, user);
    return [{ insertId: user.id }, []];
  }
  if (sql.startsWith('INSERT INTO sessoes')) {
    if (!sessionTableExists) {
      throw Object.assign(new Error("Table 'test.sessoes' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
        sql,
      });
    }
    sessions.set(values[0], { usuario_id: values[1], expira_em: values[2] });
    return [{ insertId: 1 }, []];
  }
  if (sql.startsWith('SELECT token_hash FROM sessoes')) {
    const session = sessions.get(values[0]);
    return [session && session.usuario_id === values[1] && session.expira_em > new Date()
      ? [{ token_hash: values[0] }]
      : [], []];
  }
  if (sql.startsWith('DELETE FROM sessoes')) {
    const session = sessions.get(values[0]);
    if (session?.usuario_id === values[1]) sessions.delete(values[0]);
    return [{ affectedRows: session?.usuario_id === values[1] ? 1 : 0 }, []];
  }
  if (sql.startsWith('SELECT id, nome, email, senha_hash FROM usuarios')) {
    const user = users.get(values[0]);
    return [user ? [user] : [], []];
  }
  if (sql.startsWith('INSERT INTO alunos')) {
    const student = {
      id: nextStudentId++,
      usuario_id: values[0],
      nome: values[1],
      telefone: values[2],
      email: values[3],
      idade: values[4],
      nivel_tecnologia: values[5],
      criado_em: new Date(),
    };
    students.set(student.id, student);
    return [{ insertId: student.id }, []];
  }
  if (sql.startsWith('SELECT COUNT(*) AS total FROM alunos')) {
    studentListQueryCount += 1;
    const matching = [...students.values()].filter((student) => student.usuario_id === values[0]);
    return [[{ total: matching.length }], []];
  }
  if (sql.startsWith('SELECT id, nome, telefone, email, idade, nivel_tecnologia, criado_em')) {
    if (sql.includes('ORDER BY nome ASC')) {
      studentListQueryCount += 1;
      const matching = [...students.values()].filter((student) => student.usuario_id === values[0]);
      const offset = Number(values[5]);
      const limit = Number(values[4]);
      return [matching.slice(offset, offset + limit), []];
    }
    const student = students.get(Number(values[0]));
    return [student && student.usuario_id === values[1] ? [student] : [], []];
  }
  if (sql.startsWith('UPDATE alunos')) {
    const student = students.get(Number(values[5]));
    if (!student || student.usuario_id !== values[6]) return [{ affectedRows: 0 }, []];
    Object.assign(student, {
      nome: values[0],
      telefone: values[1],
      email: values[2],
      idade: values[3],
      nivel_tecnologia: values[4],
    });
    return [{ affectedRows: 1 }, []];
  }
  if (sql.startsWith('DELETE FROM alunos')) {
    const student = students.get(Number(values[0]));
    if (!student || student.usuario_id !== values[1]) return [{ affectedRows: 0 }, []];
    students.delete(student.id);
    return [{ affectedRows: 1 }, []];
  }
  throw new Error(`Unexpected SQL in API test: ${sql}`);
};

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.execute = originalExecute;
});

test('health endpoint responds successfully', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('the application serves the accessible front-end and its styles', async () => {
  const page = await fetch(`${baseUrl}/`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /Viver Conectado/);
  assert.match(html, /id="landing-view"/);
  assert.match(html, /data-public-page="para-quem"/);
  assert.match(html, /data-public-page="tecnologia"/);
  assert.match(html, /data-public-page="proposta"/);
  assert.match(html, /id="pagination-controls"/);
  assert.match(html, /Inteligência artificial, com intenção/i);
  assert.match(html, /aria-label="Navegação principal"/);
  assert.match(html, /list="known-emails"/);
  assert.match(html, /id="known-emails"/);

  const styles = await fetch(`${baseUrl}/styles.css`);
  assert.equal(styles.status, 200);
  assert.match(styles.headers.get('content-type'), /text\/css/);
});

test('OpenAPI endpoint documents the student API', async () => {
  const response = await fetch(`${baseUrl}/api/docs`);
  const specification = await response.json();
  assert.equal(response.status, 200);
  assert.equal(specification.openapi, '3.0.3');
  assert.ok(specification.paths['/api/alunos/{id}'].delete);
  assert.equal(specification.paths['/api/alunos'].get.parameters.find((parameter) => parameter.name === 'limit').schema.maximum, 100);
  assert.ok(specification.paths['/api/auth/sessao'].delete);
  assert.equal(specification.components.schemas.Login.properties.manterConectado.default, false);
});

test('student endpoints require authentication', async () => {
  const response = await fetch(`${baseUrl}/api/alunos`);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.codigo, 'UNAUTHENTICATED');
});

test('login rejects invalid input without querying the database', async () => {
  for (const credentials of [
    { email: 'not-an-email', senha: 'x' },
    { email: 'educadora@example.com', senha: 'senha-forte-123', manterConectado: 'yes' },
  ]) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.codigo, 'INVALID_INPUT');
  }
});

test('registration rejects weak input without creating an account', async () => {
  const response = await fetch(`${baseUrl}/api/auth/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'A', email: 'a@b.com', senha: '123' }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.codigo, 'INVALID_INPUT');
});

test('educator can register, log in, and manage only their own students', async () => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Educadora Exemplo', email: 'educadora@example.com', senha: 'senha-forte-123' }),
  });
  assert.equal(registerResponse.status, 201);

  const temporaryLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'educadora@example.com', senha: 'senha-forte-123', manterConectado: false }),
  });
  assert.equal(temporaryLoginResponse.status, 200);
  const temporaryLogin = await temporaryLoginResponse.json();
  assert.equal(temporaryLogin.manterConectado, false);
  assert.match(temporaryLogin.mensagem, /sem manter a sessão/);
  assert.equal(sessions.size, 0);
  assert.equal(jwt.decode(temporaryLogin.token).jti, undefined);

  sessionTableExists = false;
  const missingSessionTableResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'educadora@example.com', senha: 'senha-forte-123', manterConectado: true }),
  });
  assert.equal(missingSessionTableResponse.status, 503);
  const missingSessionTableError = await missingSessionTableResponse.json();
  assert.equal(missingSessionTableError.codigo, 'PERSISTENT_SESSION_NOT_CONFIGURED');
  assert.match(missingSessionTableError.erro, /sessão persistente/i);
  assert.doesNotMatch(missingSessionTableError.erro, /sudo mysql|database\/schema.sql/);
  sessionTableExists = true;

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'educadora@example.com', senha: 'senha-forte-123', manterConectado: true }),
  });
  assert.equal(loginResponse.status, 200);
  const loginResult = await loginResponse.json();
  assert.equal(loginResult.manterConectado, true);
  assert.match(loginResult.mensagem, /senha não foi salva/);
  assert.notEqual(users.get('educadora@example.com').senha_hash, 'senha-forte-123');
  assert.equal(sessions.size, 1);
  const rememberedTokenPayload = jwt.decode(loginResult.token);
  assert.equal(rememberedTokenPayload.exp - rememberedTokenPayload.iat, 30 * 24 * 60 * 60);
  assert.ok(rememberedTokenPayload.jti);
  const { token } = loginResult;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const student = {
    nome: 'Maria de Souza',
    telefone: '11999999999',
    email: 'maria@example.com',
    idade: 68,
    nivel_tecnologia: 'iniciante',
  };

  const createResponse = await fetch(`${baseUrl}/api/alunos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(student),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.id, 41);

  const listResponse = await fetch(`${baseUrl}/api/alunos?limit=10`, { headers });
  const list = await listResponse.json();
  assert.equal(list.paginacao.total, 1);
  assert.equal(list.paginacao.pagina, 1);
  assert.equal(list.paginacao.totalPaginas, 1);
  assert.equal(list.paginacao.paginaMaxima, 100001);
  assert.equal(list.dados[0].nome, student.nome);

  const secondPageResponse = await fetch(`${baseUrl}/api/alunos?page=2&limit=1`, { headers });
  const secondPage = await secondPageResponse.json();
  assert.equal(secondPage.paginacao.pagina, 2);
  assert.equal(secondPage.paginacao.total, 1);
  assert.deepEqual(secondPage.dados, []);

  const studentQueriesBeforeInvalidPage = studentListQueryCount;
  for (const [invalidPagination, expectedCode] of [
    ['page=0', 'INVALID_PAGINATION'],
    ['page=1.5', 'INVALID_PAGINATION'],
    ['page=1e3', 'INVALID_PAGINATION'],
    ['page=1&page=2', 'INVALID_PAGINATION'],
    ['limit=101', 'INVALID_PAGINATION'],
    ['page=10002&limit=100', 'PAGINATION_OFFSET_TOO_LARGE'],
    ['busca=a&busca=b', 'INVALID_SEARCH'],
    [`busca=${'a'.repeat(101)}`, 'INVALID_SEARCH'],
  ]) {
    const invalidResponse = await fetch(`${baseUrl}/api/alunos?${invalidPagination}`, { headers });
    assert.equal(invalidResponse.status, 400, invalidPagination);
    assert.equal((await invalidResponse.json()).codigo, expectedCode);
  }
  assert.equal(studentListQueryCount, studentQueriesBeforeInvalidPage, 'invalid pagination should not query student records');

  const getResponse = await fetch(`${baseUrl}/api/alunos/41`, { headers });
  assert.equal(getResponse.status, 200);
  assert.equal((await getResponse.json()).nome, student.nome);

  const updateResponse = await fetch(`${baseUrl}/api/alunos/41`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...student, nome: 'Maria Souza' }),
  });
  assert.equal(updateResponse.status, 200);

  const otherRegisterResponse = await fetch(`${baseUrl}/api/auth/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Outro Educador', email: 'outro@example.com', senha: 'senha-forte-123' }),
  });
  assert.equal(otherRegisterResponse.status, 201);
  const otherAccount = await otherRegisterResponse.json();

  const privateStudentResponse = await fetch(`${baseUrl}/api/alunos/41`, {
    headers: { Authorization: `Bearer ${otherAccount.token}` },
  });
  assert.equal(privateStudentResponse.status, 404);

  const deleteResponse = await fetch(`${baseUrl}/api/alunos/41`, { method: 'DELETE', headers });
  assert.equal(deleteResponse.status, 204);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/sessao`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(logoutResponse.status, 204);
  assert.equal(sessions.size, 0);

  const revokedSessionResponse = await fetch(`${baseUrl}/api/alunos`, { headers });
  assert.equal(revokedSessionResponse.status, 401);
});
