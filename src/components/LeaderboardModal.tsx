import { useMemo, useState } from 'react';
import {
  Award,
  Building2,
  Crown,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import { normalizeSchoolName } from '../services/researchTelemetry';
import { getJerseyConfig } from '../three/jerseyBuilder';
import { StudentProfile } from '../types/game';

export type LeaderboardMainTab = 'individual' | 'escolas';
export type IndividualCategory = 'geral' | 'serie' | 'precisao';
export type SchoolSortKey = 'total_xp' | 'avg_xp';

export interface SchoolRankingEntry {
  schoolName: string;
  totalStudents: number;
  totalXp: number;
  weeklyXp: number;
  avgXpPerStudent: number;
  avgAccuracyPct: number;
  totalAnswered: number;
  totalCorrect: number;
}

export interface LeaderboardPanelProps {
  student: StudentProfile;
  allStudents: StudentProfile[];
  syncTimestampLabel: string;
  refreshing: boolean;
  onManualRefresh: () => void;
}

export function LeaderboardPanel({
  student,
  allStudents,
  syncTimestampLabel,
  refreshing,
  onManualRefresh,
}: LeaderboardPanelProps) {
  const [mainTab, setMainTab] = useState<LeaderboardMainTab>('individual');
  const [rankingCategory, setRankingCategory] = useState<IndividualCategory>('geral');
  const [schoolSortBy, setSchoolSortBy] = useState<SchoolSortKey>('total_xp');

  const myNormalizedSchool = useMemo(
    () => normalizeSchoolName(student.school),
    [student.school]
  );

  const rankedStudents = useMemo(() => {
    const base =
      rankingCategory === 'serie'
        ? allStudents.filter((s) => s.grade === student.grade)
        : [...allStudents];

    return base.sort((a, b) => {
      if (rankingCategory === 'precisao') {
        const accA = a.questionsAnswered > 0 ? a.questionsCorrect / a.questionsAnswered : 0;
        const accB = b.questionsAnswered > 0 ? b.questionsCorrect / b.questionsAnswered : 0;
        if (Math.abs(accB - accA) > 0.001) return accB - accA;
        if (b.questionsCorrect !== a.questionsCorrect) return b.questionsCorrect - a.questionsCorrect;
        return b.xp - a.xp;
      }
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.questionsCorrect !== a.questionsCorrect) return b.questionsCorrect - a.questionsCorrect;
      return b.bestStreak - a.bestStreak;
    });
  }, [allStudents, rankingCategory, student.grade]);

  const schoolRankings = useMemo<SchoolRankingEntry[]>(() => {
    const map = new Map<
      string,
      {
        totalStudents: number;
        totalXp: number;
        weeklyXp: number;
        totalAnswered: number;
        totalCorrect: number;
      }
    >();

    for (const stu of allStudents) {
      const normalized = normalizeSchoolName(stu.school);
      const cur = map.get(normalized) || {
        totalStudents: 0,
        totalXp: 0,
        weeklyXp: 0,
        totalAnswered: 0,
        totalCorrect: 0,
      };
      cur.totalStudents += 1;
      cur.totalXp += stu.xp || 0;
      cur.weeklyXp += stu.weeklyXp || 0;
      cur.totalAnswered += stu.questionsAnswered || 0;
      cur.totalCorrect += stu.questionsCorrect || 0;
      map.set(normalized, cur);
    }

    const entries: SchoolRankingEntry[] = Array.from(map.entries()).map(([schoolName, data]) => ({
      schoolName,
      totalStudents: data.totalStudents,
      totalXp: data.totalXp,
      weeklyXp: data.weeklyXp,
      avgXpPerStudent: data.totalStudents > 0 ? Math.round(data.totalXp / data.totalStudents) : 0,
      avgAccuracyPct:
        data.totalAnswered > 0 ? Math.round((data.totalCorrect / data.totalAnswered) * 100) : 0,
      totalAnswered: data.totalAnswered,
      totalCorrect: data.totalCorrect,
    }));

    return entries.sort((a, b) => {
      if (schoolSortBy === 'avg_xp') {
        if (b.avgXpPerStudent !== a.avgXpPerStudent) return b.avgXpPerStudent - a.avgXpPerStudent;
        return b.totalXp - a.totalXp;
      }
      if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
      return b.avgXpPerStudent - a.avgXpPerStudent;
    });
  }, [allStudents, schoolSortBy]);

  const top3Schools = schoolRankings.slice(0, 3);

  return (
    <section className="mx-auto max-w-5xl">
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-2xl font-extrabold text-white">
              Placar Competitivo MathBlox
            </h2>
            <button
              type="button"
              onClick={onManualRefresh}
              disabled={refreshing}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            <span className="text-[11px] font-medium text-emerald-400">
              {syncTimestampLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Atualização instantânea em tempo real · Ranking Individual e Batalha Interescolar de Bragança-PA
          </p>
        </div>

        {/* Main 2-Tab Switcher: Ranking Individual vs Batalha de Colégios */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMainTab('individual')}
            className={`flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all whitespace-nowrap ${
              mainTab === 'individual'
                ? 'bg-sky-500 text-slate-950 shadow-md'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <User className="h-4 w-4" />
            <span>👤 Ranking Individual</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab('escolas')}
            className={`flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all whitespace-nowrap ${
              mainTab === 'escolas'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>🏫 Batalha de Colégios</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: RANKING INDIVIDUAL                                             */}
      {/* ===================================================================== */}
      {mainTab === 'individual' && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 p-1 overflow-x-auto w-fit max-w-full">
            <button
              type="button"
              onClick={() => setRankingCategory('geral')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                rankingCategory === 'geral'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Crown className="h-3.5 w-3.5" />
              <span>Top Geral</span>
            </button>
            <button
              type="button"
              onClick={() => setRankingCategory('serie')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                rankingCategory === 'serie'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Liga da Minha Série ({student.grade})</span>
            </button>
            <button
              type="button"
              onClick={() => setRankingCategory('precisao')}
              className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                rankingCategory === 'precisao'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Target className="h-3.5 w-3.5" />
              <span>Rei da Precisão</span>
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-xs text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Posição</th>
                    <th className="px-4 py-3.5 font-semibold">Nome</th>
                    <th className="px-4 py-3.5 font-semibold">Série</th>
                    <th className="px-4 py-3.5 font-semibold">Colégio</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Precisão</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Pontuação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {rankedStudents.map((stu, idx) => {
                    const isMe = stu.id === student.id;
                    const acc =
                      stu.questionsAnswered > 0
                        ? Math.round((stu.questionsCorrect / stu.questionsAnswered) * 100)
                        : 0;
                    const club = getJerseyConfig(stu.equippedJersey);
                    return (
                      <tr
                        key={stu.id}
                        className={isMe ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'}
                      >
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-300 tabular-nums">
                          #{idx + 1}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-3.5 w-3.5 rounded-sm shrink-0"
                              style={{ backgroundColor: stu.avatarColor }}
                            />
                            <span
                              className={`font-semibold ${
                                isMe ? 'text-sky-300' : 'text-white'
                              }`}
                            >
                              {stu.name}
                            </span>
                            {club && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                {club.shortTag}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-300 whitespace-nowrap">
                          {stu.grade}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-300">
                          {normalizeSchoolName(stu.school)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs text-emerald-400 tabular-nums">
                          {acc}% ({stu.questionsCorrect}/{stu.questionsAnswered})
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-amber-400 tabular-nums whitespace-nowrap">
                          {stu.xp} XP
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: BATALHA DE COLÉGIOS (RANKING INTERESCOLAR)                     */}
      {/* ===================================================================== */}
      {mainTab === 'escolas' && (
        <div className="mt-5 space-y-5">
          {/* Quick Sort Toggle & Info */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Award className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                Sua escola:{' '}
                <strong className="font-bold text-amber-300">{myNormalizedSchool}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setSchoolSortBy('total_xp')}
                className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
                  schoolSortBy === 'total_xp'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Crown className="h-3.5 w-3.5" />
                <span>Ordenar por XP Total</span>
              </button>
              <button
                type="button"
                onClick={() => setSchoolSortBy('avg_xp')}
                className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap ${
                  schoolSortBy === 'avg_xp'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Ordenar por Média/Aluno</span>
              </button>
            </div>
          </div>

          {/* Visual Podium (Top 3 Schools: 🥇, 🥈, 🥉) */}
          {top3Schools.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              {top3Schools.map((entry, idx) => {
                const isMySchool = entry.schoolName === myNormalizedSchool;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                const cardTone =
                  idx === 0
                    ? 'border-amber-400/70 bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950'
                    : idx === 1
                      ? 'border-slate-400/50 bg-gradient-to-b from-slate-400/10 via-slate-900 to-slate-950'
                      : 'border-orange-500/50 bg-gradient-to-b from-orange-500/10 via-slate-900 to-slate-950';
                return (
                  <div
                    key={entry.schoolName}
                    className={`relative flex flex-col justify-between rounded-2xl border-2 p-4 shadow-xl ${cardTone} ${
                      isMySchool ? 'ring-2 ring-teal-400/70' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-2xl leading-none">{medal}</span>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {isMySchool && (
                            <span className="rounded-lg bg-teal-400 px-2 py-0.5 text-[10px] font-black text-slate-950">
                              Sua Escola
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                            <Users className="h-3 w-3 text-sky-400" />
                            {entry.totalStudents} {entry.totalStudents === 1 ? 'aluno' : 'alunos'}
                          </span>
                        </div>
                      </div>

                      <h3 className="mt-2.5 font-display text-base sm:text-lg font-black text-white leading-tight">
                        {entry.schoolName}
                      </h3>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-3 text-center">
                      <div>
                        <p className="text-[10px] text-slate-400">XP Total</p>
                        <p className="font-mono text-sm font-black text-amber-300 tabular-nums">
                          {entry.totalXp}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Média/Aluno</p>
                        <p className="font-mono text-sm font-black text-sky-300 tabular-nums">
                          {entry.avgXpPerStudent}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Acerto</p>
                        <p className="font-mono text-sm font-black text-emerald-400 tabular-nums">
                          {entry.avgAccuracyPct}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Inter-School Leaderboard Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-xs text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5 font-semibold">Pos.</th>
                    <th className="px-4 py-3.5 font-semibold">Colégio / Escola</th>
                    <th className="px-4 py-3.5 font-semibold text-center">Alunos</th>
                    <th className="px-4 py-3.5 font-semibold text-right">XP Semanal</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Média XP/Aluno</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Taxa Acerto</th>
                    <th className="px-4 py-3.5 font-semibold text-right">XP Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {schoolRankings.map((entry, idx) => {
                    const isMySchool = entry.schoolName === myNormalizedSchool;
                    const rankBadge =
                      idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                    return (
                      <tr
                        key={entry.schoolName}
                        className={
                          isMySchool
                            ? 'bg-teal-500/12 hover:bg-teal-500/15'
                            : 'hover:bg-slate-800/40'
                        }
                      >
                        <td className="px-4 py-3.5 font-mono text-xs font-black text-slate-200 tabular-nums">
                          {rankBadge}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-bold ${
                                isMySchool ? 'text-teal-300' : 'text-white'
                              }`}
                            >
                              {entry.schoolName}
                            </span>
                            {isMySchool && (
                              <span className="rounded-md bg-teal-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                                Sua Escola
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-300 tabular-nums">
                          {entry.totalStudents}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-cyan-300 tabular-nums">
                          +{entry.weeklyXp} XP
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-sky-300 tabular-nums">
                          {entry.avgXpPerStudent} XP
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-400 tabular-nums">
                          {entry.avgAccuracyPct}%
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm font-black text-amber-400 tabular-nums whitespace-nowrap">
                          {entry.totalXp} XP
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface LeaderboardModalProps extends LeaderboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LeaderboardModal({ isOpen, onClose, ...panelProps }: LeaderboardModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-6 backdrop-blur-md">
      <div className="relative max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Fechar ranking"
        >
          <X className="h-4 w-4" />
        </button>
        <LeaderboardPanel {...panelProps} />
      </div>
    </div>
  );
}
