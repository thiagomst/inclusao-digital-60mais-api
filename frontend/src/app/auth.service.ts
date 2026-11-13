import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';

export interface User {
  id: number;
  nome: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  usuario: User;
  manterConectado?: boolean;
  mensagem?: string;
}

const TOKEN_KEY = 'viver-conectado-token';
const USER_KEY = 'viver-conectado-user';
const EMAILS_KEY = 'viver-conectado-known-emails';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private readonly http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  get user(): User | null {
    try {
      const savedUser = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return savedUser ? JSON.parse(savedUser) as User : null;
    } catch (error) {
      console.warn('Não foi possível ler os dados locais da sessão.', error);
      return null;
    }
  }

  get knownEmails(): string[] {
    try {
      const savedEmails: unknown = JSON.parse(localStorage.getItem(EMAILS_KEY) || '[]');
      if (!Array.isArray(savedEmails)) return [];
      return savedEmails
        .filter((email): email is string => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        .slice(0, 5);
    } catch (error) {
      console.warn('Não foi possível ler as sugestões locais de e-mail.', error);
      return [];
    }
  }

  login(email: string, senha: string, manterConectado: boolean): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, senha, manterConectado });
  }

  register(nome: string, email: string, senha: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/cadastro', { nome, email, senha });
  }

  saveSession(result: AuthResponse, persistent: boolean): void {
    const storage = persistent ? localStorage : sessionStorage;
    const otherStorage = persistent ? sessionStorage : localStorage;
    otherStorage.removeItem(TOKEN_KEY);
    otherStorage.removeItem(USER_KEY);
    storage.setItem(TOKEN_KEY, result.token);
    storage.setItem(USER_KEY, JSON.stringify(result.usuario));

    try {
      const emails = this.knownEmails.filter((knownEmail) => knownEmail !== result.usuario.email.toLowerCase());
      localStorage.setItem(EMAILS_KEY, JSON.stringify([result.usuario.email.toLowerCase(), ...emails].slice(0, 5)));
    } catch (error) {
      console.warn('Não foi possível salvar a sugestão de e-mail neste navegador.', error);
    }
  }

  async logout(): Promise<void> {
    const wasPersistent = Boolean(localStorage.getItem(TOKEN_KEY));
    try {
      if (wasPersistent && this.token) {
        await firstValueFrom(this.http.delete('/api/auth/sessao', {
          headers: { Authorization: `Bearer ${this.token}` },
        }));
      }
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  }
}
