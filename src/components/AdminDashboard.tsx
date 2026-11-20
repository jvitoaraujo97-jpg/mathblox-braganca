import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AVATAR_COLOR_PALETTE } from '../data/shopItems';
import { getWorldIdForGrade, ORDERED_GRADES } from '../data/worlds';
import {
  buildRawAttemptsCsv,
  buildStatisticalSummaryCsv,
  CANONICAL_BNCC_AXES,
  computeBnccMatrix,
  computeDescriptiveStats,
  computeLearningGain,
  computeModeEngagement,
  fetchAllAttemptLogs,
  normalizeSchoolName,
  QuestionAttemptLog,
  triggerCsvDownload,
} from '../services/researchTelemetry';
import { CloudDiagnostics } from '../services/storageService';
import { GradeLevel, StudentProfile } from '../types/game';

interface AdminDashboardProps {
  students: StudentProfile[];
  diagnostics: CloudDiagnostics;
  onRefreshStudents: () => Promise<void>;
  onSaveStudent: (student: StudentProfile) => void;
  onCreateStudent: (input: {
    name: string;
    school: string;
    grade: GradeLevel;
    pin: string;
    avatarColor: string;
  }) => Promise<void>;
  onDeleteStudent: (studentId: string) => void;
  onExitAdmin: () => void;
}

const GRADES: GradeLevel[] = ORDERED_GRADES;

export function AdminDashboard({
  students,
  diagnostics,
  onRefreshStudents,
  onSaveStudent,
  onCreateStudent,
  onDeleteStudent,
  onExitAdmin,
}: AdminDashboardProps) {
  const [activeAdminTab, setActiveAdminTab] = useState<'alunos' | 'pesquisa'>('alunos');
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'Todos' | GradeLevel>('Todos');

  // Academic Research Telemetry State
  const [attemptLogs, setAttemptLogs] = useState<QuestionAttemptLog[]>([]);
  const [attemptSource, setAttemptSource] = useState<'supabase' | 'local'>('local');
  const [attemptCloudCount, setAttemptCloudCount] = useState(0);
  const [loadingResearch, setLoadingResearch] = useState(false);
  const [anonymizeExport, setAnonymizeExport] = useState(true);

  // Edit modal / row state
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);

  // Add new student modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSchool, setNewSchool] = useState('');
  const [newGrade, setNewGrade] = useState<GradeLevel>('6º Ano');
  const [newPin, setNewPin] = useState('1234');
  const [newColor, setNewColor] = useState(AVATAR_COLOR_PALETTE[0].hex);

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [refreshingCloud, setRefreshingCloud] = useState(false);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  };

  const refreshAttemptLogs = async () => {
    setLoadingResearch(true);
    try {
      const res = await fetchAllAttemptLogs();
      setAttemptLogs(res.logs);
      setAttemptSource(res.source);
      setAttemptCloudCount(res.cloudCount);
    } finally {
      setLoadingResearch(false);
    }
  };

  // Run a live SELECT check whenever the professor opens the admin panel
  useEffect(() => {
    setRefreshingCloud(true);
    void Promise.all([onRefreshStudents(), refreshAttemptLogs()]).finally(() =>
      setRefreshingCloud(false)
    );
  }, [onRefreshStudents]);

  const xpStats = useMemo(
    () => computeDescriptiveStats(students.map((s) => s.xp)),
    [students]
  );
  const latencyStats = useMemo(
    () => computeDescriptiveStats(attemptLogs.map((l) => l.response_time_ms / 1000)),
    [attemptLogs]
  );
  const learningGain = useMemo(() => computeLearningGain(attemptLogs), [attemptLogs]);
  const bnccMatrix = useMemo(() => computeBnccMatrix(attemptLogs), [attemptLogs]);
  const modeEngagement = useMemo(() => computeModeEngagement(attemptLogs), [attemptLogs]);
  const tabuadaLogicStats = useMemo(() => {
    const rows = attemptLogs.filter((l) => l.bncc_topic === 'Raciocínio Lógico — Tabuada');
    const correct = rows.filter((l) => l.is_correct).length;
    const accuracyPct = rows.length > 0 ? (correct / rows.length) * 100 : 0;
    const avgLatencySec =
      rows.length > 0
        ? rows.reduce((sum, l) => sum + l.response_time_ms, 0) / rows.length / 1000
        : 0;
    return {
      attempts: rows.length,
      correct,
      accuracyPct,
      avgLatencySec,
    };
  }, [attemptLogs]);
  const uniqueNormalizedSchoolsCount = useMemo(
    () => new Set(students.map((s) => normalizeSchoolName(s.school))).size,
    [students]
  );

  const handleExportRawCsv = () => {
    const csv = buildRawAttemptsCsv(attemptLogs, students, anonymizeExport);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(
      `mathblox_base_bruta_${anonymizeExport ? 'anonimizada' : 'nominal'}_${stamp}.csv`,
      csv
    );
    notify(
      `Base Bruta (.CSV) exportada (${attemptLogs.length} registros${
        anonymizeExport ? ' · LGPD Anonimizado' : ''
      }).`
    );
  };

  const handleExportSummaryCsv = () => {
    const csv = buildStatisticalSummaryCsv(attemptLogs, students, anonymizeExport);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(`mathblox_resumo_estatistico_${stamp}.csv`, csv);
    notify('Resumo Estatístico (.CSV) pronto para R / Python / Excel / SPSS.');
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (gradeFilter !== 'Todos' && s.grade !== gradeFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.school.toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q)
      );
    });
  }, [students, gradeFilter, search]);

  const handleSaveEdited = () => {
    if (!editingStudent) return;
    const trimmedName = editingStudent.name.trim();
    const trimmedSchool = editingStudent.school.trim();
    if (!trimmedName || !trimmedSchool) return;

    const updated: StudentProfile = {
      ...editingStudent,
      name: trimmedName,
      school: trimmedSchool,
      worldId: getWorldIdForGrade(editingStudent.grade),
      pin: editingStudent.pin.replace(/\D/g, '').slice(0, 4) || '1234',
      xp: Math.max(0, Number(editingStudent.xp) || 0),
      coins: Math.max(0, Number(editingStudent.coins) || 0),
    };
    onSaveStudent(updated);
    setEditingStudent(null);
    notify(`Dados de ${updated.name} salvos.`);
  };

  const handleResetPin = (stu: StudentProfile) => {
    onSaveStudent({ ...stu, pin: '1234' });
    notify(`PIN de ${stu.name} redefinido para 1234.`);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSchool.trim()) return;
    try {
      await onCreateStudent({
        name: newName.trim(),
        school: newSchool.trim(),
        grade: newGrade,
        pin: newPin.replace(/\D/g, '').slice(0, 4) || '1234',
        avatarColor: newColor,
      });
      setNewName('');
      setNewSchool('');
      setNewPin('1234');
      setShowAddModal(false);
      notify('Novo aluno gravado com sucesso na nuvem.');
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : 'Erro ao gravar aluno no Supabase. Verifique sua conexão.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-display text-lg sm:text-xl font-extrabold text-white whitespace-nowrap">
              Painel do Professor · MathBlox
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              <span>Adicionar Aluno</span>
            </button>

            <button
              type="button"
              onClick={onExitAdmin}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Voltar ao Portal</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {toastMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-4 py-2.5 text-xs font-semibold text-emerald-300">
            {toastMsg}
          </div>
        )}

        {/* Supabase Cloud Diagnostics Card */}
        <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/95 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-sky-400">
                <Database className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Diagnóstico de Banco de Dados
                </p>

                <p
                  className={`mt-0.5 text-sm font-extrabold ${
                    diagnostics.connectionStatus === 'connected'
                      ? 'text-emerald-300'
                      : diagnostics.connectionStatus === 'checking'
                      ? 'text-amber-300'
                      : 'text-rose-400'
                  }`}
                >
                  {diagnostics.storageMode === 'local'
                    ? '🔴 Modo Offline (Variáveis de ambiente ausentes ou inválidas)'
                    : diagnostics.connectionStatus === 'connected'
                    ? '🟢 Conectado ao Supabase (Nuvem Ativa)'
                    : diagnostics.connectionStatus === 'checking'
                    ? '🟡 Testando conexão com o Supabase...'
                    : '🔴 Erro de conexão'}
                </p>

                {diagnostics.connectionStatus === 'error' && diagnostics.connectionError && (
                  <div className="mt-2 rounded-xl border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-mono text-rose-200 break-words">
                    <span className="font-sans font-bold text-rose-300">Erro completo: </span>
                    {diagnostics.connectionError}
                  </div>
                )}

                <div className="mt-2.5 grid gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="font-mono font-semibold text-slate-400 shrink-0">
                      VITE_SUPABASE_URL:
                    </span>
                    <code className="font-mono text-sky-300 break-all select-all">
                      {diagnostics.supabaseUrl || '(não definida / vazia)'}
                    </code>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="font-mono font-semibold text-slate-400 shrink-0">
                      VITE_SUPABASE_ANON_KEY:
                    </span>
                    <code className="font-mono text-amber-300 break-all select-all">
                      {diagnostics.supabaseKeyPrefix || '(não definida / vazia)'}
                    </code>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span>
                    Alunos reais na tabela <code className="font-mono text-sky-300">students</code>:{' '}
                    <strong className="font-mono text-white">
                      {diagnostics.cloudStudentCount ?? students.length}
                    </strong>
                  </span>
                  {diagnostics.pendingCount > 0 && (
                    <span className="font-semibold text-amber-300">
                      Fila pendente de reenvio: {diagnostics.pendingCount}
                    </span>
                  )}
                </div>

                <p
                  className={`mt-1 text-xs break-words ${
                    diagnostics.lastError ? 'font-semibold text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {diagnostics.lastError
                    ? `Último erro registrado: ${diagnostics.lastError}${
                        diagnostics.lastErrorAt
                          ? ` (${new Date(diagnostics.lastErrorAt).toLocaleTimeString('pt-BR')})`
                          : ''
                      }`
                    : 'Nenhum erro de leitura ou gravação registrado.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={refreshingCloud}
              onClick={() => {
                setRefreshingCloud(true);
                void onRefreshStudents().finally(() => setRefreshingCloud(false));
              }}
              className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingCloud ? 'animate-spin' : ''}`} />
              <span>Sincronizar Agora</span>
            </button>
          </div>
        </section>

        {/* 2-Tab Switcher: Gestão de Alunos vs Pesquisa & Artigo Científico */}
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1.5">
            <button
              type="button"
              onClick={() => setActiveAdminTab('alunos')}
              className={`flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-all whitespace-nowrap ${
                activeAdminTab === 'alunos'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>👥 Gestão de Alunos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveAdminTab('pesquisa');
                void refreshAttemptLogs();
              }}
              className={`flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-all whitespace-nowrap ${
                activeAdminTab === 'pesquisa'
                  ? 'bg-emerald-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>📊 Pesquisa &amp; Artigo Científico</span>
            </button>
          </div>
        </section>

        {activeAdminTab === 'alunos' && (
          <>
            {/* Summary KPI Strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Total de Alunos</p>
                <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                  {students.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Colégios Ativos (Padronizados)</p>
                <p className="mt-1 font-mono text-2xl font-bold text-sky-400 tabular-nums">
                  {uniqueNormalizedSchoolsCount}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs text-slate-400">Questões Resolvidas</p>
                <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                  {students.reduce((acc, s) => acc + s.questionsAnswered, 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs text-slate-400">XP Acumulado da Turma</p>
                <p className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">
                  {students.reduce((acc, s) => acc + s.xp, 0)}
                </p>
              </div>
            </section>

            {/* Search & Grade Filter */}
        <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, colégio ou série..."
              className="min-h-[42px] w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm text-white outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-1">
            {(['Todos', ...GRADES] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  gradeFilter === g
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        {/* Students Management Table */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3.5 font-semibold">Aluno</th>
                  <th className="px-4 py-3.5 font-semibold">Série / Mundo</th>
                  <th className="px-4 py-3.5 font-semibold">Colégio / Instituição</th>
                  <th className="px-4 py-3.5 font-semibold">PIN</th>
                  <th className="px-4 py-3.5 font-semibold text-right">XP / Coins</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredStudents.map((stu) => (
                  <tr key={stu.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-4 w-4 rounded-md shrink-0 border border-white/20"
                          style={{ backgroundColor: stu.avatarColor }}
                        />
                        <span className="font-semibold text-white">{stu.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-300 whitespace-nowrap">
                      {stu.grade} (M{stu.worldId})
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-sky-300">
                      {stu.school}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-300 tabular-nums">
                      {stu.pin}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      <span className="font-bold text-emerald-400">{stu.xp} XP</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      <span className="font-bold text-amber-400">{stu.coins} C</span>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingStudent({ ...stu })}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-slate-700"
                          title="Editar Nome, Série, Colégio ou Saldo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPin(stu)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-slate-700"
                          title="Redefinir PIN para 1234"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>PIN 1234</span>
                        </button>

                        {confirmDeleteId === stu.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteStudent(stu.id);
                                setConfirmDeleteId(null);
                                notify(`Aluno ${stu.name} removido.`);
                              }}
                              className="rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-400"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(stu.id)}
                            className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-rose-500/30 bg-rose-950/40 px-2 py-1 text-xs text-rose-400 hover:bg-rose-900/50"
                            title="Excluir cadastro"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
          </>
        )}

        {/* =================================================================== */}
        {/* ABA 2: PESQUISA & ARTIGO CIENTÍFICO (TELEMETRIA, BNCC, LGPD & CSV)  */}
        {/* =================================================================== */}
        {activeAdminTab === 'pesquisa' && (
          <div className="space-y-6">
            {/* LGPD & Export Bar */}
            <section className="rounded-2xl border border-emerald-500/35 bg-slate-900/95 p-5 shadow-lg">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg sm:text-xl font-black text-white">
                      Exportação Científica &amp; Ética em Pesquisa (LGPD)
                    </h2>
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                        attemptSource === 'supabase'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {attemptSource === 'supabase'
                        ? `☁️ Supabase attempt_logs (${attemptCloudCount} nuvem)`
                        : `💾 Cache Local (${attemptLogs.length} registros)`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Compatível diretamente com R, Python (Pandas/SciPy), SPSS e Microsoft Excel (UTF-8 com BOM).
                  </p>

                  {/* LGPD Anonymization Checkbox (Checked by Default) */}
                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500/50">
                    <input
                      type="checkbox"
                      checked={anonymizeExport}
                      onChange={(e) => setAnonymizeExport(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 accent-emerald-500"
                    />
                    <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>
                      🔒 Anonimizar identidade dos alunos (Participante_001, Participante_002...)
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void refreshAttemptLogs()}
                    disabled={loadingResearch}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-bold text-sky-300 hover:bg-slate-800 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingResearch ? 'animate-spin' : ''}`} />
                    <span>Atualizar Logs</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportRawCsv}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 shadow-md"
                  >
                    <Download className="h-4 w-4" />
                    <span>📥 Exportar Base Bruta (.CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSummaryCsv}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-sky-400 shadow-md"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>📥 Exportar Resumo Estatístico (.CSV)</span>
                  </button>
                </div>
              </div>
            </section>

            {/* 1. Estatística Descritiva + Learning Gain */}
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Tamanho da Amostra
                </p>
                <p className="mt-2 font-mono text-2xl font-black text-white tabular-nums">
                  N = {students.length}
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Interações registradas:{' '}
                  <strong className="font-mono text-sky-300">n = {attemptLogs.length}</strong>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {uniqueNormalizedSchoolsCount} escolas padronizadas
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Distribuição de XP (Descritiva)
                </p>
                <p className="mt-2 font-mono text-2xl font-black text-amber-400 tabular-nums">
                  x̄ = {xpStats.mean.toFixed(1)}
                </p>
                <div className="mt-1 flex items-center gap-3 font-mono text-xs text-slate-300 tabular-nums">
                  <span>Med: {xpStats.median.toFixed(1)}</span>
                  <span>σ: {xpStats.stdDev.toFixed(1)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">Pontos acumulados por aluno</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Latência Cognitiva (seg)
                  </p>
                  <Clock className="h-4 w-4 text-sky-400" />
                </div>
                <p className="mt-2 font-mono text-2xl font-black text-sky-300 tabular-nums">
                  {latencyStats.count > 0 ? `${latencyStats.mean.toFixed(2)}s` : '—'}
                </p>
                <div className="mt-1 flex items-center gap-3 font-mono text-xs text-slate-300 tabular-nums">
                  <span>Med: {latencyStats.median.toFixed(2)}s</span>
                  <span>σ: {latencyStats.stdDev.toFixed(2)}s</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">Tempo médio até a resposta</p>
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-slate-900 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    Learning Gain (Δ%)
                  </p>
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <p
                  className={`mt-2 font-mono text-2xl font-black tabular-nums ${
                    learningGain.deltaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {learningGain.eligibleStudents > 0
                    ? `${learningGain.deltaPct >= 0 ? '+' : ''}${learningGain.deltaPct.toFixed(1)}%`
                    : '—'}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-300 tabular-nums">
                  5 prim: {learningGain.first5AccuracyPct.toFixed(1)}% → 5 últ:{' '}
                  {learningGain.last5AccuracyPct.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Base: {learningGain.eligibleStudents} alunos elegíveis (≥2 respostas)
                </p>
              </div>
            </section>

            {/* Destaque Acadêmico: Raciocínio Lógico — Tabuada (Voadeira Rio Caeté) */}
            <section className="rounded-2xl border border-teal-500/40 bg-gradient-to-r from-teal-950/60 via-slate-900 to-cyan-950/50 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-teal-400/40 bg-teal-500/20 px-2.5 py-0.5 text-[11px] font-black text-teal-200">
                      🚤 Destaque Voadeira · Rio Caeté
                    </span>
                    <h3 className="font-display text-sm sm:text-base font-extrabold text-white">
                      Raciocínio Lógico — Tabuada
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    Métricas dedicadas das 8 bóias lógicas (fator oculto, dobro/triplo, distributiva e proporções) gravadas com o tópico <code className="rounded bg-slate-950 px-1.5 py-0.5 text-[11px] text-teal-300">Raciocínio Lógico — Tabuada</code>.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2.5 shrink-0">
                  <div className="rounded-xl border border-teal-500/30 bg-slate-950/80 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Tentativas</p>
                    <p className="mt-0.5 font-mono text-base font-black text-teal-300 tabular-nums">
                      n = {tabuadaLogicStats.attempts}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-slate-950/80 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Acerto</p>
                    <p className="mt-0.5 font-mono text-base font-black text-emerald-400 tabular-nums">
                      {tabuadaLogicStats.attempts > 0
                        ? `${tabuadaLogicStats.accuracyPct.toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-sky-500/30 bg-slate-950/80 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Latência</p>
                    <p className="mt-0.5 font-mono text-base font-black text-sky-300 tabular-nums">
                      {tabuadaLogicStats.attempts > 0
                        ? `${tabuadaLogicStats.avgLatencySec.toFixed(2)}s`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Matriz Cruzada BNCC (Série × Eixo Temático) */}
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-5 py-4">
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                  Tabela Cruzada BNCC — Taxa de Acerto por Série × Eixo Temático
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Desempenho granular do 1º ao 9º Ano nos 5 eixos fundamentais da Base Nacional Comum Curricular.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Série</th>
                      {CANONICAL_BNCC_AXES.map((ax) => (
                        <th key={ax} className="px-3 py-3 font-semibold text-center">
                          {ax}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-semibold text-right">Total / Acerto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {bnccMatrix.map((row) => (
                      <tr key={row.grade} className="hover:bg-slate-800/35">
                        <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                          {row.grade}
                        </td>
                        {CANONICAL_BNCC_AXES.map((ax) => {
                          const cell = row.axes[ax];
                          const tone =
                            cell.attempts === 0
                              ? 'text-slate-600'
                              : cell.accuracyPct >= 75
                                ? 'text-emerald-400'
                                : cell.accuracyPct >= 50
                                  ? 'text-amber-300'
                                  : 'text-rose-400';
                          return (
                            <td
                              key={ax}
                              className={`px-3 py-3 text-center font-mono text-xs tabular-nums ${tone}`}
                            >
                              {cell.attempts > 0 ? (
                                <div>
                                  <span className="font-bold">{cell.accuracyPct.toFixed(0)}%</span>
                                  <span className="block text-[10px] text-slate-500">
                                    ({cell.correct}/{cell.attempts})
                                  </span>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-sky-300 tabular-nums whitespace-nowrap">
                          {row.totalAttempts > 0
                            ? `${row.totalAccuracyPct.toFixed(1)}% (n=${row.totalAttempts})`
                            : '0 resp.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3. Tabela de Engajamento por Modalidade 3D */}
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-5 py-4">
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                  Engajamento &amp; Desempenho por Modalidade 3D
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Comparativo entre ambientes gamificados para análise de retenção, precisão e velocidade cognitiva.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Modalidade 3D</th>
                      <th className="px-4 py-3 font-semibold text-right">Partidas (Est.)</th>
                      <th className="px-4 py-3 font-semibold text-right">Questões (n)</th>
                      <th className="px-4 py-3 font-semibold text-right">Taxa de Acerto</th>
                      <th className="px-4 py-3 font-semibold text-right">Latência Média</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {modeEngagement.map((m) => (
                      <tr key={m.modeKey} className="hover:bg-slate-800/35">
                        <td className="px-4 py-3 font-bold text-white">{m.label}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-300 tabular-nums">
                          {m.matchesEstimate}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-sky-300 tabular-nums">
                          {m.attempts}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-emerald-400 tabular-nums">
                          {m.attempts > 0 ? `${m.accuracyPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-amber-300 tabular-nums">
                          {m.attempts > 0 ? `${m.avgLatencySec.toFixed(2)}s` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Modal: Editar Aluno (Nome, Colégio, Série, PIN, XP e BloxCoins) */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">
                Editar Cadastro do Aluno
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Nome do Aluno</label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, name: e.target.value })
                  }
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Colégio / Instituição
                </label>
                <input
                  type="text"
                  value={editingStudent.school}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, school: e.target.value })
                  }
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Série Escolar
                  </label>
                  <select
                    value={editingStudent.grade}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        grade: e.target.value as GradeLevel,
                      })
                    }
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    PIN (4 dígitos)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={editingStudent.pin}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 font-mono text-sm text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">XP Total</label>
                  <input
                    type="number"
                    min={0}
                    value={editingStudent.xp}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        xp: Math.max(0, parseInt(e.target.value || '0', 10)),
                      })
                    }
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 font-mono text-sm text-emerald-400 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">BloxCoins</label>
                  <input
                    type="number"
                    min={0}
                    value={editingStudent.coins}
                    onChange={(e) =>
                      setEditingStudent({
                        ...editingStudent,
                        coins: Math.max(0, parseInt(e.target.value || '0', 10)),
                      })
                    }
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 font-mono text-sm text-amber-400 outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdited}
                className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 font-display text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
              >
                <Check className="h-4 w-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Novo Aluno */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <form
            onSubmit={handleAddSubmit}
            className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">
                Cadastrar Novo Aluno
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Nome do Aluno</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Lucas Oliveira"
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Colégio / Instituição
                </label>
                <input
                  type="text"
                  required
                  value={newSchool}
                  onChange={(e) => setNewSchool(e.target.value)}
                  placeholder="Ex.: CEJPII, IST, Escola Evolução..."
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Série Escolar
                  </label>
                  <select
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value as GradeLevel)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    PIN (4 dígitos)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 font-mono text-sm text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Cor do Avatar
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AVATAR_COLOR_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewColor(c.hex)}
                      className={`h-8 w-8 rounded-xl border-2 transition-transform ${
                        newColor === c.hex
                          ? 'scale-110 border-white'
                          : 'border-transparent opacity-80'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 font-display text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                <span>Criar Aluno</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
