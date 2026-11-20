import { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AVATAR_COLOR_PALETTE } from '../data/shopItems';
import { ORDERED_GRADES } from '../data/worlds';
import { fetchStudentByIdFromCloud } from '../services/storageService';
import { GradeLevel, StudentProfile } from '../types/game';

interface AuthPortalProps {
  students: StudentProfile[];
  storageMode: 'supabase' | 'local';
  lastStudentId: string | null;
  onRefreshStudents: () => Promise<void>;
  onLoginStudent: (student: StudentProfile) => Promise<void>;
  onRegisterStudent: (input: {
    name: string;
    school: string;
    grade: GradeLevel;
    pin: string;
    avatarColor: string;
  }) => Promise<void>;
  onEnterAdmin: () => void;
}

const GRADE_OPTIONS: GradeLevel[] = ORDERED_GRADES;

const SCHOOL_SUGGESTIONS = [
  'CEJPII',
  'IST',
  'Escola Evolução',
  'Escola SESI Bragança',
  'Escola Lupama',
];

export function AuthPortal({
  students,
  storageMode,
  lastStudentId,
  onRefreshStudents,
  onLoginStudent,
  onRegisterStudent,
  onEnterAdmin,
}: AuthPortalProps) {
  const [studentTab, setStudentTab] = useState<'login' | 'register'>('login');
  const [audioSettings, setAudioSettings] = useState(() =>
    soundEngine.getSettings()
  );
  const [refreshingList, setRefreshingList] = useState(false);

  useEffect(() => {
    soundEngine.startBgm('plaza');
    return soundEngine.subscribe((next) => setAudioSettings(next));
  }, []);

  // Always pull fresh students directly from Supabase when AuthPortal opens
  useEffect(() => {
    let active = true;
    setRefreshingList(true);
    void onRefreshStudents().finally(() => {
      if (active) setRefreshingList(false);
    });
    return () => {
      active = false;
    };
  }, [onRefreshStudents]);

  const isMusicActive = !audioSettings.muted && audioSettings.bgmEnabled;

  const handleToggleMusic = () => {
    soundEngine.startBgm('plaza');
    if (audioSettings.muted) {
      soundEngine.updateSettings({ muted: false, bgmEnabled: true });
    } else {
      soundEngine.updateSettings({ bgmEnabled: !audioSettings.bgmEnabled });
    }
  };

  const handleMusicVolumeChange = (val: number) => {
    soundEngine.startBgm('plaza');
    soundEngine.updateSettings({
      muted: false,
      bgmEnabled: val > 0,
      bgmVolume: val,
    });
  };

  // Sub-tab 1: Login existing student
  const [gradeFilter, setGradeFilter] = useState<'Todos' | GradeLevel>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    lastStudentId || students[0]?.id || 'stu-01'
  );
  const [loginPin, setLoginPin] = useState('1234');
  const [loginError, setLoginError] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [continuingSession, setContinuingSession] = useState(false);

  // Sub-tab 2: Open Registration (Novo Aluno)
  const [regName, setRegName] = useState('');
  const [regSchool, setRegSchool] = useState('');
  const [regGrade, setRegGrade] = useState<GradeLevel>('6º Ano');
  const [regPin, setRegPin] = useState('1234');
  const [regColor, setRegColor] = useState<string>(AVATAR_COLOR_PALETTE[0].hex);
  const [regError, setRegError] = useState('');
  const [submittingReg, setSubmittingReg] = useState(false);

  // Mode B: Teacher Restricted Modal (PIN 2026)
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherPin, setTeacherPin] = useState('');
  const [teacherError, setTeacherError] = useState('');

  const lastSessionStudent = useMemo(
    () => (lastStudentId ? students.find((s) => s.id === lastStudentId) || null : null),
    [students, lastStudentId]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (gradeFilter !== 'Todos' && s.grade !== gradeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.school.toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q)
      );
    });
  }, [students, gradeFilter, searchQuery]);

  const selectedStudent = useMemo(
    () =>
      students.find((s) => s.id === selectedStudentId) ||
      filteredStudents[0] ||
      students[0] ||
      null,
    [students, selectedStudentId, filteredStudents]
  );

  const handleQuickContinue = async () => {
    if (!lastSessionStudent || continuingSession) return;
    setContinuingSession(true);
    setLoginError('');
    try {
      await onLoginStudent(lastSessionStudent);
    } catch {
      setLoginError('Não foi possível revalidar sua sessão na nuvem. Tente entrar novamente.');
    } finally {
      setContinuingSession(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || submittingLogin) return;
    setSubmittingLogin(true);
    setLoginError('');
    try {
      // Always fetch latest cloud row before verifying PIN so progress & PIN are 100% current
      const freshCloud = await fetchStudentByIdFromCloud(selectedStudent.id);
      const targetStudent = freshCloud || selectedStudent;
      if (loginPin.trim() === targetStudent.pin) {
        await onLoginStudent(targetStudent);
      } else {
        setLoginError('PIN incorreto para este aluno. O PIN inicial padrão é 1234.');
      }
    } catch {
      setLoginError('Erro ao conectar à nuvem. Verifique sua internet e tente novamente.');
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    const cleanName = regName.trim();
    const cleanSchool = regSchool.trim();
    const cleanPin = regPin.replace(/\D/g, '').slice(0, 4);

    if (!cleanName) {
      setRegError('Informe o Nome do Aluno.');
      return;
    }
    if (!cleanSchool) {
      setRegError('Informe o nome do Colégio / Instituição.');
      return;
    }
    if (cleanPin.length !== 4) {
      setRegError('O PIN de acesso deve conter exatamente 4 dígitos numéricos.');
      return;
    }

    setSubmittingReg(true);
    try {
      await onRegisterStudent({
        name: cleanName,
        school: cleanSchool,
        grade: regGrade,
        pin: cleanPin,
        avatarColor: regColor,
      });
    } catch (err) {
      setRegError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar seu cadastro. Verifique sua internet e tente novamente.'
      );
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleVerifyTeacherPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherPin.trim() === '2026') {
      setTeacherError('');
      setShowTeacherModal(false);
      setTeacherPin('');
      onEnterAdmin();
    } else {
      setTeacherError('PIN Administrativo inválido.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100">
      {/* Top Bar — 3-Zone Contract */}
      <header className="border-b border-slate-800/90 bg-slate-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <span className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
            MathBlox Obby
          </span>

          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setStudentTab('login')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                studentTab === 'login' ? 'text-white font-semibold' : 'hover:text-white'
              }`}
            >
              Entrar na Conta
            </button>
            <button
              type="button"
              onClick={() => setStudentTab('register')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                studentTab === 'register' ? 'text-white font-semibold' : 'hover:text-white'
              }`}
            >
              Novo Aluno
            </button>
          </nav>

          {/* Top-Right Compact Music Widget (Toggle + Slider 0%-100%) + Discreet Teacher Access */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/95 px-2.5 py-1.5">
              <button
                type="button"
                onClick={handleToggleMusic}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                  isMusicActive
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                }`}
                title={isMusicActive ? 'Desligar Música' : 'Ligar Música'}
                aria-label={isMusicActive ? 'Desligar Música' : 'Ligar Música'}
              >
                {isMusicActive ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>

              {isMusicActive ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(audioSettings.bgmVolume * 100)}
                    onChange={(e) => handleMusicVolumeChange(Number(e.target.value) / 100)}
                    aria-label="Volume da Música"
                    className="h-1.5 w-16 sm:w-22 cursor-pointer appearance-none rounded-full bg-slate-800 accent-emerald-400"
                  />
                  <span className="w-8 font-mono text-[11px] font-bold text-emerald-400 tabular-nums text-right">
                    {Math.round(audioSettings.bgmVolume)}%
                  </span>
                </div>
              ) : (
                <span className="pr-1 text-[11px] font-semibold text-slate-400">
                  Mudo
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setTeacherPin('');
                setTeacherError('');
                setShowTeacherModal(true);
              }}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Acesso do Professor</span>
              <span className="md:hidden">Professor</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Student Portal Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs sm:text-sm font-semibold text-sky-400">
            Torre dos Desafios 3D · BNCC 1º ao 9º Ano e Trilha Base
          </p>
          <h1 className="mt-1.5 font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white [text-wrap:balance]">
            Portal do Aluno MathBlox
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400">
            Entre na sua conta para explorar a Praça da Bandeira 3D, vestir a camisa do seu time e jogar as 4 modalidades com 50 BloxCoins iniciais.
          </p>
        </div>

        {/* Quick Continue Session Card (Revalidates latest cloud progress) */}
        {lastSessionStudent && (
          <div className="mx-auto mt-5 flex max-w-xl flex-col gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/35 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold text-white"
                style={{ backgroundColor: lastSessionStudent.avatarColor }}
              >
                {lastSessionStudent.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-emerald-300">
                  Sessão anterior encontrada na nuvem
                </p>
                <p className="truncate font-display text-sm font-extrabold text-white">
                  {lastSessionStudent.name}{' '}
                  <span className="font-normal text-slate-300">
                    · {lastSessionStudent.grade} · {lastSessionStudent.xp} XP
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={continuingSession}
              onClick={handleQuickContinue}
              className="flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-display text-xs font-extrabold text-slate-950 hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-60 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>
                {continuingSession
                  ? 'Carregando da nuvem...'
                  : `Continuar como ${lastSessionStudent.name}`}
              </span>
            </button>
          </div>
        )}

        {/* Two Responsive Sub-Tabs for Student Mode */}
        <div className="mx-auto mt-5 flex max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setStudentTab('login')}
            className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              studentTab === 'login'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Entrar na Minha Conta</span>
          </button>
          <button
            type="button"
            onClick={() => setStudentTab('register')}
            className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              studentTab === 'register'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            <span>Novo Aluno (Cadastro)</span>
          </button>
        </div>

        {/* SUB-ABA 1: ENTRAR NA MINHA CONTA */}
        {studentTab === 'login' && (
          <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
            {/* Student Selector List */}
            <section className="lg:col-span-7 rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-bold text-white">
                    1. Selecione seu Nome ({filteredStudents.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setRefreshingList(true);
                      void onRefreshStudents().finally(() => setRefreshingList(false));
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-sky-400 transition-colors"
                    title="Atualizar lista de alunos da nuvem"
                    aria-label="Atualizar lista de alunos da nuvem"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshingList ? 'animate-spin text-sky-400' : ''}`} />
                  </button>
                </div>

                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar nome ou colégio..."
                    className="min-h-[38px] w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Grade Filter Pills */}
              <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
                {(['Todos', ...GRADE_OPTIONS] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradeFilter(g)}
                    className={`min-h-[32px] rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      gradeFilter === g
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* Scrollable Student Cards */}
              <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredStudents.map((stu) => {
                  const isSelected = selectedStudent?.id === stu.id;
                  return (
                    <button
                      key={stu.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(stu.id);
                        setLoginError('');
                      }}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-sky-400 bg-sky-500/15 ring-2 ring-sky-500/20'
                          : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-base font-extrabold text-white"
                          style={{ backgroundColor: stu.avatarColor }}
                        >
                          {stu.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-bold text-white">
                            {stu.name}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {stu.grade} · {stu.school}
                          </p>
                        </div>
                      </div>

                      <span className="font-mono text-xs font-bold text-amber-400 tabular-nums shrink-0">
                        {stu.xp} XP
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* PIN Entry & JOGAR AGORA */}
            <section className="lg:col-span-5 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              {selectedStudent ? (
                <form onSubmit={handleStudentLogin}>
                  <p className="text-xs font-semibold text-sky-400">2. Confirme seu Acesso</p>
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-xl font-extrabold text-white"
                      style={{ backgroundColor: selectedStudent.avatarColor }}
                    >
                      {selectedStudent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-lg font-extrabold text-white">
                        {selectedStudent.name}
                      </h3>
                      <p className="truncate text-xs text-slate-400">
                        {selectedStudent.grade} · {selectedStudent.school}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-sky-400" />
                        PIN de 4 dígitos
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Padrão inicial: 1234
                      </span>
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={loginPin}
                      onChange={(e) => {
                        setLoginError('');
                        setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                      }}
                      placeholder="1234"
                      className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-center font-mono text-2xl font-bold tracking-[0.4em] text-white outline-none focus:border-sky-500"
                    />
                  </div>

                  {loginError && (
                    <p className="mt-2.5 text-xs font-medium text-rose-400">{loginError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingLogin}
                    className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 font-display text-base font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    <Play className="h-5 w-5 fill-current" />
                    <span>{submittingLogin ? 'CONECTANDO...' : 'JOGAR AGORA'}</span>
                  </button>

                  <p className="mt-4 text-center text-xs text-slate-400">
                    Não encontrou seu nome na lista?{' '}
                    <button
                      type="button"
                      onClick={() => setStudentTab('register')}
                      className="font-semibold text-sky-400 hover:underline"
                    >
                      Criar minha conta agora
                    </button>
                  </p>
                </form>
              ) : (
                <p className="text-sm text-slate-400">Selecione um aluno ao lado para entrar.</p>
              )}
            </section>
          </div>
        )}

        {/* SUB-ABA 2: NOVO ALUNO (CADASTRO ABERTO) */}
        {studentTab === 'register' && (
          <form
            onSubmit={handleRegisterSubmit}
            className="mx-auto mt-6 max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-display text-xl font-extrabold text-white">
                  Novo Aluno — Cadastro Aberto
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Crie seu perfil gratuito em segundos e comece com 50 BloxCoins iniciais
                </p>
              </div>
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-white/25 font-display text-xl font-extrabold text-white"
                style={{ backgroundColor: regColor }}
              >
                {(regName.trim().charAt(0) || 'A').toUpperCase()}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {/* Nome do Aluno */}
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Nome do Aluno *
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Digite seu nome ou apelido"
                  className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* Colégio / Instituição (Texto Livre Editável) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Colégio / Instituição (editável) *
                </label>
                <input
                  type="text"
                  required
                  value={regSchool}
                  onChange={(e) => setRegSchool(e.target.value)}
                  placeholder="Ex.: CEJPII, IST, Escola Evolução, SESI, Lupama..."
                  className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-emerald-500"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Sugestões rápidas:</span>
                  {SCHOOL_SUGGESTIONS.map((sch) => (
                    <button
                      key={sch}
                      type="button"
                      onClick={() => setRegSchool(sch)}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white"
                    >
                      {sch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Série / Ano Escolar + PIN de 4 dígitos */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Série / Ano Escolar *
                  </label>
                  <select
                    value={regGrade}
                    onChange={(e) => setRegGrade(e.target.value as GradeLevel)}
                    className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    PIN de Acesso (4 dígitos) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={regPin}
                    onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 font-mono text-base font-bold tracking-widest text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Cor Inicial do Avatar (Paleta de 8 Cores) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Cor Inicial do Avatar (8 cores)
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2.5 sm:grid-cols-8">
                  {AVATAR_COLOR_PALETTE.map((color) => {
                    const active = regColor === color.hex;
                    return (
                      <button
                        key={color.hex}
                        type="button"
                        onClick={() => setRegColor(color.hex)}
                        className={`flex h-11 w-full items-center justify-center rounded-xl border-2 transition-transform ${
                          active
                            ? 'scale-105 border-white ring-2 ring-white/30'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      />
                    );
                  })}
                </div>
              </div>

              {regError && (
                <div className="rounded-xl border border-rose-500/50 bg-rose-950/60 px-3.5 py-2.5 text-xs font-semibold text-rose-200">
                  {regError}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingReg}
                className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 font-display text-base font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                <UserPlus className="h-5 w-5" />
                <span>
                  {submittingReg
                    ? 'Salvando cadastro...'
                    : 'CRIAR CONTA E JOGAR AGORA (+50 BloxCoins)'}
                </span>
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Quiet Footer with Discreet Teacher Access Link */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
          <span>
            MathBlox Obby · Persistência:{' '}
            {storageMode === 'supabase' ? 'Supabase Cloud' : 'LocalStorage Ativo'}
          </span>
          <button
            type="button"
            onClick={() => {
              setTeacherPin('');
              setTeacherError('');
              setShowTeacherModal(true);
            }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            Acesso do Professor
          </button>
        </div>
      </footer>

      {/* Modal: Área do Professor (PIN Administrativo 2026) */}
      {showTeacherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <form
            onSubmit={handleVerifyTeacherPin}
            className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                <h3 className="font-display text-lg font-extrabold text-white">
                  Área do Professor
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTeacherModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              Digite o PIN Administrativo para gerenciar alunos, colégios, séries e pontuações.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-300">
                PIN Administrativo
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={teacherPin}
                onChange={(e) => {
                  setTeacherError('');
                  setTeacherPin(e.target.value);
                }}
                placeholder="••••"
                autoFocus
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-center font-mono text-2xl font-bold tracking-[0.35em] text-white outline-none focus:border-amber-400"
              />
            </div>

            {teacherError && (
              <p className="mt-2 text-xs font-medium text-rose-400">{teacherError}</p>
            )}

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowTeacherModal(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] rounded-xl bg-amber-400 font-display text-xs font-extrabold text-slate-950 hover:bg-amber-300"
              >
                Entrar no Painel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
