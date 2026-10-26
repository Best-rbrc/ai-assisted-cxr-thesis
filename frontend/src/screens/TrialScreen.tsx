import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Send, AlertTriangle, X, Info, MousePointerClick, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudy } from "@/context/useStudy";
import { FINDINGS } from "@/data/mockData";
import StudyCheckbox from "@/components/StudyCheckbox";
import SystemHeader from "@/components/SystemHeader";
import { Slider } from "@/components/ui/slider";

type OverlayView = "original" | "gradcam";
const NO_FINDING_ID = "__no_finding__";

// Module-level set so it survives TrialScreen unmount/remount (e.g. block breaks).
// Reset whenever the session code changes so a new session always shows all modals.
const seenConditionsGlobal = new Set<string>();
let lastSessionCode = "";

const TrialScreen = () => {
  const { currentCase, phase, setPhase, addResponse, nextCase, currentCaseIndex, totalCases, mainCaseCount, progress, currentBlock, language, t, sessionCode } = useStudy();
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [revisedFindings, setRevisedFindings] = useState<string[]>([]);
  const [revisedConfidence, setRevisedConfidence] = useState<number | null>(null);
  /** Unset until the participant rates AI helpfulness (sliders default to 50 would otherwise skip intent). */
  const [aiHelpful, setAiHelpful] = useState<number | null>(null);
  const [overlayView, setOverlayView] = useState<OverlayView>("original");
  const [selectedOverlayFinding, setSelectedOverlayFinding] = useState<string>("cardiomegaly");
  const [biasAcknowledged, setBiasAcknowledged] = useState(false);
  const [xaiFaithful, setXaiFaithful] = useState<string | null>(null);
  const [xaiHelpful, setXaiHelpful] = useState<string | null>(null);
  const [changedMind, setChangedMind] = useState<boolean | null>(null);
  const [showPhase2Errors, setShowPhase2Errors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTime = useRef(Date.now());
  const phase2StartTime = useRef<number | null>(null);
  const bannerShowTime = useRef<number | null>(null);
  const [showConditionInfo, setShowConditionInfo] = useState(false);
  const [showPhase1Errors, setShowPhase1Errors] = useState(false);
  const seenConditions = useRef<Set<string>>(seenConditionsGlobal);

  // Zoom & pan state for X-ray image
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const isImmediate = currentCase?.condition === "A"; // A = AI shown from start, single phase
  const showAIPredictions = currentCase?.condition === "A" || currentCase?.condition === "B" || currentCase?.condition === "C" || currentCase?.condition === "D";
  const showAI = currentCase?.condition !== "A"; // B, C, D, E have phase 2 (legacy D still handled)
  const showExplanations = currentCase?.condition === "C" || currentCase?.condition === "D" || currentCase?.condition === "E";
  const showBias = (currentCase?.condition === "C" || currentCase?.condition === "D" || currentCase?.condition === "E") && currentCase?.biasWarning;

  // Clear the seen-conditions cache when a new session starts (same tab, different code).
  useEffect(() => {
    if (sessionCode && sessionCode !== lastSessionCode) {
      seenConditionsGlobal.clear();
      lastSessionCode = sessionCode;
    }
  }, [sessionCode]);

  // Show condition info modal the first time each condition is encountered.
  // Reset on every case change so it doesn't carry over from a previous case.
  // The condition is only marked as "seen" when the user dismisses the modal.
  useEffect(() => {
    if (!currentCase || currentCase.isAttentionCheck) {
      setShowConditionInfo(false);
      return;
    }
    if (!seenConditions.current.has(currentCase.condition)) {
      setShowConditionInfo(true);
    } else {
      setShowConditionInfo(false);
    }
  }, [currentCase]);

  const dismissConditionInfo = () => {
    if (currentCase) seenConditions.current.add(currentCase.condition);
    setShowConditionInfo(false);
  };


  // --- All hooks MUST be called before any early return (Rules of Hooks) ---

  // Reset zoom when case changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentCase?.id]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => {
      const next = Math.max(1, Math.min(5, prev - e.deltaY * 0.002));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOffset.current = { ...pan };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panOffset.current.x + (e.clientX - panStart.current.x),
      y: panOffset.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback(() => { isPanning.current = false; }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // --- Early return AFTER all hooks ---
  if (!currentCase) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const toggleFinding = (id: string, isPhase2: boolean) => {
    const setter = isPhase2 ? setRevisedFindings : setSelectedFindings;
    setter(prev => {
      if (id === NO_FINDING_ID) return prev.includes(NO_FINDING_ID) ? [] : [NO_FINDING_ID];
      const withoutNone = prev.filter(f => f !== NO_FINDING_ID);
      return withoutNone.includes(id) ? withoutNone.filter(f => f !== id) : [...withoutNone, id];
    });
  };

  const normalizedInitialFindings = selectedFindings.filter(id => id !== NO_FINDING_ID);
  const normalizedRevisedFindings = revisedFindings.filter(id => id !== NO_FINDING_ID);

  const phase2FormComplete =
    revisedFindings.length > 0 &&
    revisedConfidence !== null &&
    aiHelpful !== null &&
    (!showExplanations || (xaiFaithful != null && xaiHelpful != null)) &&
    (!showAI || changedMind !== null);
  const requiredMessage = language === "de" ? "Bitte beantworten." : "Please answer this question.";
  const missingRevisedFindings = showPhase2Errors && revisedFindings.length === 0;
  const missingAiHelpful = showPhase2Errors && aiHelpful === null;
  const missingXaiFaithful = showPhase2Errors && showExplanations && xaiFaithful === null;
  const missingXaiHelpful = showPhase2Errors && showExplanations && xaiHelpful === null;
  const missingChangedMind = showPhase2Errors && showAI && changedMind === null;

  const missingConfidence = showPhase1Errors && confidence === null;

  const handleLockIn = () => {
    if (isSubmitting) return;
    if (confidence === null) {
      setShowPhase1Errors(true);
      return;
    }
    setIsSubmitting(true);
    if (isImmediate) {
      // Condition A: AI visible from start, single-phase submit
      addResponse({
        caseId: currentCase.id, condition: currentCase.condition, category: currentCase.category,
        groundTruth: currentCase.groundTruth, aiPredictions: currentCase.aiPredictions,
        initialFindings: normalizedInitialFindings, initialConfidence: confidence,
        responseTimePreMs: Date.now() - startTime.current,
      });
      resetAndNext();
    } else {
      setRevisedFindings([...selectedFindings]);
      setRevisedConfidence(null);
      setShowPhase2Errors(false);
      phase2StartTime.current = Date.now();
      if (showBias) bannerShowTime.current = Date.now();
      if (showAIPredictions) {
        const topPred = [...currentCase.aiPredictions].sort((a, b) => b.confidence - a.confidence)[0];
        if (topPred) setSelectedOverlayFinding(topPred.findingId);
      } else {
        const firstNeutral = FINDINGS.map(f => f.id).find(id => currentCase.overlays?.gradcam?.[id]);
        if (firstNeutral) setSelectedOverlayFinding(firstNeutral);
      }
      setPhase(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (isSubmitting) return;
    if (!phase2FormComplete) {
      setShowPhase2Errors(true);
      return;
    }
    setIsSubmitting(true);
    const responseTimePostMs = phase2StartTime.current ? Date.now() - phase2StartTime.current : undefined;
    const timeOnBannerMs = showBias && bannerShowTime.current && biasAcknowledged ? Date.now() - bannerShowTime.current : undefined;
    addResponse({
      caseId: currentCase.id, condition: currentCase.condition, category: currentCase.category,
      groundTruth: currentCase.groundTruth, aiPredictions: currentCase.aiPredictions,
      initialFindings: normalizedInitialFindings, initialConfidence: confidence!,
      revisedFindings: normalizedRevisedFindings, revisedConfidence: revisedConfidence!, aiHelpful: aiHelpful!,
      xaiHelpful: showExplanations ? (xaiHelpful as any) : undefined,
      xaiFaithful: showExplanations ? (xaiFaithful as any) : undefined,
      xaiViewSelected: showExplanations ? overlayView : undefined,
      xaiOverlayFinding: showExplanations && overlayView !== "original" ? selectedOverlayFinding : undefined,
      changedMindSelfReport: changedMind ?? undefined,
      responseTimePreMs: phase2StartTime.current ? phase2StartTime.current - startTime.current : Date.now() - startTime.current,
      responseTimePostMs, biasBannerDismissed: showBias ? biasAcknowledged : undefined, timeOnBannerMs,
    });
    resetAndNext();
  };

  const resetAndNext = () => {
    setSelectedFindings([]); setConfidence(null); setRevisedFindings([]); setRevisedConfidence(null);
    setAiHelpful(null); setOverlayView("original"); setSelectedOverlayFinding("cardiomegaly"); setBiasAcknowledged(false);
    setXaiFaithful(null); setXaiHelpful(null); setChangedMind(null);
    setShowPhase1Errors(false); setShowPhase2Errors(false);
    startTime.current = Date.now(); phase2StartTime.current = null; bannerShowTime.current = null;
    setIsSubmitting(false);
    nextCase();
  };

  const showOverlay = overlayView !== "original" && phase === 2;

  const gradcamByFinding = currentCase.overlays?.gradcam ?? {};
  const overlayChipItems: { findingId: string; confidence?: number }[] = showAIPredictions
    ? [...currentCase.aiPredictions].sort((a, b) => b.confidence - a.confidence)
    : FINDINGS.map(f => f.id)
      .filter(id => !!gradcamByFinding[id])
      .map(findingId => ({ findingId }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Condition info overlay */}
      {showConditionInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {t(`conditionInfo.${currentCase.condition}.title`)}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(`conditionInfo.${currentCase.condition}.desc`)}
            </p>
            <Button onClick={dismissConditionInfo} className="w-full h-10 rounded text-sm">
              {t("conditionInfo.dismiss")}
            </Button>
          </div>
        </div>
      )}

      <SystemHeader
        breadcrumb={
          currentCaseIndex >= (mainCaseCount ?? totalCases)
            ? `Bonus ${currentCaseIndex - (mainCaseCount ?? totalCases) + 1} / ${totalCases - (mainCaseCount ?? totalCases)}`
            : `${t("trial.case")} ${currentCaseIndex + 1} / ${mainCaseCount ?? totalCases}`
        }
        progress={progress}
        phaseLabel={phase === 1 ? t("trial.phase1") : t("trial.phase2")}
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Image viewer */}
        <div className="shrink-0 lg:flex-1 lg:min-h-0 bg-black/20 flex flex-col items-center justify-center p-4 sm:p-6 relative">
          {showBias && !biasAcknowledged && phase === 2 && (
            <div className="absolute top-3 left-3 right-3 bg-card border border-warning/30 rounded p-3 flex items-start gap-2 z-10 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning/90 flex-1 leading-snug">{currentCase.biasWarning}</p>
              <button onClick={() => setBiasAcknowledged(true)} className="text-warning/60 hover:text-warning">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div
            ref={imgContainerRef}
            className="relative w-full max-w-lg max-h-[min(85dvh,100vw)] aspect-square bg-black rounded overflow-hidden border border-border/50 select-none"
            style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            <div
              className="w-full h-full"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isPanning.current ? 'none' : 'transform 0.15s ease-out',
              }}
            >
              <img src={currentCase.imageUrl} alt={`Case ${currentCase.id}`} className="w-full h-full object-contain" draggable={false} />
              {showOverlay && (() => {
                const overlayUrl = currentCase.overlays?.[overlayView as "gradcam"]?.[selectedOverlayFinding];
                return overlayUrl ? (
                  <img
                    src={overlayUrl}
                    alt={`${overlayView} overlay for ${selectedOverlayFinding}`}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ mixBlendMode: "screen", opacity: 0.85 }}
                    draggable={false}
                  />
                ) : null;
              })()}
            </div>
            <div className="absolute top-2 left-2 text-[10px] text-muted-foreground/40 font-mono leading-tight">
              <div>CASE {String(currentCaseIndex + 1).padStart(3, "0")}</div>
              <div>BLOCK {currentBlock}</div>
            </div>
            {zoom > 1 && (
              <div className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white/70 font-mono">
                {zoom.toFixed(1)}×
              </div>
            )}
            {zoom === 1 && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white/40">
                <ZoomIn className="w-3 h-3" /> scroll
              </div>
            )}
          </div>

          {showExplanations && phase === 2 && (
            <div className="mt-3 space-y-2">
              {/* XAI method toggle */}
              <div className="flex gap-px bg-border rounded overflow-hidden">
                {(["original", "gradcam"] as OverlayView[]).map(view => (
                  <button
                    key={view}
                    onClick={() => setOverlayView(view)}
                    className={`flex-1 min-h-[44px] lg:min-h-0 lg:py-2 px-2 flex items-center justify-center text-xs font-medium transition-colors ${overlayView === view
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {t(`trial.overlay.${view}`)}
                  </button>
                ))}
              </div>

              {/* Per-finding selector — always reserves space to prevent layout jump */}
              <div
                className={`flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-1 -mx-1 px-1 sm:overflow-x-auto sm:pb-0.5 snap-x snap-mandatory sm:snap-none transition-opacity duration-150 ${overlayView === "original" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              >
                {overlayChipItems.map(item => (
                  <button
                    key={item.findingId}
                    onClick={() => setSelectedOverlayFinding(item.findingId)}
                    className={`shrink-0 snap-start min-h-[40px] sm:min-h-0 px-2.5 py-2 sm:py-1 rounded text-[11px] font-medium transition-colors border inline-flex items-center ${selectedOverlayFinding === item.findingId
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/50 text-muted-foreground border-border hover:text-foreground"
                      }`}
                  >
                    {t(`finding.${item.findingId}`)}
                    {showAIPredictions && item.confidence !== undefined && (
                      <span className="ml-1 opacity-60 font-mono">{item.confidence}%</span>
                    )}
                  </button>
                ))}
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MousePointerClick className="w-3.5 h-3.5 shrink-0 text-primary" />
                {t("trial.overlayHint")}
              </p>
            </div>
          )}
        </div>

        {/* Panel */}
        <div className="lg:w-[400px] lg:min-h-0 border-l border-border bg-card/30 p-4 sm:p-5 space-y-4 lg:overflow-y-auto">
          {currentCase.clinicalContext && (
            <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-0.5">{t("trial.clinicalContext")}</p>
              <p className="text-sm text-foreground leading-snug">{t(currentCase.clinicalContext!)}</p>
            </div>
          )}
          {phase === 1 ? (
            <>
              {/* Condition A: show AI predictions in Phase 1 */}
              {isImmediate && showAIPredictions && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("trial.aiPredictions")}</h3>
                  <div className="space-y-2.5">
                    {currentCase.aiPredictions.map(pred => (
                      <div key={pred.findingId} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">{t(`finding.${pred.findingId}`)}</span>
                          <span className="text-primary font-mono text-xs">{pred.confidence}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${pred.confidence}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("trial.selectFindings")}</h3>
                <div className="space-y-2">
                  {FINDINGS.map(f => (
                    <StudyCheckbox key={f.id} checked={selectedFindings.includes(f.id)} onChange={() => toggleFinding(f.id, false)} label={t(`finding.${f.id}`)} description={t(`finding.${f.id}.desc`)} />
                  ))}
                  <div className="border-t border-border/50 pt-2">
                    <StudyCheckbox checked={selectedFindings.includes(NO_FINDING_ID)} onChange={() => toggleFinding(NO_FINDING_ID, false)} label={t("finding.none")} />
                  </div>
                </div>
              </div>
              <SliderField label={t("trial.confidence")} value={confidence} onChange={setConfidence} minLabel={t("trial.notConfident")} maxLabel={t("trial.veryConfident")} error={missingConfidence} errorMessage={requiredMessage} />
              <Button onClick={handleLockIn} disabled={selectedFindings.length === 0 || isSubmitting} className="w-full h-10 rounded text-sm">
                <Lock className="w-4 h-4 mr-2" />
                {isImmediate ? t("trial.submitAnswer") : t("trial.lockIn")}
              </Button>
            </>
          ) : (
            <>
              {showAIPredictions && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("trial.aiPredictions")}</h3>
                  <div className="space-y-2.5">
                    {currentCase.aiPredictions.map(pred => (
                      <div key={pred.findingId} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">{t(`finding.${pred.findingId}`)}</span>
                          <span className="text-primary font-mono text-xs">{pred.confidence}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${pred.confidence}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`rounded ${missingRevisedFindings ? "border border-destructive/50 p-2" : ""}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${missingRevisedFindings ? "text-destructive" : "text-muted-foreground"}`}>{t("trial.revise")}</h3>
                <div className="space-y-2">
                  {FINDINGS.map(f => (
                    <StudyCheckbox key={f.id} checked={revisedFindings.includes(f.id)} onChange={() => toggleFinding(f.id, true)} label={t(`finding.${f.id}`)} />
                  ))}
                  <div className="border-t border-border/50 pt-2">
                    <StudyCheckbox checked={revisedFindings.includes(NO_FINDING_ID)} onChange={() => toggleFinding(NO_FINDING_ID, true)} label={t("finding.none")} />
                  </div>
                </div>
                {missingRevisedFindings && <p className="mt-2 text-xs text-destructive">{requiredMessage}</p>}
              </div>

              <SliderField label={t("trial.revisedConfidence")} value={revisedConfidence} onChange={setRevisedConfidence} error={showPhase2Errors && revisedConfidence === null} errorMessage={requiredMessage} />
              <SliderField
                label={t("trial.aiHelpful")}
                value={aiHelpful}
                onChange={setAiHelpful}
                minLabel={t("trial.notAtAll")}
                maxLabel={t("trial.veryHelpful")}
                error={missingAiHelpful}
                errorMessage={requiredMessage}
              />

              {showExplanations && (
                <>
                  <ToggleGroup
                    label={t("trial.xaiFaithful")}
                    value={xaiFaithful}
                    options={["yes", "partially", "no", "unsure"]}
                    labelFn={o => t(`trial.xaiFaithful.${o}`)}
                    onChange={setXaiFaithful}
                    error={missingXaiFaithful}
                    errorMessage={requiredMessage}
                  />
                  <ToggleGroup
                    label={t("trial.xaiHelpful")}
                    value={xaiHelpful}
                    options={["helped", "neutral", "misleading"]}
                    labelFn={o => t(`trial.xaiHelpful.${o}`)}
                    onChange={setXaiHelpful}
                    error={missingXaiHelpful}
                    errorMessage={requiredMessage}
                  />
                </>
              )}

              {showAI && (
                <ToggleGroup
                  label={t("trial.changedMind")}
                  value={changedMind === null ? null : String(changedMind)}
                  options={["true", "false"]}
                  labelFn={o => o === "true" ? t("trial.yes") : t("trial.no")}
                  onChange={v => setChangedMind(v === "true")}
                  error={missingChangedMind}
                  errorMessage={requiredMessage}
                />
              )}

              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full h-10 rounded text-sm">
                <Send className="w-4 h-4 mr-2" /> {t("trial.submitNext")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const SliderField = ({ label, value, onChange, minLabel, maxLabel, error, errorMessage }: { label: string; value: number | null; onChange: (v: number) => void; minLabel?: string; maxLabel?: string; error?: boolean; errorMessage?: string }) => (
  <div className={`space-y-2 ${error ? "rounded border border-destructive/50 p-2" : ""}`}>
    <div className="flex items-center justify-between">
      <label className={`text-xs font-semibold uppercase tracking-wider ${error ? "text-destructive" : "text-muted-foreground"}`}>{label}</label>
      <span className="text-sm text-primary font-mono font-medium">{value === null ? "— / 100%" : `${value}%`}</span>
    </div>
    <Slider
      value={[value ?? 50]}
      min={0}
      max={100}
      step={1}
      onValueChange={(vals) => onChange(vals[0] ?? 0)}
      className="w-full"
    />
    {(minLabel || maxLabel) && (
      <div className="flex justify-between text-xs text-muted-foreground/60">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    )}
    {error && errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
  </div>
);

const ToggleGroup = ({ label, value, options, labelFn, onChange, error, errorMessage }: { label: string; value: string | null; options: string[]; labelFn: (o: string) => string; onChange: (v: string) => void; error?: boolean; errorMessage?: string }) => (
  <div className={`space-y-2 ${error ? "rounded border border-destructive/50 p-2" : ""}`}>
    <p className={`text-xs font-semibold uppercase tracking-wider ${error ? "text-destructive" : "text-muted-foreground"}`}>{label}</p>
    <div className="flex gap-px bg-border rounded overflow-hidden">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 h-8 text-xs font-medium transition-all ${value === opt ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
        >
          {labelFn(opt)}
        </button>
      ))}
    </div>
    {error && errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
  </div>
);

export default TrialScreen;
