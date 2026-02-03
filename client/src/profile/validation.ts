export interface NicknameValidationResult {
  ok: boolean;
  value: string;
  reason?: string;
}

const MIN_NICKNAME = 3;
const MAX_NICKNAME = 16;
const NICKNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export const validateNickname = (value: string): NicknameValidationResult => {
  const trimmed = value.trim();
  if (trimmed.length < MIN_NICKNAME) {
    return { ok: false, value: trimmed, reason: `Minimum ${MIN_NICKNAME} characters` };
  }
  if (trimmed.length > MAX_NICKNAME) {
    return { ok: false, value: trimmed, reason: `Maximum ${MAX_NICKNAME} characters` };
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return { ok: false, value: trimmed, reason: 'Use letters, numbers, space, _ or -' };
  }
  return { ok: true, value: trimmed };
};
