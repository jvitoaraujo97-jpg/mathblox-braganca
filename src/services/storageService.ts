import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_STUDENTS } from '../data/students';
import { getWorldIdForGrade } from '../data/worlds';
import { normalizeCosmeticId } from '../three/cosmeticBuilder';
import { GradeLevel, StudentProfile } from '../types/game';

const STORAGE_KEY = 'mathblox_obby_students_v1';
const DELETED_IDS_KEY = 'mathblox_obby_deleted_ids_v1';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const rawSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

function isValidSupabaseConfig(url?: string, key?: string): boolean {
  if (!url || !key) return false;
  if (
    url.includes('YOUR_') ||
    url.includes('seu-projeto') ||
    url.includes('example.com') ||
    key.includes('YOUR_') ||
    key.includes('sua-chave')
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

let supabase: SupabaseClient | null = null;
if (isValidSupabaseConfig(rawSupabaseUrl, rawSupabaseAnonKey)) {
  try {
    supabase = createClient(rawSupabaseUrl!, rawSupabaseAnonKey!);
  } catch {
    supabase = null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabase;
}

export function getStorageMode(): 'supabase' | 'local' {
  return supabase ? 'supabase' : 'local';
}

function readDeletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeDeletedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage quota errors
  }
}

function sanitizeStudent(s: StudentProfile): StudentProfile {
  return {
    ...s,
    worldId: s.worldId || getWorldIdForGrade(s.grade),
    unlockedItems: Array.isArray(s.unlockedItems)
      ? s.unlockedItems.map((id) => normalizeCosmeticId(id) || id)
      : [],
    equippedHat: normalizeCosmeticId(s.equippedHat),
    equippedJersey: s.equippedJersey || null,
    movementStyle: s.movementStyle || 'classic',
    auraPower: typeof s.auraPower === 'number' ? s.auraPower : 0,
  };
}

function readLocalStudents(): StudentProfile[] {
  try {
    const deletedIds = readDeletedIds();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = INITIAL_STUDENTS.filter((s) => !deletedIds.has(s.id)).map((s) =>
        sanitizeStudent({ ...s, unlockedItems: [...s.unlockedItems] })
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as StudentProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = INITIAL_STUDENTS.filter((s) => !deletedIds.has(s.id)).map((s) =>
        sanitizeStudent({ ...s, unlockedItems: [...s.unlockedItems] })
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const byId = new Map<string, StudentProfile>();
    for (const st of parsed) {
      if (!deletedIds.has(st.id)) {
        byId.set(st.id, sanitizeStudent(st));
      }
    }
    for (const init of INITIAL_STUDENTS) {
      if (!byId.has(init.id) && !deletedIds.has(init.id)) {
        byId.set(init.id, sanitizeStudent({ ...init, unlockedItems: [...init.unlockedItems] }));
      }
    }
    return Array.from(byId.values());
  } catch {
    return INITIAL_STUDENTS.map((s) => sanitizeStudent({ ...s, unlockedItems: [...s.unlockedItems] }));
  }
}

function writeLocalStudents(students: StudentProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch {
    // Ignore quota errors in restricted sandboxes
  }
}

export async function loadStudents(): Promise<StudentProfile[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('id', { ascending: true });

      if (!error && data && data.length > 0) {
        const normalized = (data as StudentProfile[]).map(sanitizeStudent);
        writeLocalStudents(normalized);
        return normalized;
      }
      if (!error && (!data || data.length === 0)) {
        await supabase.from('students').upsert(INITIAL_STUDENTS);
        writeLocalStudents(INITIAL_STUDENTS);
        return INITIAL_STUDENTS;
      }
    } catch {
      // Fallback transparently to localStorage
    }
  }
  return readLocalStudents();
}

export async function saveStudent(student: StudentProfile): Promise<StudentProfile[]> {
  const clean = sanitizeStudent(student);
  const current = readLocalStudents();
  const idx = current.findIndex((s) => s.id === clean.id);
  const next = [...current];
  if (idx >= 0) {
    next[idx] = clean;
  } else {
    next.push(clean);
  }
  writeLocalStudents(next);

  if (supabase) {
    try {
      await supabase.from('students').upsert(clean);
    } catch {
      // Keep local persistence active
    }
  }
  return next;
}

export async function createNewStudent(input: {
  name: string;
  school: string;
  grade: GradeLevel;
  pin: string;
  avatarColor: string;
}): Promise<{ student: StudentProfile; list: StudentProfile[] }> {
  const newStudent: StudentProfile = {
    id: `stu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim(),
    school: input.school.trim(),
    grade: input.grade,
    worldId: getWorldIdForGrade(input.grade),
    pin: input.pin.trim() || '1234',
    xp: 0,
    coins: 50, // Saldo inicial v4.0: 50 BloxCoins
    questionsAnswered: 0,
    questionsCorrect: 0,
    bestStreak: 0,
    unlockedItems: [],
    equippedHat: null,
    equippedJersey: null,
    avatarColor: input.avatarColor,
    movementStyle: 'classic',
    auraPower: 0,
  };

  const list = await saveStudent(newStudent);
  return { student: newStudent, list };
}

export async function deleteStudent(studentId: string): Promise<StudentProfile[]> {
  const deletedIds = readDeletedIds();
  deletedIds.add(studentId);
  writeDeletedIds(deletedIds);

  const current = readLocalStudents().filter((s) => s.id !== studentId);
  writeLocalStudents(current);

  if (supabase) {
    try {
      await supabase.from('students').delete().eq('id', studentId);
    } catch {
      // Ignore network errors
    }
  }
  return current;
}

export async function resetAllProgress(): Promise<StudentProfile[]> {
  writeDeletedIds(new Set());
  const fresh = INITIAL_STUDENTS.map((s) => ({
    ...s,
    unlockedItems: [...s.unlockedItems],
  }));
  writeLocalStudents(fresh);
  if (supabase) {
    try {
      await supabase.from('students').upsert(fresh);
    } catch {
      // Ignore network errors
    }
  }
  return fresh;
}
