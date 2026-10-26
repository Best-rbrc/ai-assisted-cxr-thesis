import { useState, useMemo } from "react";
import { X, ChevronDown, ChevronUp, Info } from "lucide-react";
import { FINDINGS, type CaseData } from "@/data/mockData";
import type { AdminData, RawTrial } from "./useAdminData";
import { trialAccuracy } from "./useAdminData";

// ---------------------------------------------------------------------------
// Clinical context translations (English)
// ---------------------------------------------------------------------------
const CLINICAL_CONTEXT: Record<string, string> = {
  "context.attention": "81M, routine pre-operative cardiac evaluation",
  "context.baseline01": "81M, progressive dyspnoea on exertion, known cardiac history",
  "context.baseline02": "48M, acute shortness of breath, bilateral crackles",
  "context.baseline03": "81M, worsening breathlessness, dull right base on percussion",
  "context.baseline04": "20F, routine pre-employment chest X-ray, no symptoms",
  "context.case01": "81M, follow-up for known dilated cardiomyopathy",
  "context.case02": "48M, acute dyspnoea, bilateral crackles on auscultation",
  "context.case03": "81M, right-sided pleuritic chest pain, reduced breath sounds at base",
  "context.case04": "72M, high fever and productive cough for 5 days, suspected pneumonia",
  "context.case05": "67M, acute decompensated heart failure, worsening orthopnoea",
  "context.case06": "67M, high fever, rigors, productive cough for 4 days",
  "context.case07": "78F, progressive dyspnoea, known congestive heart failure, bilateral leg oedema",
  "context.case08": "78F, post-operative day 3, fever and oxygen desaturation",
  "context.case09": "68F, worsening leg oedema, known valvular heart disease",
  "context.case10": "68F, acute respiratory distress, suspected aspiration event",
  "context.case11": "72M, worsening cough, haemoptysis, weight loss over 3 months",
  "context.case12": "81M, increasing breathlessness over 2 weeks, known malignancy",
  "context.case13": "61M, high fever, worsening cough, suspected hospital-acquired pneumonia",
  "context.case14": "61M, acute decompensated heart failure, transferred from cardiology ward",
  "context.case15": "44F, acute heart failure exacerbation, worsening dyspnoea over 2 days",
  "context.case16": "44F, post-operative day 1 after abdominal surgery, reduced breath sounds on left",
  "context.case17": "35F, acute respiratory distress, bilateral crackles, SpO2 88%",
  "context.case18": "35F, routine cardiac follow-up for peripartum cardiomyopathy",
  "context.case19": "57M, acute pulmonary oedema, transferred from ICU",
  "context.case20": "57M, post-intubation check, reduced breath sounds bilaterally",
  "context.case21": "68F, routine pre-operative assessment, no respiratory symptoms",
  "context.case22": "68F, chest pain evaluation, ECG unremarkable",
  "context.case23": "20F, persistent dry cough for 2 weeks, no fever",
  "context.case24": "20F, screening chest X-ray for international travel clearance",
  "context.fx13": "79F, known chronic heart failure, routine outpatient follow-up",
  "context.fx14": "71M, productive cough and fever, suspected community-acquired pneumonia",
  "context.fx15": "35F, sudden onset dyspnoea, post-partum day 5",
  "context.fx16": "25M, dilated cardiomyopathy follow-up, worsening exercise intolerance",
  "context.fx17": "53F, acute decompensation, known congestive heart failure",
  "context.fx18": "57M, haemoptysis and night sweats, weight loss over 6 weeks",
  "context.fx19": "33M, chest pain after minor trauma, SpO2 94% on room air",
  "context.fx20": "33M, pre-employment medical screening, no symptoms",
};

// ---------------------------------------------------------------------------
// Per-case selection rationale (from CASE_SELECTION.md)
// Keyed by patient prefix extracted from imageUrl
// ---------------------------------------------------------------------------
const CASE_RATIONALE: Record<string, { demographics: string; modelBehaviour: string; rationale: string }> = {
  patient37124: {
    demographics: "Male, 48, AP — GT: Edema only",
    modelBehaviour: "edema 95%, cardiomegaly 31%, all others ≤49%",
    rationale: "Classic easy case: single dominant finding with very high AI confidence. The model unambiguously detects the only true finding. Used as a reference case where AI assistance should clearly help — any participant who still misses edema in the AI conditions is a strong signal for over-reliance or inattention.",
  },
  patient00008: {
    demographics: "Male, 81, AP — GT: Pleural Effusion only",
    modelBehaviour: "effusion 91%, consolidation 72%, atelectasis 72% — moderate noise",
    rationale: "Easy case for effusion, but with moderate AI noise on consolidation and atelectasis (both FPs). Tests whether participants can follow the AI's primary signal while correctly ignoring the secondary false positives.",
  },
  patient34852: {
    demographics: "Male, 72, AP — GT: Consolidation only",
    modelBehaviour: "consolidation 83%, edema 65%, effusion 56%",
    rationale: "Easy consolidation case with moderate secondary predictions. The high edema and effusion predictions (both FPs) provide a mild challenge in the AI conditions. Appears in the study both as a standard easy case (context.case04) and as a hard case variant (context.case11) with a bias warning about elderly bedside imaging.",
  },
  patient32710: {
    demographics: "Female, 79, AP — GT: Edema only",
    modelBehaviour: "edema 72%, cardiomegaly 27%, all others ≤13%",
    rationale: "Cleanest easy case in the candidate pool — single dominant finding with minimal noise in secondary predictions. Added to unlock the 15-case set. Adds female elderly AP-view representation and serves as a good reference case where the AI unambiguously helps.",
  },
  patient21795: {
    demographics: "Male, 81, AP — GT: Cardiomegaly",
    modelBehaviour: "cardiomegaly 95%, edema 60% FP",
    rationale: "Primary use: attention check and all four baseline trials. The very high cardiomegaly confidence (95%) means any participant who misses it in the attention check is flagged as inattentive. Also used as case-01 in the main pool with a cardiomyopathy follow-up clinical context. The edema FP (60%) adds mild complexity without obscuring the correct answer.",
  },
  patient59546: {
    demographics: "Male, 67, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 72%, edema 89%, consol 78%, atel 80%, effusion 81%",
    rationale: "Hard case with all five non-Ptx findings confirmed. The model correctly identifies all of them at high confidence — making this a case where AI is reliably helpful. Used with two different clinical contexts: case-05 (acute decompensated heart failure) and case-06 (pneumonia/fever), testing whether the clinical framing affects which findings participants prioritise.",
  },
  patient31804: {
    demographics: "Female, 78, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 95%, edema 89%, consol 53%, atel 62%, effusion 82%",
    rationale: "Hard case with high AI confidence on cardiomegaly, edema and effusion, but borderline consolidation (53%) and moderate atelectasis (62%). The split confidence profile is useful for studying whether participants correctly trust high-confidence predictions while applying more scrutiny to borderline ones.",
  },
  patient38933: {
    demographics: "Female, 68, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 96%, edema 92%, consol 64%, atel 56%, effusion 86%",
    rationale: "Hard case used twice: case-09 (standard hard) and case-10 (with bias warning about AP bedside image quality). The bias-warning variant directly tests the D-condition hypothesis: does an explicit AI limitation warning cause participants to be more cautious or to discount the AI output entirely?",
  },
  patient25296: {
    demographics: "Male, 71, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 91%, edema 83%, consol 57%, atel 48% MISS, effusion 95%",
    rationale: "Hard case where the model correctly identifies dominant findings but misses atelectasis (48%). The very high effusion confidence (95%) combined with the atelectasis miss makes this a good test of critical AI use — participants must not simply follow all predictions, as the most prominent one obscures a missed finding.",
  },
  patient04050: {
    demographics: "Male, 25, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 92%, edema 56%, consol 54%, atel 60%, effusion 68% — moderate across the board",
    rationale: "The only 25-year-old in the study, which is clinically noteworthy (cardiomegaly + multi-organ involvement in a young patient). The moderate-confidence predictions across all findings make this harder than other hard cases — participants cannot simply follow the model. Added to unlock the 20-case set; critical for age-based subgroup analysis in the paper.",
  },
  patient28936: {
    demographics: "Female, 53, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 72%, edema 86%, consol 67%, atel 54%, effusion 94%",
    rationale: "The extremely high effusion confidence (94%) combined with moderate cardiomegaly (72%) creates a case where the AI's confidence hierarchy differs from a clinically balanced read. Tests whether participants anchor on the AI's strongest signal (effusion) and under-attend to cardiomegaly.",
  },
  patient05067: {
    demographics: "Male, 57, AP — GT: All 5 (no Ptx)",
    modelBehaviour: "cMeg 93%, edema 90%, consol 60%, atel 48% MISS, effusion 54%",
    rationale: "The atelectasis miss pattern mirrors p25296, but the lower effusion confidence (54% vs 95%) makes this a distinctly different case. Two cases with the same miss pattern but different overall confidence profiles allow the paper to examine whether the consistency of that miss matters. The borderline effusion also tests whether AI-reliant participants will under-report effusion.",
  },
  patient05319: {
    demographics: "Male, 61, AP — GT: All 6 (with Ptx)",
    modelBehaviour: "ptx 99% — AI strongly flags the pneumothorax",
    rationale: "Core incidental case: the AI very strongly flags the incidental pneumothorax (99%). In condition A (no AI), participants miss the pneumothorax because the clinical context points to a respiratory infection. In conditions B–E, the AI's high ptx signal should help detection. Used twice with different clinical contexts to test whether the framing (infection vs cardiac) affects pneumothorax detection rates.",
  },
  patient36698: {
    demographics: "Female, 44, AP — GT: All 5 + Ptx",
    modelBehaviour: "ptx 57% — AI flags moderately",
    rationale: "Incidental case with moderate AI pneumothorax confidence (57%). Contrasts with p05319 (99%) to examine dose-response: does lower AI confidence lead to proportionally lower pneumothorax detection? Also used with a bias warning (post-surgical positioning variant) to test whether the warning suppresses the ptx signal.",
  },
  patient49165: {
    demographics: "Female, 35, AP — GT: All 5 + Ptx (study 2)",
    modelBehaviour: "ptx 94% — AI strongly flags",
    rationale: "Incidental case with high ptx confidence (94%). The same patient (patient49165) appears twice in the study at different visits: study2 (this case, ptx 94%) and study1 (p49165s1, ptx 66%). This creates a within-patient comparison of different AI signal strengths for the same underlying condition.",
  },
  patient49165_study1: {
    demographics: "Female, 35, AP — GT: All 5 + Ptx (study 1)",
    modelBehaviour: "ptx 66% — AI flags with moderate confidence",
    rationale: "Same patient as p49165 but a different scan (earlier visit). The moderate ptx detection (66% vs 94% in study2) creates a useful contrast: participants must decide whether to act on a borderline AI signal. Tests the borderline-confidence effect within the incidental category.",
  },
  patient48367: {
    demographics: "Male, 57, AP — GT: All 5 + Ptx",
    modelBehaviour: "ptx 59% — AI flags moderately",
    rationale: "Incidental case with moderate AI ptx confidence (59%). The ICU patient context and a bias warning variant (support devices affecting model confidence) make this a test of whether participants discount AI predictions when told the model may be unreliable. Combined with p36698, provides two incidental cases at similar ptx confidence levels for statistical comparison.",
  },
  patient37577: {
    demographics: "Male, 33, AP — GT: All 5 + Ptx",
    modelBehaviour: "ptx 24% MISS, edema 44% MISS — AI fails to detect the incidental pneumothorax",
    rationale: "The only incidental case where the AI misses the pneumothorax (24% — effectively a miss). All other incidental cases have AI ptx confidence of 56–99%. This case directly tests the most critical hypothesis: can human + AI outperform human alone even when the AI does not flag the critical finding? If XAI heatmaps hint at the pleural margin despite low confidence, there may be an XAI-specific benefit even without a numeric signal. This contrast is a thesis-level finding regardless of the result.",
  },
  patient00001: {
    demographics: "Female, 68, AP — GT: Normal (No Finding)",
    modelBehaviour: "atel 59% FP, ptx 52% FP — significant false positives",
    rationale: "AI-wrong case: normal image with significant false positives. The 52% ptx FP is particularly important because, alongside the incidental ptx cases, it tests whether participants in the AI conditions will over-report pneumothorax when the AI flags it incorrectly. Used twice with different clinical contexts to maximise statistical power for the AI-wrong category.",
  },
  patient00004: {
    demographics: "Female, 20, PA — GT: Normal (No Finding)",
    modelBehaviour: "ptx 31% mild FP — mild false positive on normal anatomy",
    rationale: "AI-wrong case with a milder false positive than p00001. The young PA-view normal image provides a useful contrast: a case where the AI's false positive is less pronounced, testing whether participants show more resistance to over-reporting in the face of a weaker AI signal. Includes a bias warning variant about AI false positives on normal young anatomy.",
  },
  patient00005: {
    demographics: "Male, 33, PA — GT: Normal (No Finding)",
    modelBehaviour: "max prediction 23% (consolidation), all others ≤17% — clean true negative",
    rationale: "Clean true negative: the model is correctly low on everything. Added to unlock the 20-case set. Provides a control against over-representing false-positive AI behaviour. Participants who are told 'the AI found nothing suspicious' on a normal case should ideally agree; deviations reveal individual baseline scepticism or anchoring effects.",
  },
};

// Helper: extract patient prefix from imageUrl
function getPatientKey(imageUrl: string): string {
  const match = imageUrl.match(/patient(\d+)/);
  if (!match) return "";
  const num = match[1];
  // patient49165 study1 variant
  if (imageUrl.includes("patient49165_study1")) return "patient49165_study1";
  if (imageUrl.includes("patient00005")) return "patient00005";
  return `patient${num}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  easy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  hard: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  incidental: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  ai_wrong: "bg-red-500/20 text-red-400 border-red-500/30",
  baseline: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  attention_check: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const FINDING_COLORS: Record<string, string> = {
  cardiomegaly: "bg-red-500/15 text-red-400 border-red-500/30",
  edema: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  consolidation: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  atelectasis: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  pleural_effusion: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  pneumothorax: "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

const FINDING_SHORT: Record<string, string> = {
  cardiomegaly: "cMeg",
  edema: "Edema",
  consolidation: "Consol.",
  atelectasis: "Atel.",
  pleural_effusion: "Effusion",
  pneumothorax: "Ptx",
};

function CaseCard({ caseData, onClick, participantCount, avgAccuracy }: {
  caseData: CaseData;
  onClick: () => void;
  participantCount: number;
  avgAccuracy: number | null;
}) {
  return (
    <button
      onClick={onClick}
      className="glass-panel p-3 space-y-2.5 text-left hover:ring-1 hover:ring-primary/50 transition-all w-full"
    >
      <div className="relative w-full aspect-[4/3] bg-secondary rounded overflow-hidden">
        <img src={caseData.imageUrl} alt={caseData.id} className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute top-1.5 right-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${CATEGORY_COLORS[caseData.category] ?? "bg-secondary text-muted-foreground border-border"}`}>
            {caseData.category}
          </span>
        </div>
        {caseData.incidentalFindings.includes("pneumothorax") && (
          <div className="absolute bottom-1.5 left-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-pink-500/20 text-pink-400 border-pink-500/30">Ptx</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{caseData.id}</span>
          {participantCount > 0 && (
            <span className="text-[10px] text-muted-foreground/60">{participantCount} answers</span>
          )}
        </div>
        <div className="flex flex-wrap gap-0.5">
          {caseData.groundTruth.length === 0
            ? <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded border border-border">Normal</span>
            : caseData.groundTruth.map(f => (
                <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded border ${FINDING_COLORS[f] ?? "bg-secondary text-muted-foreground border-border"}`}>
                  {FINDING_SHORT[f] ?? f}
                </span>
              ))
          }
        </div>
        {avgAccuracy != null && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 bg-secondary rounded-full h-1 overflow-hidden">
              <div
                className={`h-1 rounded-full ${avgAccuracy >= 0.8 ? "bg-emerald-500" : avgAccuracy >= 0.5 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${avgAccuracy * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{Math.round(avgAccuracy * 100)}%</span>
          </div>
        )}
      </div>
    </button>
  );
}

function CaseDetail({ caseData, trials, onClose }: {
  caseData: CaseData;
  trials: RawTrial[];
  onClose: () => void;
}) {
  const [showOverlay, setShowOverlay] = useState<string | null>(null);
  const [showRationale, setShowRationale] = useState(true);

  const patientKey = getPatientKey(caseData.imageUrl);
  const rationale = CASE_RATIONALE[patientKey];

  const accuracies = trials.map(t => trialAccuracy(t)).filter((a): a is number => a !== null);
  const avgAcc = accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null;

  // Per-finding detection rate
  const findingDetectionRates = FINDINGS.map(f => {
    const relevant = trials.filter(t => (t.ground_truth ?? []).includes(f.id));
    if (relevant.length === 0) return null;
    const detected = relevant.filter(t =>
      (t.revised_findings ?? t.initial_findings ?? []).includes(f.id)
    ).length;
    return { id: f.id, name: f.name, detected, total: relevant.length };
  }).filter(Boolean);

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl w-full max-w-4xl my-4 space-y-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground font-mono">{caseData.id}</h2>
              <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${CATEGORY_COLORS[caseData.category] ?? ""}`}>
                {caseData.category}
              </span>
            </div>
            {caseData.clinicalContext && (
              <p className="text-sm text-muted-foreground">
                {CLINICAL_CONTEXT[caseData.clinicalContext] ?? caseData.clinicalContext}
              </p>
            )}
            {caseData.metadata && (
              <p className="text-xs text-muted-foreground/60">
                {caseData.metadata.sex}, {caseData.metadata.age}y, {caseData.metadata.view} view
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Left: image */}
          <div className="p-5 space-y-3">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-square">
              <img src={caseData.imageUrl} alt={caseData.id} className="w-full h-full object-contain" />
              {showOverlay && caseData.overlays?.gradcam[showOverlay] && (
                <img
                  src={caseData.overlays.gradcam[showOverlay]}
                  alt="Heatmap overlay"
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ mixBlendMode: "screen", opacity: 0.85 }}
                />
              )}
            </div>

            {/* Overlay selector */}
            {caseData.overlays && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Heatmap Overlay</p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setShowOverlay(null)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${showOverlay === null ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"}`}
                  >
                    None
                  </button>
                  {FINDINGS.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setShowOverlay(showOverlay === f.id ? null : f.id)}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${showOverlay === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"}`}
                    >
                      {FINDING_SHORT[f.id] ?? f.id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {caseData.biasWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2.5">
                <p className="text-xs text-amber-400">{caseData.biasWarning}</p>
              </div>
            )}
          </div>

          {/* Right: data */}
          <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
            {/* Ground truth + AI predictions */}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Ground Truth</p>
                <div className="flex flex-wrap gap-1">
                  {caseData.groundTruth.length === 0
                    ? <span className="text-xs text-muted-foreground">Normal — No Finding</span>
                    : caseData.groundTruth.map(f => (
                        <span key={f} className={`text-xs px-2 py-0.5 rounded border font-medium ${FINDING_COLORS[f] ?? "bg-secondary text-muted-foreground border-border"}`}>
                          {FINDINGS.find(ff => ff.id === f)?.name ?? f}
                        </span>
                      ))
                  }
                </div>
              </div>

              {caseData.primaryFindings.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Primary Findings</p>
                  <div className="flex flex-wrap gap-1">
                    {caseData.primaryFindings.map(f => (
                      <span key={f} className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded border border-border">
                        {FINDINGS.find(ff => ff.id === f)?.name ?? f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {caseData.incidentalFindings.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Incidental Findings</p>
                  <div className="flex flex-wrap gap-1">
                    {caseData.incidentalFindings.map(f => (
                      <span key={f} className={`text-xs px-2 py-0.5 rounded border font-medium ${FINDING_COLORS[f] ?? "bg-secondary text-muted-foreground border-border"}`}>
                        {FINDINGS.find(ff => ff.id === f)?.name ?? f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI predictions */}
            {caseData.aiPredictions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">AI Predictions (Run 014)</p>
                {[...caseData.aiPredictions].sort((a, b) => b.confidence - a.confidence).map(pred => {
                  const isGT = caseData.groundTruth.includes(pred.findingId);
                  return (
                    <div key={pred.findingId} className="flex items-center gap-2">
                      <span className={`text-xs w-24 shrink-0 ${isGT ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {FINDING_SHORT[pred.findingId] ?? pred.findingId}
                        {isGT && <span className="ml-1 text-[10px] text-emerald-400">✓</span>}
                      </span>
                      <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${pred.confidence >= 70 ? "bg-primary" : pred.confidence >= 40 ? "bg-amber-500" : "bg-secondary-foreground/20"}`}
                          style={{ width: `${pred.confidence}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono w-8 text-right text-muted-foreground">{pred.confidence}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Participant accuracy */}
            {trials.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Participant Performance</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className="text-lg font-bold text-foreground">{trials.length}</p>
                    <p className="text-[10px] text-muted-foreground">Answers</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className={`text-lg font-bold ${avgAcc != null ? (avgAcc >= 0.8 ? "text-emerald-400" : avgAcc >= 0.5 ? "text-amber-400" : "text-red-400") : "text-foreground"}`}>
                      {avgAcc != null ? `${Math.round(avgAcc * 100)}%` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Avg Accuracy</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2 text-center">
                    <p className="text-lg font-bold text-foreground">
                      {trials.filter(t => t.changed_mind).length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Changed Mind</p>
                  </div>
                </div>

                {findingDetectionRates.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Finding Detection Rates</p>
                    {findingDetectionRates.map(d => d && (
                      <div key={d.id} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20 shrink-0">{FINDING_SHORT[d.id]}</span>
                        <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${(d.detected / d.total) >= 0.8 ? "bg-emerald-500" : (d.detected / d.total) >= 0.5 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${(d.detected / d.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">{d.detected}/{d.total}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selection rationale */}
            {rationale && (
              <div className="border-t border-border pt-4 space-y-2">
                <button
                  onClick={() => setShowRationale(r => !r)}
                  className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
                >
                  <Info className="w-3.5 h-3.5" />
                  Study Rationale
                  {showRationale ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                </button>
                {showRationale && (
                  <div className="bg-secondary/30 border border-border rounded-lg p-3 space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Demographics & GT</p>
                      <p className="text-xs text-foreground/80">{rationale.demographics}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Model Behaviour</p>
                      <p className="text-xs font-mono text-foreground/80">{rationale.modelBehaviour}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Why This Case</p>
                      <p className="text-xs text-foreground/80 leading-relaxed">{rationale.rationale}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Deduplicate cases by imageUrl + category to avoid identical-image duplicates in the grid
function deduplicateCases(cases: CaseData[]): CaseData[] {
  const seen = new Set<string>();
  return cases.filter(c => {
    const key = `${c.imageUrl}|${c.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function CaseBrowserTab({ data, allCases }: { data: AdminData; allCases: CaseData[] }) {
  const [selected, setSelected] = useState<CaseData | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterFinding, setFilterFinding] = useState<string>("all");

  const uniqueCases = useMemo(() => deduplicateCases(allCases), [allCases]);

  const trialsByCase = useMemo(() => {
    const map = new Map<string, RawTrial[]>();
    for (const t of data.trials) {
      if (!map.has(t.case_id)) map.set(t.case_id, []);
      map.get(t.case_id)!.push(t);
    }
    return map;
  }, [data.trials]);

  const getCaseTrials = (c: CaseData): RawTrial[] => {
    return trialsByCase.get(c.id) ?? [];
  };

  const filtered = useMemo(() => {
    return uniqueCases.filter(c => {
      if (filterCategory !== "all" && c.category !== filterCategory) return false;
      if (filterFinding !== "all" && !c.groundTruth.includes(filterFinding)) return false;
      return true;
    });
  }, [uniqueCases, filterCategory, filterFinding]);

  const categories = ["all", "easy", "hard", "incidental", "ai_wrong", "baseline"];

  return (
    <div className="space-y-4">
      {selected && (
        <CaseDetail
          caseData={selected}
          trials={getCaseTrials(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`h-7 px-3 rounded text-xs font-medium capitalize transition-colors ${filterCategory === cat ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}
            >
              {cat === "all" ? `All (${uniqueCases.length})` : cat}
            </button>
          ))}
        </div>
        <select
          value={filterFinding}
          onChange={e => setFilterFinding(e.target.value)}
          className="h-7 px-2 rounded bg-secondary border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All findings</option>
          {FINDINGS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          <option value="">Normal (no findings)</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} cases</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map(c => {
          const caseTrials = getCaseTrials(c);
          const accs = caseTrials.map(t => trialAccuracy(t)).filter((a): a is number => a !== null);
          const avgAcc = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null;
          return (
            <CaseCard
              key={c.id}
              caseData={c}
              onClick={() => setSelected(c)}
              participantCount={caseTrials.length}
              avgAccuracy={avgAcc}
            />
          );
        })}
      </div>
    </div>
  );
}
