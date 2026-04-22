import type { CandidateStatus, ExtractionResult } from '../types';

function asStringList(v: unknown, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .slice(0, maxLen);
}

/**
 * Builds a Firestore-safe create payload. Rules require:
 * - `hasOnly` allowed keys (no extras from JSON)
 * - `phone` must be a string if present (Gemini often sends `null` → permission-denied)
 * - string lengths / rawText cap per rules
 */
export function buildCandidateCreatePayload(
  scan: ExtractionResult,
  uid: string,
  rawText: string,
  status: CandidateStatus = 'Applied'
) {
  const phone = scan.phone == null ? '' : String(scan.phone);
  const raw = rawText.length > 50000 ? rawText.slice(0, 50000) : rawText;

  let matchScore = Number(scan.matchScore);
  if (!Number.isFinite(matchScore)) matchScore = 0;
  matchScore = Math.max(0, Math.min(100, Math.round(matchScore)));

  let years = Number(scan.yearsOfExperience);
  if (!Number.isFinite(years)) years = 0;
  years = Math.max(0, years);

  return {
    fullName: String(scan.fullName ?? '').slice(0, 100),
    email: String(scan.email ?? '').trim(),
    phone,
    yearsOfExperience: years,
    keySkills: asStringList(scan.keySkills, 50),
    educationLevel: String(scan.educationLevel ?? ''),
    jobPosition: String(scan.jobPosition ?? ''),
    matchScore,
    summary: String(scan.summary ?? '').slice(0, 2000),
    strengths: asStringList(scan.strengths, 20),
    weaknesses: asStringList(scan.weaknesses, 20),
    status,
    createdAt: new Date().toISOString(),
    rawText: raw,
    uid,
  };
}
