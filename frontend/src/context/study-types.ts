import type { CaseData } from "@/data/mockData";

export type Screen = "landing" | "consent" | "welcome" | "interface-tutorial" | "baseline" | "pre-survey" | "tutorial" | "trial" | "block-break" | "bonus-offer" | "debrief" | "complete";
export type Language = "en" | "de";

export interface UserProfile {
  timeAvailable: number;
  experienceLevel: string;
  ageRange: string;
  sex: string;
  country: string;
  semester: string;
  specialty: string[];
  xrayExperience: string;
  xrayVolume: string;
  aiUsageGeneral: string;
  aiUsageMedicine: string;
  aiCurrentUse: string[];
  aiKnowledge: string;
  aiCdssExperience: string;
  aiAttitude: string;
  aiTraining: string;
  consented: boolean;
}

export interface CaseResponse {
  caseId: string;
  condition: string;
  category: string;
  groundTruth: string[];
  aiPredictions: { findingId: string; confidence: number }[];
  initialFindings: string[];
  initialConfidence: number;
  revisedFindings?: string[];
  revisedConfidence?: number;
  aiHelpful?: number;
  xaiHelpful?: "helped" | "neutral" | "misleading";
  xaiFaithful?: "yes" | "partially" | "no" | "unsure";
  xaiViewSelected?: "original" | "gradcam";
  xaiOverlayFinding?: string;
  changedMindSelfReport?: boolean;
  responseTimePreMs: number;
  responseTimePostMs?: number;
  biasBannerDismissed?: boolean;
  timeOnBannerMs?: number;
}

export interface BlockSurvey {
  block: number;
  condition: string;
  nasaMental: number;
  nasaTime: number;
  nasaFrustration: number;
  trustPulse: number;
}

export interface StudyState {
  screen: Screen;
  language: Language;
  sessionCode: string;
  userProfile: UserProfile | null;
  currentCaseIndex: number;
  currentBlock: number;
  phase: 1 | 2;
  responses: CaseResponse[];
  baselineResponses: CaseResponse[];
  baselineAccuracy: number;
  preTrustItems: number[];
  postTrustItems: number[];
  blockSurveys: BlockSurvey[];
  debriefData: { postTrustItems: number[]; comments: string } | null;
  activeCases: CaseData[];
  bonusCases: CaseData[];
  casesPerBlock: number;
  mainCaseCount?: number;
  sessionIndex: number;
  jianItemOrder: number[];
}

export interface StudyContextType extends StudyState {
  currentCase: CaseData | null;
  setScreen: (s: Screen) => void;
  setLanguage: (l: Language) => void;
  setUserProfile: (p: UserProfile) => void;
  setPhase: (p: 1 | 2) => void;
  addResponse: (r: CaseResponse) => void;
  addBaselineResponse: (r: CaseResponse) => void;
  setBaselineAccuracy: (a: number) => void;
  setPreTrustItems: (items: number[]) => void;
  addBlockSurvey: (s: BlockSurvey) => void;
  setDebriefData: (d: { postTrustItems: number[]; comments: string }) => void;
  nextCase: () => void;
  initializeCases: (timeBudget: number) => void;
  initializeBonusCases: () => void;
  generateSessionCode: (cohortPrefix?: string) => string;
  resumeSession: (code: string) => Promise<boolean>;
  totalCases: number;
  progress: number;
  t: (key: string) => string;
  baselineCases: CaseData[];
}
