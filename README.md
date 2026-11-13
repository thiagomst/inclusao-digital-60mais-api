# Viver Conectado — Inclusão Digital 60+

Uma aplicação de apoio a iniciativas de inclusão digital para pessoas com 60 anos ou mais. O projeto oferece uma forma simples de cadastrar e acompanhar alunos, com uma interface acolhedora e uma API protegida.

## Escopo atual

- Cadastro e login de educadores com senha armazenada em hash e autenticação JWT.
- Opção explícita para manter a sessão conectada neste dispositivo por até 30 dias; a API guarda apenas o hash do identificador da sessão e permite revogá-la ao sair. A senha nunca é salva para preenchimento automático.
- Cadastro, consulta, pesquisa, edição e exclusão de alunos, com dados isolados por conta.
- Validação de dados, paginação com limite de deslocamento, respostas de erro consistentes e proteção das rotas privadas.
- Página pública com navegação entre proposta, público atendido e princípios de tecnologia/IA; textos deixam claro o que já existe e o que ainda é planejamento.
- Interface responsiva com foco em leitura confortável, navegação por teclado e mensagens claras.

O cadastro de trilhas e o acompanhamento do progresso pedagógico são próximos passos; ainda não fazem parte desta primeira versão funcional.

## Tecnologias

- Node.js, TypeScript e Express 5
- MySQL 8 e mysql2
- JWT, bcryptjs, Zod, Helmet e express-rate-limit
- HTML, CSS e JavaScript sem framework no front-end

## Como rodar

### Requisitos

- Node.js 20 ou superior
- MySQL 8 ou superior

### Preparação

```bash
npm install
cp .env.example .env
```

Edite o `.env` com as credenciais do seu MySQL e gere um segredo exclusivo para JWT:

```bash
openssl rand -hex 32
```

Use o resultado em `JWT_SECRET`. Não compartilhe nem envie o arquivo `.env` ao GitHub.

No Ubuntu, crie/atualize as tabelas usando a autenticação administrativa do sistema:

```bash
sudo mysql < database/schema.sql
```

O schema cria também a tabela `sessoes`, usada para sessões persistentes revogáveis. Em bancos já existentes, rode novamente esse comando para criar a tabela que estiver faltando.

Configure o usuário da aplicação no MySQL (substitua o marcador por uma senha nova e forte; use a mesma em `DB_PASSWORD` no `.env`):

```bash
sudo mysql
```

No prompt do MySQL:

```sql
CREATE USER IF NOT EXISTS 'inclusao_app'@'localhost' IDENTIFIED BY 'SUBSTITUA_POR_SENHA_FORTE';
ALTER USER 'inclusao_app'@'localhost' IDENTIFIED BY 'SUBSTITUA_POR_SENHA_FORTE';
CREATE USER IF NOT EXISTS 'inclusao_app'@'127.0.0.1' IDENTIFIED BY 'SUBSTITUA_POR_SENHA_FORTE';
ALTER USER 'inclusao_app'@'127.0.0.1' IDENTIFIED BY 'SUBSTITUA_POR_SENHA_FORTE';
GRANT ALL PRIVILEGES ON inclusao_digital.* TO 'inclusao_app'@'localhost';
GRANT ALL PRIVILEGES ON inclusao_digital.* TO 'inclusao_app'@'127.0.0.1';
EXIT;
```

Não use a senha do MySQL `root` no `.env`; a aplicação deve usar `inclusao_app`.

Se o login do MySQL `root` não estiver disponível e `inclusao_app` já tiver permissão para criar tabelas, crie somente a tabela de sessões diretamente com as credenciais de `DB_USER` e `DB_PASSWORD` configuradas no `.env`:

```bash
mysql -u inclusao_app -p -h 127.0.0.1 inclusao_digital
```

Digite a senha de `DB_PASSWORD` quando solicitada e, no prompt `mysql>`, execute:

```sql
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_sessoes_usuario_expira (usuario_id, expira_em),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
);
```

Depois digite `EXIT;`. Se aparecer `CREATE command denied`, o usuário da aplicação não tem permissão para criar tabelas; use uma conta administradora do MySQL para executar o schema ou conceder a permissão necessária.

### Desenvolvimento e produção

```bash
npm run dev
```

Por padrão, a aplicação fica disponível em <http://localhost:3000>. O front-end e a API são servidos pelo mesmo processo. Se a porta 3000 estiver ocupada ou você quiser usar outra porta, informe `PORT` ao iniciar. Por exemplo:

```bash
PORT=3139 npm run dev
```

Nesse caso, acesse <http://localhost:3139>. A porta definida no comando vale apenas para essa execução; sem ela, a aplicação usa a porta configurada no `.env` (`3000` no `.env.example`).

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Endpoints

Os corpos de requisição usam JSON. As rotas de alunos exigem `Authorization: Bearer <token>`.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/health` | Público | Verifica disponibilidade da API |
| POST | `/api/auth/cadastro` | Público | Cria uma conta de educador |
| POST | `/api/auth/login` | Público | Autentica; aceita `manterConectado` para criar uma sessão persistente |
| DELETE | `/api/auth/sessao` | JWT | Revoga a sessão persistente atual |
| GET | `/api/alunos?busca=&page=1&limit=50` | JWT | Lista e pesquisa alunos (`limit` até 100; deslocamento limitado a 1.000.000 registros) |
| GET | `/api/alunos/:id` | JWT | Consulta um aluno |
| POST | `/api/alunos` | JWT | Cadastra um aluno |
| PUT | `/api/alunos/:id` | JWT | Atualiza os dados de um aluno |
| DELETE | `/api/alunos/:id` | JWT | Exclui um aluno |
| GET | `/api/docs` | Público | Especificação OpenAPI 3 |

O cadastro do aluno aceita `nome`, `telefone`, `idade` (60–120), `nivel_tecnologia` (`iniciante`, `basico` ou `intermediario`) e `email` opcional. Na página de alunos, a busca e os controles de página consultam a API; parâmetros inválidos ou deslocamentos excessivos são rejeitados antes da consulta ao banco. A resposta de listagem inclui `pagina`, `limite`, `total`, `totalPaginas` e `paginaMaxima`.

No login, `manterConectado` é opcional e assume `false`. Se vier como `true`, o token expira em até 30 dias e a API verifica a sessão persistida a cada requisição protegida. O banco armazena somente o SHA-256 do identificador aleatório da sessão, nunca o token nem a senha. Sem essa opção, a sessão dura o tempo configurado em `JWT_EXPIRES_IN` e fica apenas na sessão do navegador.

## Estrutura

```text
database/schema.sql  Estrutura inicial do banco
public/              Front-end servido pela API
src/controllers/     Regras dos endpoints
src/middleware/      Autenticação JWT
src/routes/          Rotas da API
```

## Aprendizados e próximos passos

Este início de projeto exercita autenticação, validação, integração com MySQL, documentação de API, testes automatizados e cuidados de acessibilidade. Como evolução: trilhas de aprendizagem, registro de progresso, recuperação de senha, papéis de acesso e testes de integração com banco isolado.
