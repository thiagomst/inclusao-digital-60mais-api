import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export type TechnologyLevel = 'iniciante' | 'basico' | 'intermediario';

export interface Student {
  id: number;
  nome: string;
  telefone: string;
  email: string | null;
  idade: number;
  nivel_tecnologia: TechnologyLevel;
}

export interface StudentInput extends Omit<Student, 'id'> {}

export interface StudentPage {
  dados: Student[];
  paginacao: {
    pagina: number;
    limite: number;
    total: number;
    totalPaginas: number;
    paginaMaxima: number;
  };
}

@Injectable({ providedIn: 'root' })
export class StudentService {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  private get headers(): HttpHeaders {
    const token = this.auth.token;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  list(page: number, search: string): Observable<StudentPage> {
    let params = new HttpParams().set('page', page).set('limit', 20);
    if (search) params = params.set('busca', search);
    return this.http.get<StudentPage>('/api/alunos', { params, headers: this.headers });
  }

  create(student: StudentInput): Observable<Student> {
    return this.http.post<Student>('/api/alunos', student, { headers: this.headers });
  }

  update(id: number, student: StudentInput): Observable<Student> {
    return this.http.put<Student>(`/api/alunos/${id}`, student, { headers: this.headers });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/alunos/${id}`, { headers: this.headers });
  }
}
