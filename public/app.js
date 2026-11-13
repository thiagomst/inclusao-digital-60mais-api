const landingView = document.querySelector('#landing-view');
const authView = document.querySelector('#auth-view');
const appView = document.querySelector('#app-view');
const authForm = document.querySelector('#auth-form');
const authError = document.querySelector('#auth-error');
const authSubmit = document.querySelector('#auth-submit');
const nameField = document.querySelector('#name-field');
const emailHint = document.querySelector('#email-hint');
const knownEmailsList = document.querySelector('#known-emails');
const rememberSessionField = document.querySelector('#remember-session-field');
const switchAuth = document.querySelector('#switch-auth');
const studentDialog = document.querySelector('#student-dialog');
const studentForm = document.querySelector('#student-form');
const studentError = document.querySelector('#student-error');
const studentRows = document.querySelector('#student-rows');
const toast = document.querySelector('#toast');

let isRegistering = false;
let students = [];
let editingStudentId = null;
let toastTimeout;
let studentPage = 1;
let studentTotalPages = 1;
let studentTotal = 0;
const studentPageSize = 20;
let studentLoadSequence = 0;
let studentSearchTimeout;
const knownEmailsStorageKey = 'viver-conectado-known-emails';

function getKnownEmails() {
  try {
    const storedEmails = JSON.parse(localStorage.getItem(knownEmailsStorageKey) || '[]');
    if (!Array.isArray(storedEmails)) return [];
    return storedEmails
      .filter((email) => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      .slice(0, 5);
  } catch (error) {
    console.warn('Não foi possível carregar as sugestões locais de e-mail:', error);
    return [];
  }
}

function renderKnownEmailSuggestions() {
  knownEmailsList.replaceChildren(...getKnownEmails().map((email) => {
    const option = document.createElement('option');
    option.value = email;
    return option;
  }));
}

function rememberKnownEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const knownEmails = getKnownEmails().filter((knownEmail) => knownEmail !== normalizedEmail);
  try {
    localStorage.setItem(knownEmailsStorageKey, JSON.stringify([normalizedEmail, ...knownEmails].slice(0, 5)));
  } catch (error) {
    console.warn('Não foi possível salvar a sugestão local de e-mail:', error);
  }
  renderKnownEmailSuggestions();
}

function migrateLegacySession() {
  const legacyToken = localStorage.getItem('viver-conectado-token');
  if (legacyToken) {
    sessionStorage.setItem('viver-conectado-token', legacyToken);
    const legacyUser = localStorage.getItem('viver-conectado-user');
    if (legacyUser) sessionStorage.setItem('viver-conectado-user', legacyUser);
    localStorage.removeItem('viver-conectado-token');
    localStorage.removeItem('viver-conectado-user');
  }
}

migrateLegacySession();

function getToken() {
  return localStorage.getItem('viver-conectado-token')
    || sessionStorage.getItem('viver-conectado-token');
}

function getUser() {
  try {
    return JSON.parse(
      localStorage.getItem('viver-conectado-user')
        || sessionStorage.getItem('viver-conectado-user')
        || 'null',
    );
  } catch {
    return null;
  }
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'VC';
}

function escapeText(value) {
  return String(value ?? '');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3200);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type', 'application/json');
  if (getToken()) headers.set('Authorization', `Bearer ${getToken()}`);

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error('Não foi possível conectar à aplicação. Confira se a API está em execução e tente novamente.');
  }
  if (response.status === 401 && path.startsWith('/api/alunos')) {
    logout(false);
    throw new Error('Sua sessão terminou. Entre novamente para continuar.');
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.erro || 'Não foi possível concluir. Tente novamente.');
  return payload;
}

function setAuthMode(registering) {
  isRegistering = registering;
  nameField.classList.toggle('hidden', !registering);
  nameField.querySelector('input').required = registering;
  rememberSessionField.classList.toggle('hidden', registering);
  authForm.elements.manterConectado.checked = false;
  document.querySelector('#auth-eyebrow').textContent = registering ? 'VAMOS COMEÇAR JUNTOS' : 'BEM-VINDA, BEM-VINDO';
  document.querySelector('#auth-heading').textContent = registering ? 'Crie seu espaço de aprendizagem.' : 'Que bom ter você por aqui.';
  document.querySelector('#auth-description').textContent = registering ? 'Cadastre-se para acompanhar a jornada dos seus alunos.' : 'Entre para acompanhar a jornada dos seus alunos.';
  authSubmit.innerHTML = registering ? 'Criar minha conta <span aria-hidden="true">→</span>' : 'Entrar na plataforma <span aria-hidden="true">→</span>';
  document.querySelector('#switch-copy').textContent = registering ? 'Já tem uma conta?' : 'Ainda não tem uma conta?';
  switchAuth.textContent = registering ? 'Fazer login' : 'Criar conta';
  authForm.elements.senha.autocomplete = registering ? 'new-password' : 'current-password';
  emailHint.classList.toggle('hidden', registering);
  renderKnownEmailSuggestions();
  authError.textContent = '';
}

function showApp() {
  const user = getUser();
  studentPage = 1;
  document.querySelector('#student-search').value = '';
  landingView.classList.add('hidden');
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  document.querySelector('#profile-name').textContent = user?.nome || 'Sua conta';
  document.querySelector('#profile-initials').textContent = initials(user?.nome);
  document.querySelector('#welcome-name').textContent = user?.nome?.split(/\s+/)[0] || 'que bom ver você';
  document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date());
  loadStudents();
}

function showLogin() {
  landingView.classList.add('hidden');
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPublicPage(route) {
  const validRoutes = ['inicio', 'para-quem', 'tecnologia', 'proposta'];
  const page = validRoutes.includes(route) ? route : 'inicio';
  document.querySelectorAll('[data-public-page]').forEach((section) => {
    const active = section.dataset.publicPage === page;
    section.classList.toggle('hidden', !active);
    section.setAttribute('aria-hidden', String(!active));
  });
  appView.classList.add('hidden');
  authView.classList.add('hidden');
  landingView.classList.remove('hidden');
  document.querySelector('#landing-nav').classList.remove('open');
  document.querySelector('#landing-menu-button').setAttribute('aria-expanded', 'false');
  document.querySelectorAll('[data-public-route]').forEach((link) => {
    if (link.closest('#landing-nav')) {
      if (link.dataset.publicRoute === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function logout(showMessage = true) {
  const rememberedSession = localStorage.getItem('viver-conectado-token');
  let serverLogoutFailed = false;
  if (rememberedSession) {
    try {
      await request('/api/auth/sessao', { method: 'DELETE' });
    } catch {
      serverLogoutFailed = true;
    }
  }
  localStorage.removeItem('viver-conectado-token');
  localStorage.removeItem('viver-conectado-user');
  sessionStorage.removeItem('viver-conectado-token');
  sessionStorage.removeItem('viver-conectado-user');
  history.replaceState(null, '', '/');
  showPublicPage('inicio');
  if (showMessage) {
    showToast(serverLogoutFailed
      ? 'Você saiu deste dispositivo. Não foi possível encerrar a sessão no servidor; ela expira em até 30 dias.'
      : 'Você saiu da plataforma.');
  }
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.textContent = '';
  if (!authForm.reportValidity()) return;

  authSubmit.disabled = true;
  authSubmit.textContent = isRegistering ? 'Criando sua conta…' : 'Verificando…';
  const formData = new FormData(authForm);
  const payload = {
    email: String(formData.get('email')).trim(),
    senha: String(formData.get('senha')),
    ...(!isRegistering ? { manterConectado: authForm.elements.manterConectado.checked } : {}),
    ...(isRegistering ? { nome: String(formData.get('nome')).trim() } : {}),
  };

  try {
    const result = await request(isRegistering ? '/api/auth/cadastro' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const storage = result.manterConectado ? localStorage : sessionStorage;
    const otherStorage = result.manterConectado ? sessionStorage : localStorage;
    otherStorage.removeItem('viver-conectado-token');
    otherStorage.removeItem('viver-conectado-user');
    storage.setItem('viver-conectado-token', result.token);
    storage.setItem('viver-conectado-user', JSON.stringify(result.usuario));
    rememberKnownEmail(result.usuario.email || payload.email);
    authForm.reset();
    if (result.mensagem) showToast(result.mensagem);
    history.replaceState(null, '', '/');
    showApp();
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.innerHTML = isRegistering
      ? 'Criar minha conta <span aria-hidden="true">→</span>'
      : 'Entrar na plataforma <span aria-hidden="true">→</span>';
  }
});

switchAuth.addEventListener('click', () => {
  const mode = isRegistering ? 'login' : 'register';
  setAuthMode(mode === 'register');
  history.pushState(null, '', mode === 'register' ? '#/cadastro' : '#/entrar');
});
document.querySelector('#logout-button').addEventListener('click', () => logout());

document.querySelectorAll('[data-auth]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const mode = link.dataset.auth;
    setAuthMode(mode === 'register');
    showLogin();
    document.querySelector('#landing-nav').classList.remove('open');
    document.querySelector('#landing-menu-button').setAttribute('aria-expanded', 'false');
    authForm.elements[mode === 'register' ? 'nome' : 'email'].focus();
    history.pushState(null, '', mode === 'register' ? '#/cadastro' : '#/entrar');
  });
});

document.querySelectorAll('[data-public-route]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const route = link.dataset.publicRoute;
    history.pushState(null, '', route === 'inicio' ? '/' : `#/${route}`);
    showPublicPage(route);
  });
});

document.querySelector('#landing-menu-button').addEventListener('click', (event) => {
  const nav = document.querySelector('#landing-nav');
  const isOpen = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(isOpen));
});

function restoreRouteFromLocation() {
  const route = window.location.hash.replace(/^#\/?/, '');
  if (getToken() && getUser()) {
    showApp();
    return;
  }
  if (route === 'entrar' || route === 'cadastro') {
    setAuthMode(route === 'cadastro');
    showLogin();
    return;
  }
  showPublicPage(route || 'inicio');
}

window.addEventListener('popstate', restoreRouteFromLocation);
window.addEventListener('hashchange', restoreRouteFromLocation);

function openPage(page) {
  const isStudents = page === 'alunos';
  document.querySelector('#home-page').classList.toggle('hidden', isStudents);
  document.querySelector('#students-page').classList.toggle('hidden', !isStudents);
  document.querySelector('#breadcrumb-current').textContent = isStudents ? 'Alunos' : 'Visão geral';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  document.querySelector('#sidebar').classList.remove('open');
  document.querySelector('#mobile-menu').setAttribute('aria-expanded', 'false');
}

document.querySelectorAll('[data-page]').forEach((button) => {
  button.addEventListener('click', () => openPage(button.dataset.page));
});
document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => openPage(button.dataset.go));
});

document.querySelector('#mobile-menu').addEventListener('click', (event) => {
  const sidebar = document.querySelector('#sidebar');
  const open = sidebar.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});

function createAvatar(name, index = 0) {
  const avatar = document.createElement('span');
  avatar.className = `student-avatar avatar-${index % 4}`;
  avatar.textContent = initials(name);
  return avatar;
}

function appendRecentStudent(student, index) {
  const row = document.createElement('div');
  row.className = 'recent-row';
  row.append(createAvatar(student.nome, index));
  const name = document.createElement('span');
  name.className = 'recent-name';
  const strong = document.createElement('strong');
  strong.textContent = escapeText(student.nome);
  const small = document.createElement('small');
  small.textContent = `${student.idade} anos · ${levelLabel(student.nivel_tecnologia)}`;
  name.append(strong, small);
  row.append(name);
  return row;
}

function levelLabel(level) {
  return ({ iniciante: 'Começando agora', basico: 'Conhece o básico', intermediario: 'Tem experiência' })[level] || 'Não informado';
}

function renderRecent() {
  const list = document.querySelector('#recent-list');
  list.replaceChildren();
  if (!students.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = 'Seus alunos aparecerão aqui assim que forem cadastrados.';
    list.append(empty);
    return;
  }
  students.slice(0, 3).forEach((student, index) => list.append(appendRecentStudent(student, index)));
}

function makeStudentRow(student, index) {
  const row = document.createElement('tr');
  const personCell = document.createElement('td');
  const person = document.createElement('div');
  person.className = 'table-person';
  person.append(createAvatar(student.nome, index));
  const identity = document.createElement('span');
  identity.className = 'table-person-name';
  const name = document.createElement('strong');
  name.textContent = escapeText(student.nome);
  const email = document.createElement('small');
  email.textContent = escapeText(student.email || 'E-mail não informado');
  identity.append(name, email);
  person.append(identity);
  personCell.append(person);

  const ageCell = document.createElement('td');
  ageCell.textContent = `${student.idade} anos`;
  const phoneCell = document.createElement('td');
  phoneCell.textContent = escapeText(student.telefone);
  const levelCell = document.createElement('td');
  const tag = document.createElement('span');
  tag.className = `level-tag level-${student.nivel_tecnologia}`;
  tag.textContent = levelLabel(student.nivel_tecnologia);
  levelCell.append(tag);
  const actionsCell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const edit = document.createElement('button');
  edit.className = 'row-action';
  edit.type = 'button';
  edit.textContent = '✎';
  edit.setAttribute('aria-label', `Editar ${student.nome}`);
  edit.addEventListener('click', () => openStudentDialog(student));
  const remove = document.createElement('button');
  remove.className = 'row-action delete';
  remove.type = 'button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Excluir ${student.nome}`);
  remove.addEventListener('click', () => removeStudent(student));
  actions.append(edit, remove);
  actionsCell.append(actions);
  row.append(personCell, ageCell, phoneCell, levelCell, actionsCell);
  return row;
}

function renderStudents() {
  const search = document.querySelector('#student-search').value.trim();
  studentRows.replaceChildren(...students.map(makeStudentRow));
  const isEmpty = students.length === 0;
  document.querySelector('.student-table').classList.toggle('hidden', isEmpty);
  document.querySelector('#no-students').classList.toggle('hidden', !isEmpty);
  document.querySelector('#no-students h2').textContent = search
    ? 'Não encontramos ninguém com esse nome.'
    : 'Nenhum aluno por aqui, ainda.';
  document.querySelector('#no-students p').textContent = search
    ? 'Tente outra busca ou confira a escrita.'
    : 'O primeiro cadastro é o começo de uma grande jornada.';
  document.querySelector('#first-student').classList.toggle('hidden', Boolean(search) || studentTotal > 0);
  document.querySelector('#list-total').textContent = String(studentTotal);
  document.querySelector('#list-total-label').textContent = search ? 'resultados encontrados' : 'pessoas cadastradas';
  document.querySelector('#student-total').textContent = String(studentTotal).padStart(2, '0');
  document.querySelector('#nav-count').textContent = String(studentTotal);
  const pagination = document.querySelector('#pagination-controls');
  pagination.classList.toggle('hidden', studentTotalPages <= 1);
  document.querySelector('#pagination-status').textContent = `Página ${studentPage} de ${studentTotalPages}`;
  document.querySelector('#previous-page').disabled = studentPage <= 1;
  document.querySelector('#next-page').disabled = studentPage >= studentTotalPages;
  renderRecent();
}

async function loadStudents(page = studentPage) {
  const requestSequence = ++studentLoadSequence;
  const feedback = document.querySelector('#student-feedback');
  feedback.textContent = '';
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(studentPageSize) });
    const search = document.querySelector('#student-search').value.trim();
    if (search) params.set('busca', search);
    const result = await request(`/api/alunos?${params}`);
    if (requestSequence !== studentLoadSequence) return;
    studentTotal = result.paginacao.total;
    studentTotalPages = Math.min(
      result.paginacao.totalPaginas,
      result.paginacao.paginaMaxima,
    );
    if (page > studentTotalPages) {
      await loadStudents(studentTotalPages);
      return;
    }
    studentPage = page;
    students = result.dados;
    renderStudents();
  } catch (error) {
    if (requestSequence !== studentLoadSequence) return;
    feedback.textContent = error.message;
  }
}

document.querySelector('#student-search').addEventListener('input', () => {
  clearTimeout(studentSearchTimeout);
  studentSearchTimeout = setTimeout(() => loadStudents(1), 250);
});

document.querySelector('#previous-page').addEventListener('click', () => {
  if (studentPage > 1) loadStudents(studentPage - 1);
});

document.querySelector('#next-page').addEventListener('click', () => {
  if (studentPage < studentTotalPages) loadStudents(studentPage + 1);
});

function openStudentDialog(student = null) {
  editingStudentId = student?.id ?? null;
  studentForm.reset();
  studentError.textContent = '';
  document.querySelector('#dialog-title').textContent = student ? 'Editar cadastro' : 'Uma nova jornada';
  document.querySelector('#save-student').textContent = student ? 'Salvar alterações' : 'Salvar cadastro';
  if (student) {
    for (const [key, value] of Object.entries(student)) {
      if (studentForm.elements[key]) studentForm.elements[key].value = value ?? '';
    }
  }
  studentDialog.showModal();
  studentForm.elements.nome.focus();
}

document.querySelector('#add-student').addEventListener('click', () => openStudentDialog());
document.querySelector('#first-student').addEventListener('click', () => openStudentDialog());
document.querySelector('#close-dialog').addEventListener('click', () => studentDialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => studentDialog.close());

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  studentError.textContent = '';
  if (!studentForm.reportValidity()) return;

  const formData = new FormData(studentForm);
  const payload = {
    nome: String(formData.get('nome')).trim(),
    idade: Number(formData.get('idade')),
    telefone: String(formData.get('telefone')).trim(),
    email: String(formData.get('email')).trim(),
    nivel_tecnologia: String(formData.get('nivel_tecnologia')),
  };
  const button = document.querySelector('#save-student');
  button.disabled = true;
  button.textContent = 'Salvando…';

  try {
    await request(editingStudentId ? `/api/alunos/${editingStudentId}` : '/api/alunos', {
      method: editingStudentId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    studentDialog.close();
    showToast(editingStudentId ? 'Cadastro atualizado com carinho.' : 'Aluno cadastrado com sucesso.');
    await loadStudents(editingStudentId ? studentPage : 1);
  } catch (error) {
    studentError.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = editingStudentId ? 'Salvar alterações' : 'Salvar cadastro';
  }
});

async function removeStudent(student) {
  if (!window.confirm(`Excluir o cadastro de ${student.nome}? Esta ação não pode ser desfeita.`)) return;
  try {
    await request(`/api/alunos/${student.id}`, { method: 'DELETE' });
    showToast('Cadastro removido.');
    await loadStudents();
  } catch (error) {
    document.querySelector('#student-feedback').textContent = error.message;
  }
}

restoreRouteFromLocation();
