import { Timestamp } from 'firebase/firestore';
import type { Candidate, CandidateStatus, ExtractionResult } from '../types';

const STATUSES: CandidateStatus[] = [
  'Applied',
  'Screening',
  'Interview',
  'Offer',
  'Hired',
  'Rejected',
];

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

function createdAtToIso(v: unknown): string {
  if (typeof v === 'string' && v.length > 0) return v;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return new Date(0).toISOString();
}

function asCandidateStatus(v: unknown): CandidateStatus {
  return STATUSES.includes(v as CandidateStatus) ? (v as CandidateStatus) : 'Applied';
}

/** Maps Firestore documents to `Candidate` so UI filters never crash on missing/shape drift. */
export function normalizeCandidateFromFirestore(id: string, raw: Record<string, unknown>): Candidate {
  let matchScore = Number(raw.matchScore);
  if (!Number.isFinite(matchScore)) matchScore = 0;
  let years = Number(raw.yearsOfExperience);
  if (!Number.isFinite(years)) years = 0;

  return {
    id,
    fullName: String(raw.fullName ?? ''),
    email: String(raw.email ?? ''),
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    yearsOfExperience: Math.max(0, years),
    keySkills: asStringList(raw.keySkills, 50),
    educationLevel: String(raw.educationLevel ?? ''),
    jobPosition: String(raw.jobPosition ?? ''),
    matchScore: Math.max(0, Math.min(100, Math.round(matchScore))),
    summary: String(raw.summary ?? ''),
    strengths: asStringList(raw.strengths, 20),
    weaknesses: asStringList(raw.weaknesses, 20),
    status: asCandidateStatus(raw.status),
    createdAt: createdAtToIso(raw.createdAt),
    rawText: typeof raw.rawText === 'string' ? raw.rawText : undefined,
    uid: String(raw.uid ?? ''),
  };
}
