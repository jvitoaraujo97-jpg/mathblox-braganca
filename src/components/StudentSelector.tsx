import { useMemo, useState } from 'react';
import { Delete, KeyRound, LockOpen, Trophy, UserCheck } from 'lucide-react';
import { GradeLevel, StudentProfile } from '../types/game';
import { getWorldById, ORDERED_GRADES } from '../data/worlds';

interface StudentSelectorProps {
  students: StudentProfile[];
  storageMode: 'supabase' | 'local';
  onSelectStudent: (student: StudentProfile) => void;
}

const GRADE_FILTERS: ('Todos' | GradeLevel)[] = ['Todos', ...ORDERED_GRADES];

export function StudentSelector({
  students,
  storageMode,
  onSelectStudent,
}: StudentSelectorProps) {
  const [gradeFilter, setGradeFilter] = useState<'Todos' | GradeLevel>('Todos');
  const [pendingStudent, setPendingStudent] = useState<StudentProfile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const filteredStudents = useMemo(() => {
    if (gradeFilter === 'Todos') return students;
    return students.filter((s) => s.grade === gradeFilter);
  }, [students, gradeFilter]);

  const topThree = useMemo(() => {
    return [...students].sort((a, b) => b.xp - a.xp).slice(0, 3);
  }, [students]);

  const handleOpenPin = (student: StudentProfile) => {
    setPendingStudent(student);
    setPinInput('');
    setPinError('');
  };

  const handleVerifyPin = (codeToCheck?: string) => {
    if (!pendingStudent) return;
    const code = codeToCheck ?? pinInput;
    if (code === pendingStudent.pin) {
      onSelectStudent(pendingStudent);
      setPendingStudent(null);
    } else {
      setPinError('PIN incorreto. O PIN padrão inicial é 1234.');
      setPinInput('');
    }
  };

  const appendDigit = (digit: string) => {
    if (!pendingStudent) return;
    setPinError('');
    if (pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length === 4) {
      handleVerifyPin(next);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Bar — 3-Zone Contract */}
      <header className="border-b border-slate-800/90 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-4 sm:px-6">
          <span className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
            MathBlox Obby
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <a href="#alunos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Alunos Ativos
            </a>
            <a href="#mundos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Torres por Série
            </a>
            <a href="#destaques" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Líderes
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {storageMode === 'supabase' ? 'Nuvem sincronizada' : 'Modo offline ativo'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Hero Intro */}
        <section className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="text-sm font-medium text-sky-400">
              Torre dos Desafios · Ensino Fundamental I e II
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl [text-wrap:balance]">
              Parkour 3D e Matemática em cada salto
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
              Selecione seu perfil abaixo para escalar a torre da sua série, atravessar a Ponte das Respostas, coletar BloxCoins e conquistar o topo do ranking.
            </p>
          </div>

          {/* Leaders Preview */}
          <div
            id="destaques"
            className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-white">Pódio da Turma</h2>
              <Trophy className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-4 divide-y divide-slate-800/80">
              {topThree.map((stu, idx) => (
                <div key={stu.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-slate-400 tabular-nums w-5">
                      #{idx + 1}
                    </span>
                    <span
                      className="h-3.5 w-3.5 rounded-sm shrink-0"
                      style={{ backgroundColor: stu.avatarColor }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{stu.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {stu.grade} · {stu.school}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-amber-400 tabular-nums shrink-0">
                    {stu.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Grade Filter Bar + Student Grid */}
        <section id="alunos" className="mt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Escolha seu Perfil ({filteredStudents.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                PIN inicial de acesso: <span className="font-mono font-bold text-slate-200">1234</span>
              </p>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-1">
              {GRADE_FILTERS.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => setGradeFilter(grade)}
                  className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    gradeFilter === grade
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredStudents.map((student) => {
              const world = getWorldById(student.worldId);
              const accuracy =
                student.questionsAnswered > 0
                  ? Math.round((student.questionsCorrect / student.questionsAnswered) * 100)
                  : 0;

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleOpenPin(student)}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition-all hover:border-sky-500/70 hover:bg-slate-900/90 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 font-display text-lg font-extrabold text-white shadow-inner"
                        style={{ backgroundColor: student.avatarColor }}
                      >
                        {student.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-base font-bold text-white group-hover:text-sky-400 transition-colors">
                          {student.name}
                        </h3>
                        <p className="truncate text-xs text-slate-400">
                          {student.grade} · {student.school}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                    <span className="truncate text-slate-400">
                      Mundo {student.worldId} · {world.title}
                    </span>
                    <span className="font-mono font-bold text-amber-400 tabular-nums shrink-0 ml-2">
                      {student.xp} XP
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                    <span>{student.coins} BloxCoins</span>
                    <span>Precisão: {accuracy}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Worlds Overview */}
        <section id="mundos" className="mt-12 border-t border-slate-800/80 pt-8">
          <h2 className="font-display text-lg font-bold text-white">Conteúdo por Mundo</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((id) => {
              const w = getWorldById(id);
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-800/90 bg-slate-900/50 p-4"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Mundo {w.id}</span>
                    <span className="font-semibold text-slate-200">{w.grade}</span>
                  </div>
                  <h3 className="mt-1 font-display text-base font-bold text-white">{w.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{w.subtitle}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Mobile-Ergonomic PIN Modal */}
      {pendingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-xl font-extrabold text-white"
                style={{ backgroundColor: pendingStudent.avatarColor }}
              >
                {pendingStudent.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-bold text-white">
                  {pendingStudent.name}
                </h3>
                <p className="text-xs text-slate-400">
                  {pendingStudent.grade} · {pendingStudent.school}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-sky-400" />
                  Digite seu PIN (padrão: 1234)
                </span>
                <button
                  type="button"
                  onClick={() => onSelectStudent(pendingStudent)}
                  className="font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap"
                >
                  Acesso rápido
                </button>
              </div>

              {/* 4 PIN boxes */}
              <div className="mt-3 grid grid-cols-4 gap-2.5">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`flex h-12 items-center justify-center rounded-xl border font-mono text-xl font-bold ${
                      pinInput[idx]
                        ? 'border-sky-500 bg-slate-800 text-white'
                        : 'border-slate-700 bg-slate-950 text-slate-600'
                    }`}
                  >
                    {pinInput[idx] ? '•' : ''}
                  </div>
                ))}
              </div>

              {pinError && (
                <p className="mt-2.5 text-xs font-medium text-rose-400">{pinError}</p>
              )}

              {/* Touch Keypad */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => appendDigit(d)}
                    className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-800/80 font-mono text-lg font-bold text-white hover:bg-slate-700 active:scale-95 transition-transform"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPendingStudent(null)}
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => appendDigit('0')}
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-800/80 font-mono text-lg font-bold text-white hover:bg-slate-700 active:scale-95 transition-transform"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput((p) => p.slice(0, -1))}
                  className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                  aria-label="Apagar dígito"
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>

              {pendingStudent.pin === '1234' && (
                <button
                  type="button"
                  onClick={() => onSelectStudent(pendingStudent)}
                  className="mt-4 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-emerald-400 active:scale-[0.98] transition-all"
                >
                  <LockOpen className="h-4 w-4" />
                  <span>Entrar com PIN Padrão (1234)</span>
                </button>
              )}
              {pendingStudent.pin !== '1234' && (
                <button
                  type="button"
                  onClick={() => handleVerifyPin()}
                  className="mt-4 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-sky-400"
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Confirmar PIN</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
