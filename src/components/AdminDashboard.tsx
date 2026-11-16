import { useMemo, useState } from 'react';
import {
  Check,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { AVATAR_COLOR_PALETTE } from '../data/shopItems';
import { getWorldIdForGrade } from '../data/worlds';
import { GradeLevel, StudentProfile } from '../types/game';

interface AdminDashboardProps {
  students: StudentProfile[];
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

const GRADES: GradeLevel[] = [
  '5º Ano',
  '6º Ano',
  '7º Ano',
  '8º Ano',
  '9º Ano',
  'Trilha Base',
];

export function AdminDashboard({
  students,
  onSaveStudent,
  onCreateStudent,
  onDeleteStudent,
  onExitAdmin,
}: AdminDashboardProps) {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'Todos' | GradeLevel>('Todos');

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

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2600);
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
    notify('Novo aluno adicionado com sucesso.');
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

        {/* Summary KPI Strip */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Total de Alunos</p>
            <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
              {students.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Colégios Ativos</p>
            <p className="mt-1 font-mono text-2xl font-bold text-sky-400 tabular-nums">
              {new Set(students.map((s) => s.school.trim())).size}
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
