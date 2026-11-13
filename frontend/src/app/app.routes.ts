import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { App } from './app';

export const routes: Routes = [
  { path: '', component: App, title: 'Viver Conectado — Inclusão Digital 60+' },
  { path: 'para-quem', component: App, title: 'Para quem — Viver Conectado' },
  { path: 'tecnologia', component: App, title: 'Tecnologia com cuidado — Viver Conectado' },
  { path: 'proposta', component: App, title: 'Conheça a proposta — Viver Conectado' },
  { path: 'entrar', component: App, title: 'Entrar — Viver Conectado' },
  { path: 'cadastro', component: App, title: 'Criar conta — Viver Conectado' },
  { path: 'painel', component: App, canActivate: [authGuard], title: 'Visão geral — Viver Conectado' },
  { path: 'painel/alunos', component: App, canActivate: [authGuard], title: 'Alunos — Viver Conectado' },
  { path: '**', redirectTo: '' },
];
