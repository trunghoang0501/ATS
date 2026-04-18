export type CandidateStatus = 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Hired' | 'Rejected';

export interface Candidate {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  yearsOfExperience: number;
  keySkills: string[];
  educationLevel: string;
  jobPosition: string;
  matchScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  status: CandidateStatus;
  createdAt: string;
  rawText?: string;
  uid: string;
}

export interface ExtractionResult {
  fullName: string;
  email: string;
  phone: string;
  yearsOfExperience: number;
  keySkills: string[];
  educationLevel: string;
  matchScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  jobPosition: string;
}
