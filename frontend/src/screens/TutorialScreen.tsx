import { useState } from "react";
import { BarChart3, AlertTriangle, ChevronRight, ChevronLeft } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import SystemHeader from "@/components/SystemHeader";
import consolidationImg from "@/assets/findings/consolidation.jpg";

const TutorialScreen = () => {
  const { setScreen, t, language } = useStudy();
  const [step, setStep] = useState(0);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const exampleFindings = [
    { key: "cardiomegaly", value: 85 },
    { key: "edema", value: 30 },
    { key: "consolidation", value: 12 },
  ];

  const steps = [
    {
      icon: BarChart3,
      title: t("tutorial.step3.title"),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("tutorial.step3.intro")}</p>
          <div className="glass-panel p-4 space-y-3">
            {exampleFindings.map(item => (
              <div key={item.key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">{t(`finding.${item.key}`)}</span>
                  <span className="text-primary font-mono text-xs">{item.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-background overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("tutorial.step3.hint")}</p>
        </div>
      ),
    },
    {
      icon: AlertTriangle,
      title: t("tutorial.step4.title"),
      content: (
        <div className="space-y-3">
          <button
            onClick={() => setExpandedStep(expandedStep === "heatmap" ? null : "heatmap")}
            className="w-full text-left glass-panel p-3 space-y-1.5 hover:bg-secondary/50 transition-colors rounded"
          >
            <p className="text-sm font-medium text-foreground">{t("tutorial.step4.heatmap.title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("tutorial.step4.heatmap.desc")}{" "}
              <span className="text-warning font-medium">{t("tutorial.step4.approx")}</span>.
            </p>
            {expandedStep === "heatmap" && (
              <div className="mt-2 rounded overflow-hidden border border-border bg-black animate-fade-in relative">
                <img src={consolidationImg} alt="Heatmap example" className="w-full h-auto" />
                <div className="absolute inset-0 bg-gradient-to-tr from-red-500/50 via-yellow-400/30 to-blue-500/20 pointer-events-none" />
                <div className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white">
                  {language === "en" ? "Example overlay" : "Beispiel-Overlay"}
                </div>
              </div>
            )}
          </button>
          <button
            onClick={() => setExpandedStep(expandedStep === "bias" ? null : "bias")}
            className="w-full text-left rounded p-3 border border-warning/20 bg-warning/5 space-y-1 hover:bg-warning/10 transition-colors"
          >
            <p className="text-sm font-medium text-warning flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t("tutorial.step4.bias.title")}
            </p>
            <p className="text-xs text-muted-foreground">{t("tutorial.step4.bias.desc")}</p>
            {expandedStep === "bias" && (
              <div className="mt-2 rounded border border-warning/30 bg-warning/10 p-3 animate-fade-in">
                <p className="text-[11px] leading-relaxed text-warning">
                  {language === "en"
                    ? "⚠ AP image · Patient age: 82 · Model performance is ~8% lower for elderly bedside patients"
                    : "⚠ AP-Aufnahme · Patientenalter: 82 · Die Modellleistung ist bei älteren Bettlägerigen um ~8% geringer"}
                </p>
              </div>
            )}
          </button>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader
        breadcrumb="Tutorial"
        rightContent={
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === step ? "w-5 bg-primary" : "w-2 bg-border"
                }`}
              />
            ))}
          </div>
        }
      />

      <div className="flex-1 flex items-center justify-center p-5">
        <div className="glass-panel p-5 sm:p-6 max-w-lg w-full animate-fade-in space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                Step {step + 1}/{steps.length}
              </p>
              <h2 className="text-base font-semibold text-foreground">{current.title}</h2>
            </div>
          </div>

          {current.content}

          <div className="flex gap-2 pt-1">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="h-9 px-4 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-accent transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> {t("tutorial.back")}
              </button>
            )}
            <button
              onClick={() => step < steps.length - 1 ? setStep(step + 1) : setScreen("trial")}
              className="flex-1 h-9 rounded text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all flex items-center justify-center gap-1"
            >
              {step < steps.length - 1
                ? <>{t("tutorial.next")} <ChevronRight className="w-3.5 h-3.5" /></>
                : t("tutorial.start")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialScreen;
