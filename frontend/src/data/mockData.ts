export interface Finding {
  id: string;
  name: string;
  description: string;
}

export const FINDINGS: Finding[] = [
  { id: "cardiomegaly", name: "Cardiomegaly", description: "Enlarged heart silhouette" },
  { id: "edema", name: "Pulmonary Edema", description: "Fluid in the lungs" },
  { id: "consolidation", name: "Consolidation", description: "Dense opacity in lung tissue" },
  { id: "atelectasis", name: "Atelectasis", description: "Partial lung collapse" },
  { id: "pleural_effusion", name: "Pleural Effusion", description: "Fluid around the lungs" },
  { id: "pneumothorax", name: "Pneumothorax", description: "Air in the pleural space" },
];

export type StudyCondition = "A" | "B" | "C" | "D" | "E";
export type CaseCategory = "easy" | "hard" | "incidental" | "ai_wrong" | "baseline" | "attention_check";

export interface AIPrediction {
  findingId: string;
  confidence: number;
}

export interface CaseMetadata {
  age?: number;
  sex?: string;
  view?: "AP" | "PA";
}

export interface CaseOverlays {
  gradcam: Record<string, string>;
}

export interface CaseData {
  id: string;
  imageUrl: string;
  condition: StudyCondition;
  aiPredictions: AIPrediction[];
  biasWarning?: string;
  groundTruth: string[];
  primaryFindings: string[];
  incidentalFindings: string[];
  clinicalContext?: string;
  category: CaseCategory;
  metadata?: CaseMetadata;
  overlays?: CaseOverlays;
  isAttentionCheck?: boolean;
}

// ---------------------------------------------------------------------------
// Image registry: 21 real CheXpert images with Run 014 (6-label DenseNet121)
// overlays.  Ground truths come from the CheXpert CSV; AI predictions are the
// actual Run 014 sigmoid outputs rounded to integer percentages.
// See CASE_SELECTION.md for full rationale on each image choice.
// ---------------------------------------------------------------------------

const STUDY_FINDINGS = ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"] as const;

const makeOverlays = (prefix: string): CaseOverlays => ({
  gradcam: Object.fromEntries(STUDY_FINDINGS.map(f => [f, `/cases/${prefix}_gradcam_${f}.png`])),
});

const makePreds = (c: number, e: number, co: number, a: number, p: number, pn: number): AIPrediction[] => [
  { findingId: "cardiomegaly", confidence: c },
  { findingId: "edema", confidence: e },
  { findingId: "consolidation", confidence: co },
  { findingId: "atelectasis", confidence: a },
  { findingId: "pleural_effusion", confidence: p },
  { findingId: "pneumothorax", confidence: pn },
];

// Each image entry: URL, overlay prefix, real model predictions, CheXpert GT
const IMG = {
  // EASY images — single dominant finding
  p21795: {
    url: "/cases/patient21795_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient21795_study1_view1_frontal"),
    preds: makePreds(95, 60, 42, 40, 12, 7),   // GT: cardiomegaly
    gt: ["cardiomegaly"],
    meta: { age: 81, sex: "M", view: "AP" as const },
  },
  p37124: {
    url: "/cases/patient37124_study3_view1_frontal.jpg",
    overlays: makeOverlays("patient37124_study3_view1_frontal"),
    preds: makePreds(31, 95, 33, 49, 8, 3),     // GT: edema
    gt: ["edema"],
    meta: { age: 48, sex: "M", view: "AP" as const },
  },
  p00008: {
    url: "/cases/patient00008_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient00008_study1_view1_frontal"),
    preds: makePreds(11, 55, 72, 72, 91, 23),   // GT: pleural_effusion
    gt: ["pleural_effusion"],
    meta: { age: 81, sex: "M", view: "AP" as const },
  },
  p34852: {
    url: "/cases/patient34852_study3_view1_frontal.jpg",
    overlays: makeOverlays("patient34852_study3_view1_frontal"),
    preds: makePreds(54, 65, 83, 35, 56, 12),   // GT: consolidation
    gt: ["consolidation"],
    meta: { age: 72, sex: "M", view: "AP" as const },
  },

  // HARD images — multiple confirmed findings, no pneumothorax
  p59546: {
    url: "/cases/patient59546_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient59546_study1_view1_frontal"),
    preds: makePreds(72, 89, 78, 80, 81, 3),
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 67, sex: "M", view: "AP" as const },
  },
  p31804: {
    url: "/cases/patient31804_study3_view1_frontal.jpg",
    overlays: makeOverlays("patient31804_study3_view1_frontal"),
    preds: makePreds(95, 89, 53, 62, 82, 4),
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 78, sex: "F", view: "AP" as const },
  },
  p38933: {
    url: "/cases/patient38933_study4_view1_frontal.jpg",
    overlays: makeOverlays("patient38933_study4_view1_frontal"),
    preds: makePreds(96, 92, 64, 56, 86, 1),
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 68, sex: "F", view: "AP" as const },
  },

  // INCIDENTAL images — pneumothorax present alongside other findings
  p05319: {
    url: "/cases/patient05319_study6_view1_frontal.jpg",
    overlays: makeOverlays("patient05319_study6_view1_frontal"),
    preds: makePreds(24, 30, 62, 45, 65, 99),
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 61, sex: "M", view: "AP" as const },
  },
  p36698: {
    url: "/cases/patient36698_study5_view1_frontal.jpg",
    overlays: makeOverlays("patient36698_study5_view1_frontal"),
    preds: makePreds(70, 92, 48, 56, 93, 57),
    gt: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 44, sex: "F", view: "AP" as const },
  },
  p49165: {
    url: "/cases/patient49165_study2_view1_frontal.jpg",
    overlays: makeOverlays("patient49165_study2_view1_frontal"),
    preds: makePreds(44, 54, 48, 52, 35, 94),
    gt: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 35, sex: "F", view: "AP" as const },
  },
  p48367: {
    url: "/cases/patient48367_study3_view1_frontal.jpg",
    overlays: makeOverlays("patient48367_study3_view1_frontal"),
    preds: makePreds(33, 70, 55, 54, 73, 59),
    gt: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 57, sex: "M", view: "AP" as const },
  },

  // NORMAL images — no findings (for baseline & AI-wrong)
  p00001: {
    url: "/cases/patient00001_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient00001_study1_view1_frontal"),
    preds: makePreds(20, 23, 43, 59, 13, 52),   // notable FPs: atelectasis 59%, PTX 52%
    gt: [] as string[],
    meta: { age: 68, sex: "F", view: "AP" as const },
  },
  p00004: {
    url: "/cases/patient00004_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient00004_study1_view1_frontal"),
    preds: makePreds(4, 2, 14, 5, 4, 31),       // mild ptx FP
    gt: [] as string[],
    meta: { age: 20, sex: "F", view: "PA" as const },
  },

  // ---- 8 NEW IMAGES (added for FIXED_15 / FIXED_20 support) ----
  // See CASE_SELECTION.md for full selection rationale.

  // Easy
  p32710: {
    url: "/cases/patient32710_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient32710_study1_view1_frontal"),
    preds: makePreds(27, 72, 13, 12, 2, 1),     // GT: edema — cleanest easy case
    gt: ["edema"],
    meta: { age: 79, sex: "F", view: "AP" as const },
  },

  // Hard — new images
  p25296: {
    url: "/cases/patient25296_study3_view1_frontal.jpg",
    overlays: makeOverlays("patient25296_study3_view1_frontal"),
    preds: makePreds(91, 83, 57, 48, 95, 2),    // GT: all 5; atel MISS at 48%
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 71, sex: "M", view: "AP" as const },
  },
  p04050: {
    url: "/cases/patient04050_study29_view1_frontal.jpg",
    overlays: makeOverlays("patient04050_study29_view1_frontal"),
    preds: makePreds(92, 56, 54, 60, 68, 16),   // GT: all 5; moderate across the board
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 25, sex: "M", view: "AP" as const },
  },
  p28936: {
    url: "/cases/patient28936_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient28936_study1_view1_frontal"),
    preds: makePreds(72, 86, 67, 54, 94, 4),    // GT: all 5; effusion very high (94%)
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 53, sex: "F", view: "AP" as const },
  },
  p05067: {
    url: "/cases/patient05067_study3_view1_frontal.jpg",
    overlays: makeOverlays("patient05067_study3_view1_frontal"),
    preds: makePreds(93, 90, 60, 48, 54, 2),    // GT: all 5; atel MISS at 48%, effusion borderline
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 57, sex: "M", view: "AP" as const },
  },

  // Incidental — new images
  p49165s1: {
    url: "/cases/patient49165_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient49165_study1_view1_frontal"),
    preds: makePreds(37, 62, 45, 50, 58, 66),   // GT: all 5 + ptx; ptx 66% moderate detection
    gt: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 35, sex: "F", view: "AP" as const },
  },
  p37577: {
    url: "/cases/patient37577_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient37577_study1_view1_frontal"),
    preds: makePreds(87, 44, 65, 67, 82, 24),   // GT: all 5 + ptx; ptx MISS at 24%
    gt: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 33, sex: "M", view: "AP" as const },
  },

  // AI-wrong — clean true negative
  p00005s1: {
    url: "/cases/patient00005_study1_view1_frontal.jpg",
    overlays: makeOverlays("patient00005_study1_view1_frontal"),
    preds: makePreds(7, 2, 23, 13, 9, 17),      // GT: normal; all low (≤23%)
    gt: [] as string[],
    meta: { age: 33, sex: "M", view: "PA" as const },
  },

  // ---- BONUS ROUND IMAGES (5 new patients, no overlap with main study) ----

  // Easy — cardiomegaly
  p25997: {
    url: "/cases/patient25997_study4_view1_frontal.jpg",
    overlays: makeOverlays("patient25997_study4_view1_frontal"),
    preds: makePreds(87, 49, 10, 25, 5, 17),    // GT: cardiomegaly; clean easy case
    gt: ["cardiomegaly"],
    meta: { age: 55, sex: "M", view: "AP" as const },
  },
  // Hard — all 5 findings, model mostly correct
  p10140: {
    url: "/cases/patient10140_study35_view1_frontal.jpg",
    overlays: makeOverlays("patient10140_study35_view1_frontal"),
    preds: makePreds(93, 76, 59, 65, 60, 3),    // GT: all 5; all detected
    gt: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    meta: { age: 71, sex: "F", view: "AP" as const },
  },
  // Incidental — ptx strongly flagged by AI (99%)
  p15482: {
    url: "/cases/patient15482_study42_view1_frontal.jpg",
    overlays: makeOverlays("patient15482_study42_view1_frontal"),
    preds: makePreds(52, 16, 37, 62, 53, 99),   // GT: cMeg+edema+atel+eff+ptx; ptx 99%
    gt: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 61, sex: "F", view: "AP" as const },
  },
  // AI-wrong — normal with effusion FP (88%)
  p00023: {
    url: "/cases/patient00023_study5_view1_frontal.jpg",
    overlays: makeOverlays("patient00023_study5_view1_frontal"),
    preds: makePreds(4, 5, 9, 10, 88, 11),      // GT: normal; effusion 88% FP
    gt: [] as string[],
    meta: { age: 63, sex: "M", view: "PA" as const },
  },
  // Incidental — ptx moderately detected (69%)
  p41170: {
    url: "/cases/patient41170_study2_view1_frontal.jpg",
    overlays: makeOverlays("patient41170_study2_view1_frontal"),
    preds: makePreds(2, 54, 57, 71, 55, 69),    // GT: edema+consol+atel+eff+ptx; no cMeg
    gt: ["edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"],
    meta: { age: 80, sex: "M", view: "AP" as const },
  },
};

// ---------------------------------------------------------------------------
// Attention check: obvious cardiomegaly with very high AI confidence
// Uses patient21795 (GT: cardiomegaly, model: 95%)
// ---------------------------------------------------------------------------
export const ATTENTION_CHECK_CASE: CaseData = {
  id: "attention-check-01",
  imageUrl: IMG.p21795.url,
  overlays: IMG.p21795.overlays,
  condition: "B",
  category: "attention_check",
  isAttentionCheck: true,
  aiPredictions: IMG.p21795.preds,
  groundTruth: ["cardiomegaly"],
  primaryFindings: ["cardiomegaly"],
  incidentalFindings: [],
  clinicalContext: "context.attention",
  metadata: IMG.p21795.meta,
};

// ---------------------------------------------------------------------------
// 4 baseline cases — no AI, one per pathology pattern
// ---------------------------------------------------------------------------
export const BASELINE_CASES: CaseData[] = [
  {
    id: "baseline-01",
    imageUrl: IMG.p21795.url,
    condition: "A", category: "baseline",
    aiPredictions: [],
    groundTruth: ["cardiomegaly"],
    primaryFindings: ["cardiomegaly"], incidentalFindings: [],
    clinicalContext: "context.baseline01",
    metadata: IMG.p21795.meta,
  },
  {
    id: "baseline-02",
    imageUrl: IMG.p37124.url,
    condition: "A", category: "baseline",
    aiPredictions: [],
    groundTruth: ["edema"],
    primaryFindings: ["edema"], incidentalFindings: [],
    clinicalContext: "context.baseline02",
    metadata: IMG.p37124.meta,
  },
  {
    id: "baseline-03",
    imageUrl: IMG.p00008.url,
    condition: "A", category: "baseline",
    aiPredictions: [],
    groundTruth: ["pleural_effusion"],
    primaryFindings: ["pleural_effusion"], incidentalFindings: [],
    clinicalContext: "context.baseline03",
    metadata: IMG.p00008.meta,
  },
  {
    id: "baseline-04",
    imageUrl: IMG.p00004.url,
    condition: "A", category: "baseline",
    aiPredictions: [],
    groundTruth: [],
    primaryFindings: [], incidentalFindings: [],
    clinicalContext: "context.baseline04",
    metadata: IMG.p00004.meta,
  },
];

// ---------------------------------------------------------------------------
// 24 main study cases
//
// Design principles:
// - groundTruth always matches actual CheXpert labels for the image
// - aiPredictions are the real Run 014 model outputs (fixed per image)
// - clinicalContext determines which GT findings are "primary" vs "incidental"
// - Each image may appear 2-3x with different clinical contexts
// ---------------------------------------------------------------------------
export const CASE_POOL: CaseData[] = [
  // =====================================================================
  // EASY (4): single dominant finding, AI correctly identifies it
  // =====================================================================
  {
    id: "case-01",
    imageUrl: IMG.p21795.url, overlays: IMG.p21795.overlays,
    condition: "A", category: "easy",
    aiPredictions: IMG.p21795.preds,
    groundTruth: ["cardiomegaly"],
    primaryFindings: ["cardiomegaly"], incidentalFindings: [],
    clinicalContext: "context.case01",
    metadata: IMG.p21795.meta,
  },
  {
    id: "case-02",
    imageUrl: IMG.p37124.url, overlays: IMG.p37124.overlays,
    condition: "A", category: "easy",
    aiPredictions: IMG.p37124.preds,
    groundTruth: ["edema"],
    primaryFindings: ["edema"], incidentalFindings: [],
    clinicalContext: "context.case02",
    metadata: IMG.p37124.meta,
  },
  {
    id: "case-03",
    imageUrl: IMG.p00008.url, overlays: IMG.p00008.overlays,
    condition: "B", category: "easy",
    aiPredictions: IMG.p00008.preds,
    groundTruth: ["pleural_effusion"],
    primaryFindings: ["pleural_effusion"], incidentalFindings: [],
    clinicalContext: "context.case03",
    metadata: IMG.p00008.meta,
  },
  {
    id: "case-04",
    imageUrl: IMG.p34852.url, overlays: IMG.p34852.overlays,
    condition: "B", category: "easy",
    aiPredictions: IMG.p34852.preds,
    groundTruth: ["consolidation"],
    primaryFindings: ["consolidation"], incidentalFindings: [],
    clinicalContext: "context.case04",
    metadata: IMG.p34852.meta,
  },

  // =====================================================================
  // HARD (8): multiple findings, model partially correct
  // Clinical context determines primary vs incidental among real findings
  // =====================================================================
  {
    id: "case-05",
    imageUrl: IMG.p59546.url, overlays: IMG.p59546.overlays,
    condition: "A", category: "hard",
    aiPredictions: IMG.p59546.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    primaryFindings: ["edema", "pleural_effusion"], incidentalFindings: ["cardiomegaly", "consolidation", "atelectasis"],
    clinicalContext: "context.case05",
    metadata: IMG.p59546.meta,
  },
  {
    id: "case-06",
    imageUrl: IMG.p59546.url, overlays: IMG.p59546.overlays,
    condition: "E", category: "hard",
    aiPredictions: IMG.p59546.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    primaryFindings: ["consolidation"], incidentalFindings: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion"],
    clinicalContext: "context.case06",
    metadata: IMG.p59546.meta,
  },
  {
    id: "case-07",
    imageUrl: IMG.p31804.url, overlays: IMG.p31804.overlays,
    condition: "B", category: "hard",
    aiPredictions: IMG.p31804.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    primaryFindings: ["cardiomegaly", "edema", "pleural_effusion"], incidentalFindings: ["consolidation", "atelectasis"],
    clinicalContext: "context.case07",
    metadata: IMG.p31804.meta,
  },
  {
    id: "case-08",
    imageUrl: IMG.p31804.url, overlays: IMG.p31804.overlays,
    condition: "C", category: "hard",
    aiPredictions: IMG.p31804.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    primaryFindings: ["consolidation", "atelectasis"], incidentalFindings: ["cardiomegaly", "edema", "pleural_effusion"],
    clinicalContext: "context.case08",
    metadata: IMG.p31804.meta,
  },
  {
    id: "case-09",
    imageUrl: IMG.p38933.url, overlays: IMG.p38933.overlays,
    condition: "C", category: "hard",
    aiPredictions: IMG.p38933.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    primaryFindings: ["cardiomegaly", "pleural_effusion"], incidentalFindings: ["edema", "consolidation", "atelectasis"],
    clinicalContext: "context.case09",
    metadata: IMG.p38933.meta,
  },
  {
    id: "case-10",
    imageUrl: IMG.p38933.url, overlays: IMG.p38933.overlays,
    condition: "D", category: "hard",
    aiPredictions: IMG.p38933.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion"],
    primaryFindings: ["edema", "consolidation"], incidentalFindings: ["cardiomegaly", "atelectasis", "pleural_effusion"],
    clinicalContext: "context.case10",
    metadata: IMG.p38933.meta,
    biasWarning: "\u26A0 AP (bedside) image \u00B7 Patient age: 68 \u00B7 Bedside imaging may reduce diagnostic quality",
  },
  {
    id: "case-11",
    imageUrl: IMG.p34852.url, overlays: IMG.p34852.overlays,
    condition: "D", category: "hard",
    aiPredictions: IMG.p34852.preds,
    groundTruth: ["consolidation"],
    primaryFindings: ["consolidation"], incidentalFindings: [],
    clinicalContext: "context.case11",
    metadata: IMG.p34852.meta,
    biasWarning: "\u26A0 AP image \u00B7 Patient age: 72 \u00B7 Model performance is ~8% lower for elderly bedside patients",
  },
  {
    id: "case-12",
    imageUrl: IMG.p00008.url, overlays: IMG.p00008.overlays,
    condition: "E", category: "hard",
    aiPredictions: IMG.p00008.preds,
    groundTruth: ["pleural_effusion"],
    primaryFindings: ["pleural_effusion"], incidentalFindings: [],
    clinicalContext: "context.case12",
    metadata: IMG.p00008.meta,
  },

  // =====================================================================
  // INCIDENTAL (8): pneumothorax present but clinical context points
  // to a different primary complaint. The key thesis question: does AI
  // help participants detect the incidental pneumothorax?
  // =====================================================================
  {
    id: "case-13",
    imageUrl: IMG.p05319.url, overlays: IMG.p05319.overlays,
    condition: "A", category: "incidental",
    aiPredictions: IMG.p05319.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["consolidation", "pleural_effusion"], incidentalFindings: ["pneumothorax", "cardiomegaly", "edema", "atelectasis"],
    clinicalContext: "context.case13",
    metadata: IMG.p05319.meta,
  },
  {
    id: "case-14",
    imageUrl: IMG.p05319.url, overlays: IMG.p05319.overlays,
    condition: "C", category: "incidental",
    aiPredictions: IMG.p05319.preds,
    groundTruth: ["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["edema", "cardiomegaly"], incidentalFindings: ["pneumothorax", "consolidation", "atelectasis", "pleural_effusion"],
    clinicalContext: "context.case14",
    metadata: IMG.p05319.meta,
  },
  {
    id: "case-15",
    imageUrl: IMG.p36698.url, overlays: IMG.p36698.overlays,
    condition: "B", category: "incidental",
    aiPredictions: IMG.p36698.preds,
    groundTruth: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["edema", "pleural_effusion"], incidentalFindings: ["pneumothorax", "cardiomegaly", "atelectasis"],
    clinicalContext: "context.case15",
    metadata: IMG.p36698.meta,
  },
  {
    id: "case-16",
    imageUrl: IMG.p36698.url, overlays: IMG.p36698.overlays,
    condition: "D", category: "incidental",
    aiPredictions: IMG.p36698.preds,
    groundTruth: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["atelectasis", "cardiomegaly"], incidentalFindings: ["pneumothorax", "edema", "pleural_effusion"],
    clinicalContext: "context.case16",
    metadata: IMG.p36698.meta,
    biasWarning: "\u26A0 AP (bedside) image \u00B7 Post-surgical patient \u00B7 Positioning may affect cardiac silhouette assessment",
  },
  {
    id: "case-17",
    imageUrl: IMG.p49165.url, overlays: IMG.p49165.overlays,
    condition: "C", category: "incidental",
    aiPredictions: IMG.p49165.preds,
    groundTruth: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["edema", "pleural_effusion"], incidentalFindings: ["pneumothorax", "cardiomegaly", "atelectasis"],
    clinicalContext: "context.case17",
    metadata: IMG.p49165.meta,
  },
  {
    id: "case-18",
    imageUrl: IMG.p49165.url, overlays: IMG.p49165.overlays,
    condition: "E", category: "incidental",
    aiPredictions: IMG.p49165.preds,
    groundTruth: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["cardiomegaly"], incidentalFindings: ["pneumothorax", "edema", "atelectasis", "pleural_effusion"],
    clinicalContext: "context.case18",
    metadata: IMG.p49165.meta,
  },
  {
    id: "case-19",
    imageUrl: IMG.p48367.url, overlays: IMG.p48367.overlays,
    condition: "D", category: "incidental",
    aiPredictions: IMG.p48367.preds,
    groundTruth: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["edema", "pleural_effusion"], incidentalFindings: ["pneumothorax", "cardiomegaly", "atelectasis"],
    clinicalContext: "context.case19",
    metadata: IMG.p48367.meta,
    biasWarning: "\u26A0 AP (bedside) image \u00B7 ICU patient \u00B7 Model confidence may be affected by support devices",
  },
  {
    id: "case-20",
    imageUrl: IMG.p48367.url, overlays: IMG.p48367.overlays,
    condition: "B", category: "incidental",
    aiPredictions: IMG.p48367.preds,
    groundTruth: ["cardiomegaly", "edema", "atelectasis", "pleural_effusion", "pneumothorax"],
    primaryFindings: ["atelectasis"], incidentalFindings: ["pneumothorax", "cardiomegaly", "edema", "pleural_effusion"],
    clinicalContext: "context.case20",
    metadata: IMG.p48367.meta,
  },

  // =====================================================================
  // AI-WRONG (4): model has significant false positives or misses.
  // These test whether participants can override incorrect AI suggestions.
  // =====================================================================
  {
    id: "case-21",
    imageUrl: IMG.p00001.url, overlays: IMG.p00001.overlays,
    condition: "B", category: "ai_wrong",
    aiPredictions: IMG.p00001.preds, // FPs: atelectasis 59%, pneumothorax 52%
    groundTruth: [],
    primaryFindings: [], incidentalFindings: [],
    clinicalContext: "context.case21",
    metadata: IMG.p00001.meta,
  },
  {
    id: "case-22",
    imageUrl: IMG.p00001.url, overlays: IMG.p00001.overlays,
    condition: "C", category: "ai_wrong",
    aiPredictions: IMG.p00001.preds, // FPs: atelectasis 59%, pneumothorax 52%
    groundTruth: [],
    primaryFindings: [], incidentalFindings: [],
    clinicalContext: "context.case22",
    metadata: IMG.p00001.meta,
  },
  {
    id: "case-23",
    imageUrl: IMG.p00004.url, overlays: IMG.p00004.overlays,
    condition: "D", category: "ai_wrong",
    aiPredictions: IMG.p00004.preds, // all low but not zero
    groundTruth: [],
    primaryFindings: [], incidentalFindings: [],
    clinicalContext: "context.case23",
    metadata: IMG.p00004.meta,
    biasWarning: "\u26A0 PA image \u00B7 Young patient (20F) \u00B7 AI may produce false positives on normal anatomy",
  },
  {
    id: "case-24",
    imageUrl: IMG.p00004.url, overlays: IMG.p00004.overlays,
    condition: "E", category: "ai_wrong",
    aiPredictions: IMG.p00004.preds,
    groundTruth: [],
    primaryFindings: [], incidentalFindings: [],
    clinicalContext: "context.case24",
    metadata: IMG.p00004.meta,
  },
];

// ---------------------------------------------------------------------------
// Latin-square condition orderings — V2: 4 conditions × 4 rows (A, B, C, E)
// A = AI shown immediately (single phase)
// B = Phase 1 (unassisted) → Phase 2 (AI predictions, revise)
// C = Phase 1 → Phase 2 (AI predictions + heatmaps + bias warnings)
// E = Phase 1 → Phase 2 (heatmaps only)
// ---------------------------------------------------------------------------
export const LATIN_SQUARES: StudyCondition[][] = [
  ["A", "B", "C", "E"],
  ["B", "C", "E", "A"],
  ["C", "E", "A", "B"],
  ["E", "A", "B", "C"],
];

// Legacy 5-condition Latin square — used only when resuming old sessions.
export const LATIN_SQUARES_V1: StudyCondition[][] = [
  ["A", "B", "C", "D", "E"],
  ["B", "C", "D", "E", "A"],
  ["C", "D", "E", "A", "B"],
  ["D", "E", "A", "B", "C"],
  ["E", "A", "B", "C", "D"],
];

// ---------------------------------------------------------------------------
// Fixed case sets — every participant sees the SAME images.
// The Latin square only rotates which condition each block gets.
// Longer time options extend the base set (FIXED_15 ⊃ FIXED_10, etc.).
//
// FIXED_10  — 2 cases per condition (Quick option)
// FIXED_15  — 3 cases per condition (Standard option)
// FIXED_20  — 4 cases per condition (Full option)
//
// Category balance (FIXED_20): 4 easy · 7 hard · 6 incidental · 3 ai_wrong
// See CASE_SELECTION.md for full selection rationale.
// ---------------------------------------------------------------------------

const mk = (
  id: string, img: typeof IMG[keyof typeof IMG],
  category: string, gt: string[], primary: string[], incidental: string[],
  ctx: string, bias?: string
): CaseData => ({
  id, imageUrl: img.url, overlays: img.overlays,
  condition: "A", // overwritten by generateCaseOrder
  category,
  aiPredictions: img.preds,
  groundTruth: gt,
  primaryFindings: primary,
  incidentalFindings: incidental,
  clinicalContext: ctx,
  metadata: img.meta,
  ...(bias ? { biasWarning: bias } : {}),
});

// FIXED_10 — 10 cases across 3 blocks (~3-4 per block)
const FIXED_10: CaseData[] = [
  // Block 1 — easy + hard (4 cases)
  mk("fx-01", IMG.p37124, "easy", ["edema"],             ["edema"], [],                          "context.case02"),
  mk("fx-02", IMG.p00008, "easy", ["pleural_effusion"],  ["pleural_effusion"], [],               "context.case03",
     "⚠ AP image · Elderly patient (81M) · AP positioning may overestimate cardiac silhouette; model calibration for patients 80+ may be reduced"),
  mk("fx-03", IMG.p59546, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["edema","pleural_effusion"], ["cardiomegaly","consolidation","atelectasis"],        "context.case05"),
  // Block 2 — hard + incidental (3 cases)
  mk("fx-04", IMG.p31804, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["cardiomegaly","edema","pleural_effusion"], ["consolidation","atelectasis"],        "context.case07",
     "⚠ AP (bedside) image · Elderly female patient (78F) · Cardiac size thresholds differ by sex; AP imaging reduces diagnostic quality compared to PA"),
  mk("fx-05", IMG.p05319, "incidental",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion","pneumothorax"],
     ["consolidation","pleural_effusion"], ["pneumothorax","cardiomegaly","edema","atelectasis"], "context.case13"),
  mk("fx-06", IMG.p36698, "incidental",
     ["cardiomegaly","edema","atelectasis","pleural_effusion","pneumothorax"],
     ["edema","pleural_effusion"], ["pneumothorax","cardiomegaly","atelectasis"],         "context.case15",
     "⚠ AP image · Female patient (44F) · Pneumothorax is harder to detect on supine AP images; AI confidence for pneumothorax may be lower than on PA images"),
  // Block 3 — easy + hard + ai-wrong (4 cases)
  mk("fx-07", IMG.p34852, "easy", ["consolidation"], ["consolidation"], [],              "context.case04"),
  mk("fx-08", IMG.p38933, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["cardiomegaly","pleural_effusion"], ["edema","consolidation","atelectasis"],        "context.case09",
     "⚠ AP (bedside) image · Patient age: 68 · Bedside imaging may reduce diagnostic quality"),
  mk("fx-09", IMG.p00001, "ai_wrong", [], [], [],                                        "context.case21"),
  mk("fx-10", IMG.p00004, "ai_wrong", [], [], [],                                        "context.case23",
     "⚠ PA image · Young patient (20F) · AI may produce false positives on normal anatomy"),
];

// FIXED_15 — extends FIXED_10 with 5 more cases (positions 11–15)
const FIXED_15: CaseData[] = [
  ...FIXED_10,
  // Block 1 extension — incidental (AI strong)
  mk("fx-11", IMG.p49165, "incidental",
     ["cardiomegaly","edema","atelectasis","pleural_effusion","pneumothorax"],
     ["edema","pleural_effusion"], ["pneumothorax","cardiomegaly","atelectasis"],         "context.case17"),
  // Block 2 extension — incidental (AI moderate)
  mk("fx-12", IMG.p48367, "incidental",
     ["cardiomegaly","edema","atelectasis","pleural_effusion","pneumothorax"],
     ["edema","pleural_effusion"], ["pneumothorax","cardiomegaly","atelectasis"],         "context.case19",
     "⚠ AP (bedside) image · ICU patient · Model confidence may be affected by support devices"),
  // Block 3 extension — easy (new image)
  mk("fx-13", IMG.p32710, "easy", ["edema"], ["edema"], [],                              "context.fx13"),
  // Block 4 extension — hard (new image, atelectasis miss)
  mk("fx-14", IMG.p25296, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["cardiomegaly","edema"], ["consolidation","atelectasis","pleural_effusion"],        "context.fx14"),
  // Block 5 extension — incidental (new image, AI moderate detection)
  mk("fx-15", IMG.p49165s1, "incidental",
     ["cardiomegaly","edema","atelectasis","pleural_effusion","pneumothorax"],
     ["edema","cardiomegaly"], ["pneumothorax","atelectasis","pleural_effusion"],         "context.fx15"),
];

// FIXED_20 — extends FIXED_15 with 5 more cases (positions 16–20)
const FIXED_20: CaseData[] = [
  ...FIXED_15,
  // Block 1 extension — hard (young patient)
  mk("fx-16", IMG.p04050, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["edema","pleural_effusion"], ["cardiomegaly","consolidation","atelectasis"],        "context.fx16"),
  // Block 2 extension — hard
  mk("fx-17", IMG.p28936, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["cardiomegaly","edema","pleural_effusion"], ["consolidation","atelectasis"],        "context.fx17"),
  // Block 3 extension — hard (atelectasis miss, borderline effusion)
  mk("fx-18", IMG.p05067, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["cardiomegaly","edema"], ["consolidation","atelectasis","pleural_effusion"],        "context.fx18"),
  // Block 4 extension — incidental (AI MISSES pneumothorax — key contrast case)
  mk("fx-19", IMG.p37577, "incidental",
     ["cardiomegaly","edema","atelectasis","pleural_effusion","pneumothorax"],
     ["cardiomegaly","pleural_effusion"], ["pneumothorax","edema","atelectasis"],         "context.fx19"),
  // Block 5 extension — AI-wrong clean true negative
  mk("fx-20", IMG.p00005s1, "ai_wrong", [], [], [],                                      "context.fx20"),
];

// ---------------------------------------------------------------------------
// BONUS_POOL — 5 fixed cases using NEW patients (no overlap with main study).
// Each case has a fixed condition assignment (A–E). The order is shuffled
// per session via generateBonusOrder().
// ---------------------------------------------------------------------------
export const BONUS_POOL: CaseData[] = [
  // Condition B (AI predictions) — easy cardiomegaly
  mk("bonus-01", IMG.p25997, "easy",
     ["cardiomegaly"], ["cardiomegaly"], [],
     "context.bonus01"),
  // Condition C (AI + heatmaps + bias) — hard multi-finding
  mk("bonus-02", IMG.p10140, "hard",
     ["cardiomegaly","edema","consolidation","atelectasis","pleural_effusion"],
     ["cardiomegaly","edema"], ["consolidation","atelectasis","pleural_effusion"],
     "context.bonus02"),
  // Condition E (heatmaps only) — incidental ptx, AI strongly flags
  mk("bonus-03", IMG.p15482, "incidental",
     ["cardiomegaly","edema","atelectasis","pleural_effusion","pneumothorax"],
     ["atelectasis","pleural_effusion"], ["pneumothorax","cardiomegaly","edema"],
     "context.bonus03"),
  // Condition B — AI-wrong, effusion FP
  mk("bonus-04", IMG.p00023, "ai_wrong", [], [], [],
     "context.bonus04",
     "\u26A0 PA image \u00B7 Male, 63 \u00B7 AI may produce false positives for pleural effusion on this projection"),
  // Condition C (AI + heatmaps + bias) — incidental ptx, moderate AI detection
  mk("bonus-05", IMG.p41170, "incidental",
     ["edema","consolidation","atelectasis","pleural_effusion","pneumothorax"],
     ["edema","consolidation"], ["pneumothorax","atelectasis","pleural_effusion"],
     "context.bonus05"),
];

// Assign conditions A, B, C, E to the 5 bonus cases (cycling).
function applyBonusConditions(cases: CaseData[]): CaseData[] {
  const conditions: StudyCondition[] = ["A", "B", "C", "E", "A"];
  return cases.map((c, i) => ({ ...c, condition: conditions[i] }));
}

// Generate bonus case order: same 5 cases for everyone, shuffled per session.
export function generateBonusOrder(sessionCode: string): CaseData[] {
  const withConditions = applyBonusConditions([...BONUS_POOL]);
  // Seeded shuffle so the order is deterministic per session but varies across sessions
  let hash = 0;
  for (let i = 0; i < sessionCode.length; i++) {
    hash = ((hash << 5) - hash + sessionCode.charCodeAt(i)) | 0;
  }
  const result = [...withConditions];
  for (let i = result.length - 1; i > 0; i--) {
    hash = ((hash << 5) - hash + i) | 0;
    const j = Math.abs(hash) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// generateCaseOrder — fixed-set Latin-square assignment.
// All participants see the same images; only the condition per block rotates.
// Block boundaries: positions [0, k), [k, 2k), ... where k = nCases/4.
// ---------------------------------------------------------------------------
export function generateCaseOrder(sessionIndex: number, nCases: number): CaseData[] {
  const conditionOrder = LATIN_SQUARES[sessionIndex % 4];
  const pool = nCases <= 10 ? FIXED_10 : nCases <= 15 ? FIXED_15 : FIXED_20;
  const casesPerBlock = Math.floor(pool.length / 4);

  return pool.map((c, i) => ({
    ...c,
    condition: conditionOrder[Math.min(Math.floor(i / casesPerBlock), 3)],
  }));
}

// Legacy generator for old sessions that used the 5-condition design.
export function generateCaseOrderV1(sessionIndex: number, nCases: number): CaseData[] {
  const conditionOrder = LATIN_SQUARES_V1[sessionIndex % 5];
  const pool = nCases <= 10 ? FIXED_10 : nCases <= 15 ? FIXED_15 : FIXED_20;
  const casesPerBlock = Math.floor(pool.length / 5);

  return pool.map((c, i) => ({
    ...c,
    condition: conditionOrder[Math.floor(i / casesPerBlock)],
  }));
}

// Number of condition blocks (= number of Latin-square conditions).
export const TOTAL_BLOCKS = 4;
// Legacy block count for old sessions.
export const TOTAL_BLOCKS_V1 = 5;
