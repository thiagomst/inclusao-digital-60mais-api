const studentSchema = { $ref: '#/components/schemas/Aluno' };

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Inclusão Digital 60+ API',
    version: '1.0.0',
    description: 'API para gestão de alunos e acesso à plataforma de inclusão digital.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Credenciais: {
        type: 'object',
        required: ['email', 'senha'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          senha: { type: 'string', minLength: 8, description: 'Até 72 bytes em UTF-8.' },
        },
      },
      Login: {
        type: 'object',
        required: ['email', 'senha'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          senha: { type: 'string', minLength: 8, description: 'Até 72 bytes em UTF-8.' },
          manterConectado: { type: 'boolean', default: false, description: 'Mantém uma sessão revogável ativa neste dispositivo por até 30 dias. A senha nunca é armazenada.' },
        },
      },
      CadastroEducador: {
        type: 'object',
        required: ['nome', 'email', 'senha'],
        properties: {
          nome: { type: 'string', minLength: 2, maxLength: 120 },
          email: { type: 'string', format: 'email', maxLength: 254 },
          senha: { type: 'string', minLength: 8, description: 'Até 72 bytes em UTF-8.' },
        },
      },
      Aluno: {
        type: 'object',
        required: ['nome', 'telefone', 'idade', 'nivel_tecnologia'],
        properties: {
          nome: { type: 'string', minLength: 2, maxLength: 120 },
          telefone: { type: 'string', minLength: 8, maxLength: 20 },
          email: { type: 'string', format: 'email', maxLength: 254, nullable: true },
          idade: { type: 'integer', minimum: 60, maximum: 120 },
          nivel_tecnologia: { type: 'string', enum: ['iniciante', 'basico', 'intermediario'] },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Verifica se a API está disponível',
        responses: { '200': { description: 'API disponível' } },
      },
    },
    '/api/auth/cadastro': {
      post: {
        summary: 'Cria uma conta e retorna um token JWT',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CadastroEducador' } } },
        },
        responses: {
          '201': { description: 'Conta criada' },
          '400': { description: 'Dados inválidos' },
          '409': { description: 'E-mail já cadastrado' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Autentica e, se autorizado, cria uma sessão persistente revogável',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Login' } } },
        },
        responses: {
          '200': { description: 'Autenticado; informa se a sessão ficará ativa neste dispositivo' },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/api/auth/sessao': {
      delete: {
        summary: 'Encerra e revoga a sessão persistente atual',
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: 'Sessão encerrada' },
          '401': { description: 'Sessão inválida ou expirada' },
        },
      },
    },
    '/api/alunos': {
      get: {
        summary: 'Lista e pesquisa alunos',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'busca', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', description: 'Página positiva; o deslocamento máximo é de 1.000.000 registros.', schema: { type: 'integer', minimum: 1, maximum: 1000001 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Lista paginada, com total de páginas e página máxima segura' },
          '400': { description: 'Parâmetros de paginação inválidos ou deslocamento máximo excedido' },
          '401': { description: 'Não autenticado' },
        },
      },
      post: {
        summary: 'Cadastra um aluno',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: studentSchema } },
        },
        responses: {
          '201': { description: 'Aluno criado' },
          '400': { description: 'Dados inválidos' },
        },
      },
    },
    '/api/alunos/{id}': {
      get: {
        summary: 'Busca um aluno',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Aluno encontrado' },
          '404': { description: 'Aluno não encontrado' },
        },
      },
      put: {
        summary: 'Atualiza um aluno',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: studentSchema } },
        },
        responses: {
          '200': { description: 'Aluno atualizado' },
          '400': { description: 'Dados inválidos' },
          '404': { description: 'Aluno não encontrado' },
        },
      },
      delete: {
        summary: 'Remove um aluno',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '204': { description: 'Aluno removido' },
          '404': { description: 'Aluno não encontrado' },
        },
      },
    },
  },
} as const;

export default openapi;
