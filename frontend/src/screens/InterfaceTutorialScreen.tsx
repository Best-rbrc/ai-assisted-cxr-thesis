import { useState } from "react";
import { Eye, Brain, CheckSquare, SlidersHorizontal, ChevronRight, ChevronLeft, Info } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import SystemHeader from "@/components/SystemHeader";
import { Slider } from "@/components/ui/slider";
import cardiomegalyImg from "@/assets/findings/cardiomegaly.jpg";
import edemaImg from "@/assets/findings/edema.jpg";
import consolidationImg from "@/assets/findings/consolidation.jpg";
import atelectasisImg from "@/assets/findings/atelectasis.jpg";
import pleuralEffusionImg from "@/assets/findings/pleural_effusion.png";
import pneumothoraxImg from "@/assets/findings/pneumothorax.jpg";

const MOCK_FINDINGS = ["Finding A", "Finding B", "Finding C", "Finding D", "Finding E", "Finding F"];

const findingImages: Record<string, string> = {
  cardiomegaly: cardiomegalyImg,
  edema: edemaImg,
  consolidation: consolidationImg,
  atelectasis: atelectasisImg,
  pleural_effusion: pleuralEffusionImg,
  pneumothorax: pneumothoraxImg,
};

const findingDetail: Record<string, { en: string; de: string }> = {
  cardiomegaly: {
    en: "The cardiac silhouette occupies more than 50% of the thoracic width on a PA view. Often associated with heart failure, pericardial effusion, or cardiomyopathy.",
    de: "Die Herzsilhouette nimmt mehr als 50% der Thoraxbreite in der PA-Aufnahme ein. Steht häufig im Zusammenhang mit Herzinsuffizienz, Perikarderguss oder Kardiomyopathie.",
  },
  edema: {
    en: "Fluid accumulation in the lung tissue. Look for cephalization of vessels, peribronchial cuffing, Kerley B lines, and bilateral ground-glass opacities.",
    de: "Flüssigkeitsansammlung im Lungengewebe. Achte auf Gefäßumverteilung, peribronchiale Verdickung, Kerley-B-Linien und bilaterale Milchglastrübungen.",
  },
  consolidation: {
    en: "Air spaces filled with fluid, pus, or cells appearing as dense white areas. May include air bronchograms. Common in pneumonia and acute respiratory distress.",
    de: "Lufträume gefüllt mit Flüssigkeit, Eiter oder Zellen als dichte weiße Bereiche. Kann Luftbronchogramme enthalten. Häufig bei Pneumonie und akutem Atemnotsyndrom.",
  },
  atelectasis: {
    en: "Collapse or incomplete expansion of lung tissue. Signs include volume loss, shift of fissures, elevation of hemidiaphragm, and mediastinal shift toward the affected side.",
    de: "Kollaps oder unvollständige Ausdehnung von Lungengewebe. Zeichen umfassen Volumenverlust, Fissurverschiebung, Zwerchfellhochstand und Mediastinalverschiebung zur betroffenen Seite.",
  },
  pleural_effusion: {
    en: "Fluid between the visceral and parietal pleura. Appears as blunting of costophrenic angles (small effusion) or a meniscus sign with white-out of the lower hemithorax (large effusion).",
    de: "Flüssigkeit zwischen viszeraler und parietaler Pleura. Zeigt sich als Verschattung der kostodiaphragmalen Winkel (kleiner Erguss) oder als Meniskuszeichen mit Verschattung des unteren Hemithorax (großer Erguss).",
  },
  pneumothorax: {
    en: "Air between the lung and chest wall. Look for a thin visceral pleural line with absent lung markings beyond it, usually best seen at the apex. Can range from a subtle apical sliver to complete lung collapse.",
    de: "Luft zwischen Lunge und Brustwand. Achte auf eine dünne viszerale Pleuralinie ohne Lungenzeichnung dahinter, meist apikal am besten sichtbar. Kann von einem dezenten apikalen Streifen bis zum kompletten Lungenkollaps reichen.",
  },
};

const InterfaceTutorialScreen = () => {
  const { setScreen, t, language } = useStudy();
  const [step, setStep] = useState(0);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [checkedFindings, setCheckedFindings] = useState<string[]>([]);
  const [noFinding, setNoFinding] = useState(false);
  const [confidence, setConfidence] = useState(65);

  const toggleFinding = (id: string) => {
    setNoFinding(false);
    setCheckedFindings(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const toggleNoFinding = () => {
    setCheckedFindings([]);
    setNoFinding(prev => !prev);
  };

  const anatomyItems = [{ key: "heart" }, { key: "lungs" }, { key: "diaphragm" }, { key: "costo" }];

  const steps = [
    {
      icon: Info,
      title: t("tutorial.step0.title"),
      content: (
        <div className="space-y-3">
          <div className="rounded border border-primary/25 bg-primary/5 p-3">
            <p className="text-sm text-foreground leading-relaxed">{t("tutorial.step0.body1")}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("tutorial.step0.body2")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("tutorial.step0.body3")}</p>
        </div>
      ),
    },
    {
      icon: Eye,
      title: t("tutorial.step1.title"),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{t("tutorial.step1.intro")}</p>
          <div className="grid grid-cols-2 gap-2">
            {anatomyItems.map(item => (
              <div key={item.key} className="glass-panel p-3">
                <p className="text-xs font-medium text-foreground">{t(`tutorial.step1.${item.key}`)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t(`tutorial.step1.${item.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      icon: Brain,
      title: t("tutorial.step2.title"),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {language === "en"
              ? "For this study, we focus on these 6 findings. Tap any finding to see more detail and an example image."
              : "In dieser Studie konzentrieren wir uns auf diese 6 Befunde. Tippe auf einen Befund für mehr Details und ein Beispielbild."}
          </p>
          <div className="space-y-2">
            {["cardiomegaly", "edema", "consolidation", "atelectasis", "pleural_effusion", "pneumothorax"].map(id => (
              <button
                key={id}
                onClick={() => setExpandedFinding(expandedFinding === id ? null : id)}
                className="w-full text-left flex items-start gap-3 glass-panel p-3 hover:bg-secondary/50 transition-colors rounded"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{t(`finding.${id}`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`finding.${id}.desc`)}</p>
                  {expandedFinding === id && (
                    <div className="mt-2 space-y-2 animate-fade-in">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {findingDetail[id]?.[language] ?? ""}
                      </p>
                      <div className="rounded overflow-hidden border border-border bg-black">
                        <img
                          src={findingImages[id]}
                          alt={t(`finding.${id}`)}
                          className="w-full h-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/80 italic flex items-start gap-1.5">
            <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
            {language === "en"
              ? "You can always review these findings during the study via the \"Findings\" button in the top bar."
              : "Du kannst diese Befunde jederzeit während der Studie über den \"Befunde\"-Button in der oberen Leiste einsehen."}
          </p>
        </div>
      ),
    },
    {
      icon: CheckSquare,
      title: t("ifTutorial.step1.title"),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("ifTutorial.step1.body")}
          </p>
          <div className="glass-panel p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
              {language === "en" ? "Try it — tap any finding below" : "Ausprobieren – tippe auf einen Befund"}
            </p>
            {MOCK_FINDINGS.map(id => (
              <button
                key={id}
                onClick={() => toggleFinding(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded border transition-colors text-left ${
                  checkedFindings.includes(id)
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  checkedFindings.includes(id) ? "border-primary bg-primary" : "border-border"
                }`}>
                  {checkedFindings.includes(id) && (
                    <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm">{id}</span>
              </button>
            ))}
            <div className="border-t border-border/50 pt-2">
              <button
                onClick={toggleNoFinding}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded border transition-colors text-left ${
                  noFinding
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  noFinding ? "border-primary bg-primary" : "border-border"
                }`}>
                  {noFinding && (
                    <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm">{t("ifTutorial.step1.noFinding")}</span>
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      icon: SlidersHorizontal,
      title: t("ifTutorial.step2.title"),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("ifTutorial.step2.body")}
          </p>
          <div className="glass-panel p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              {language === "en" ? "Try it — drag the slider" : "Ausprobieren – Schieberegler bewegen"}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("ifTutorial.step2.label")}
                </label>
                <span className="text-sm text-primary font-mono font-medium">{confidence}%</span>
              </div>
              <Slider
                value={[confidence]}
                min={0}
                max={100}
                step={1}
                onValueChange={(vals) => setConfidence(vals[0] ?? 0)}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>{language === "en" ? "Not confident" : "Unsicher"}</span>
                <span>{language === "en" ? "Very confident" : "Sehr sicher"}</span>
              </div>
            </div>
          </div>

        </div>
      ),
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader
        breadcrumb={t("ifTutorial.breadcrumb")}
        showFindingsButton={true}
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
                {language === "en" ? `Step ${step + 1}/${steps.length}` : `Schritt ${step + 1}/${steps.length}`}
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
                <ChevronLeft className="w-3.5 h-3.5" />
                {t("tutorial.back")}
              </button>
            )}
            <button
              onClick={() =>
                step < steps.length - 1 ? setStep(step + 1) : setScreen("pre-survey")
              }
              className="flex-1 h-9 rounded text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all flex items-center justify-center gap-1"
            >
              {step < steps.length - 1 ? (
                <>{t("tutorial.next")} <ChevronRight className="w-3.5 h-3.5" /></>
              ) : (
                <>{t("ifTutorial.cta")} <ChevronRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterfaceTutorialScreen;
