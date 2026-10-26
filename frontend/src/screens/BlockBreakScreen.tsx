import { useState } from "react";
import { useStudy } from "@/context/useStudy";
import { TOTAL_BLOCKS } from "@/data/mockData";
import SystemHeader from "@/components/SystemHeader";
import { Slider } from "@/components/ui/slider";

const BlockBreakScreen = () => {
  const { currentBlock, setScreen, addBlockSurvey, t, language } = useStudy();
  const blockJustCompleted = currentBlock - 1;
  const [nasaMental, setNasaMental] = useState<number | null>(null);
  const [nasaTime, setNasaTime] = useState<number | null>(null);
  const [nasaFrustration, setNasaFrustration] = useState<number | null>(null);
  const [trustPulse, setTrustPulse] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const handleContinue = () => {
    if (nasaMental === null || nasaTime === null || nasaFrustration === null || trustPulse === null) {
      setShowErrors(true);
      setTimeout(() => {
        document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    addBlockSurvey({ block: blockJustCompleted, nasaMental, nasaTime, nasaFrustration, trustPulse });
    setScreen("trial");
  };

  const requiredMessage = language === "en" ? "Please select a rating." : "Bitte eine Bewertung auswählen.";
  const mentalError = showErrors && nasaMental === null;
  const timeError = showErrors && nasaTime === null;
  const frustrationError = showErrors && nasaFrustration === null;
  const trustError = showErrors && trustPulse === null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader breadcrumb={`${t("break.title")} ${blockJustCompleted} / ${TOTAL_BLOCKS}`} />

      <div className="flex-1 flex items-center justify-center p-5">
        <div className="glass-panel p-5 sm:p-6 max-w-md w-full animate-fade-in space-y-5">
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {t("break.title")} {blockJustCompleted} {t("trial.of")} {TOTAL_BLOCKS}
            </p>
            <p className="text-sm text-muted-foreground">{t("break.subtitle")}</p>
          </div>

          <div className="space-y-4">
            <NasaSlider label={t("break.mentalEffort")} value={nasaMental} onChange={setNasaMental} error={mentalError} errorMessage={requiredMessage} />
            <NasaSlider label={t("break.timePressure")} value={nasaTime} onChange={setNasaTime} error={timeError} errorMessage={requiredMessage} />
            <NasaSlider label={t("break.frustration")} value={nasaFrustration} onChange={setNasaFrustration} error={frustrationError} errorMessage={requiredMessage} />

            <div className="space-y-2 pt-3 border-t border-border" data-error={trustError ? "true" : undefined}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${trustError ? "text-destructive" : "text-muted-foreground"}`}>
                {t("break.trustPulse")}
              </p>
              <div className={`flex gap-px rounded overflow-hidden ${trustError ? "ring-1 ring-destructive bg-destructive/5" : "bg-border"}`}>
                {[1, 2, 3, 4, 5, 6, 7].map(val => (
                  <button
                    key={val}
                    onClick={() => setTrustPulse(val)}
                    className={`flex-1 h-8 text-xs font-medium transition-all ${
                      trustPulse === val ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>{t("break.noTrust")}</span>
                <span>{t("break.completeTrust")}</span>
              </div>
              {trustError && (
                <p className="text-xs text-destructive">
                  {requiredMessage}
                </p>
              )}
            </div>
          </div>

          <button onClick={handleContinue} className="w-full h-10 rounded text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all">
            {t("break.continue")}
          </button>
        </div>
      </div>
    </div>
  );
};

const NasaSlider = ({ label, value, onChange, error, errorMessage }: { label: string; value: number | null; onChange: (v: number) => void; error?: boolean; errorMessage?: string }) => (
  <div className={`space-y-2 ${error ? "rounded border border-destructive/50 p-2" : ""}`} data-error={error ? "true" : undefined}>
    <div className="flex items-center justify-between">
      <label className={`text-xs font-semibold uppercase tracking-wider ${error ? "text-destructive" : "text-muted-foreground"}`}>{label}</label>
      <span className="text-sm text-primary font-mono font-medium">{value === null ? "— / 20" : `${value}/20`}</span>
    </div>
    <Slider
      value={[value ?? 10]}
      min={0}
      max={20}
      step={1}
      onValueChange={(vals) => onChange(vals[0] ?? 0)}
      className="w-full"
    />
    {error && errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
  </div>
);

export default BlockBreakScreen;
