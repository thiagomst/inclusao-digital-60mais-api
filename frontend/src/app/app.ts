import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { firstValueFrom, Subscription, filter } from 'rxjs';
import { AuthService, User } from './auth.service';
import { Student, StudentInput, StudentService, TechnologyLevel } from './student.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly studentService = inject(StudentService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  route = '';
  students: Student[] = [];
  total = 0;
  page = 1;
  totalPages = 1;
  search = '';
  feedback = '';
  authError = '';
  formError = '';
  loading = false;
  submitting = false;
  saving = false;
  studentDialogOpen = false;
  menuOpen = false;
  editingStudent: Student | null = null;
  readonly today = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date());
  readonly authForm = this.formBuilder.group({
    nome: ['', [Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    senha: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    manterConectado: [false],
  });
  readonly studentForm = this.formBuilder.group({
    nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    telefone: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(20)]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    idade: [60, [Validators.required, Validators.min(60), Validators.max(120)]],
    nivel_tecnologia: ['iniciante' as TechnologyLevel, Validators.required],
  });

  private readonly routeSubscription: Subscription;
  private searchTimeout: ReturnType<typeof setTimeout> | undefined;
  private requestSequence = 0;

  constructor() {
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.onRouteChanged(event.urlAfterRedirects));
  }

  ngOnInit(): void {
    this.onRouteChanged(window.location.pathname);
  }

  ngOnDestroy(): void {
    this.routeSubscription.unsubscribe();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  get user(): User | null {
    return this.auth.user;
  }

  get knownEmails(): string[] {
    return this.auth.knownEmails;
  }

  get isRegister(): boolean {
    return this.route === 'cadastro';
  }

  get isAuth(): boolean {
    return this.route === 'entrar' || this.route === 'cadastro';
  }

  get isDashboard(): boolean {
    return this.route === 'painel' || this.route === 'painel/alunos';
  }

  get isStudentsPage(): boolean {
    return this.route === 'painel/alunos';
  }

  get firstName(): string {
    return this.user?.nome.split(/\s+/)[0] || 'que bom ver você';
  }

  get initials(): string {
    return this.initialsFor(this.user?.nome || 'Viver Conectado');
  }

  private onRouteChanged(url: string): void {
    this.route = url.split('?')[0].replace(/^\/|\/$/g, '') || 'inicio';
    this.menuOpen = false;
    if (this.isAuth) {
      this.authForm.reset({ nome: '', email: '', senha: '', manterConectado: false });
      this.authError = '';
    }
    if (this.isDashboard) {
      this.page = 1;
      this.search = '';
      this.loadStudents(1);
    }
  }

  async submitAuth(): Promise<void> {
    this.authError = '';
    if (this.isRegister) {
      this.authForm.controls.nome.addValidators(Validators.required);
      this.authForm.controls.nome.updateValueAndValidity();
    } else {
      this.authForm.controls.nome.removeValidators(Validators.required);
      this.authForm.controls.nome.updateValueAndValidity();
    }
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      this.authError = 'Confira os dados informados e tente novamente.';
      return;
    }

    this.submitting = true;
    const { nome, email, senha, manterConectado } = this.authForm.getRawValue();
    try {
      const result = this.isRegister
        ? await firstValueFrom(this.auth.register(nome!.trim(), email!.trim(), senha!))
        : await firstValueFrom(this.auth.login(email!.trim(), senha!, Boolean(manterConectado)));
      this.auth.saveSession(result, Boolean(result.manterConectado));
      await this.router.navigate(['/painel']);
    } catch (error) {
      this.authError = this.errorMessage(error, 'Não foi possível concluir o acesso. Tente novamente.');
    } finally {
      this.submitting = false;
      this.changeDetector.markForCheck();
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
      await this.router.navigate(['/']);
    } catch {
      this.feedback = 'Não foi possível encerrar a sessão. Tente novamente.';
      this.changeDetector.markForCheck();
    }
  }

  async loadStudents(page = this.page): Promise<void> {
    const sequence = ++this.requestSequence;
    this.loading = true;
    this.feedback = '';
    try {
      const result = await firstValueFrom(this.studentService.list(page, this.search.trim()));
      if (sequence !== this.requestSequence) return;
      this.total = result.paginacao.total;
      this.totalPages = Math.min(result.paginacao.totalPaginas, result.paginacao.paginaMaxima);
      if (page > this.totalPages) {
        await this.loadStudents(this.totalPages);
        return;
      }
      this.page = page;
      this.students = result.dados;
    } catch (error) {
      if (sequence === this.requestSequence) {
        this.feedback = this.errorMessage(error, 'Não foi possível carregar os cadastros.');
        if (error instanceof HttpErrorResponse && error.status === 401) {
          await this.logout();
        }
        this.changeDetector.markForCheck();
      }
    } finally {
      if (sequence === this.requestSequence) {
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  onSearch(event: Event): void {
    this.search = (event.target as HTMLInputElement).value;
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => void this.loadStudents(1), 250);
  }

  openStudentForm(student: Student | null = null): void {
    this.editingStudent = student;
    this.formError = '';
    this.studentForm.reset(student ? {
      nome: student.nome,
      telefone: student.telefone,
      email: student.email || '',
      idade: student.idade,
      nivel_tecnologia: student.nivel_tecnologia,
    } : {
      nome: '',
      telefone: '',
      email: '',
      idade: 60,
      nivel_tecnologia: 'iniciante',
    });
    this.studentDialogOpen = true;
  }

  closeStudentForm(): void {
    if (!this.saving) this.studentDialogOpen = false;
  }

  async saveStudent(): Promise<void> {
    this.formError = '';
    if (this.studentForm.invalid) {
      this.studentForm.markAllAsTouched();
      this.formError = 'Confira nome, idade, telefone e e-mail.';
      return;
    }

    this.saving = true;
    const value = this.studentForm.getRawValue();
    const student: StudentInput = {
      nome: value.nome!.trim(),
      telefone: value.telefone!.trim(),
      email: value.email!.trim(),
      idade: Number(value.idade),
      nivel_tecnologia: value.nivel_tecnologia!,
    };
    try {
      if (this.editingStudent) {
        await firstValueFrom(this.studentService.update(this.editingStudent.id, student));
      } else {
        await firstValueFrom(this.studentService.create(student));
      }
      this.studentDialogOpen = false;
      await this.loadStudents(this.editingStudent ? this.page : 1);
    } catch (error) {
      this.formError = this.errorMessage(error, 'Não foi possível salvar o cadastro.');
    } finally {
      this.saving = false;
      this.changeDetector.markForCheck();
    }
  }

  async deleteStudent(student: Student): Promise<void> {
    if (!window.confirm(`Excluir o cadastro de ${student.nome}? Esta ação não pode ser desfeita.`)) return;
    try {
      await firstValueFrom(this.studentService.delete(student.id));
      await this.loadStudents(this.page);
    } catch (error) {
      this.feedback = this.errorMessage(error, 'Não foi possível excluir o cadastro.');
      this.changeDetector.markForCheck();
    }
  }

  levelLabel(level: TechnologyLevel): string {
    return ({
      iniciante: 'Começando agora',
      basico: 'Conhece o básico',
      intermediario: 'Tem experiência',
    })[level];
  }

  initialsFor(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'VC';
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.erro === 'string') {
      return error.error.erro;
    }
    return fallback;
  }
}
