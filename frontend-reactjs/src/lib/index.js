export const LANGS = [
  { code: 'en', name: 'English', bcp: 'en-US' },
  { code: 'fr', name: 'French', bcp: 'fr-FR' },
  { code: 'es', name: 'Spanish', bcp: 'es-ES' },
  { code: 'de', name: 'German', bcp: 'de-DE' },
  { code: 'ja', name: 'Japanese', bcp: 'ja-JP' },
  { code: 'zh', name: 'Mandarin Chinese', bcp: 'zh-CN' },
  { code: 'it', name: 'Italian', bcp: 'it-IT' },
  { code: 'pt', name: 'Portuguese', bcp: 'pt-BR' },
  { code: 'ko', name: 'Korean', bcp: 'ko-KR' },
  { code: 'ar', name: 'Arabic', bcp: 'ar-SA' },
  { code: 'ru', name: 'Russian', bcp: 'ru-RU' },
  { code: 'hi', name: 'Hindi', bcp: 'hi-IN' },
];

export const langName = (code) => LANGS.find((l) => l.code === code)?.name || code;
export const langBcp = (code) => LANGS.find((l) => l.code === code)?.bcp || 'en-US';

export const formatDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDuration = (secs = 0) => {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
};

export const scoreColor = (n) => (n >= 80 ? 'var(--go)' : n >= 60 ? 'var(--amber)' : 'var(--stop)');

// Role hierarchy: ADMIN > TEACHER > USER (shown as "Member"). MODERATOR is a legacy role kept for old accounts.
export const ROLE_LABEL = { ADMIN: 'Administrator', TEACHER: 'Teacher', MODERATOR: 'Moderator', USER: 'Member' };
export const roleLabel = (role) => ROLE_LABEL[role] || 'Member';
export const canTeach = (role) => role === 'TEACHER' || role === 'ADMIN';
