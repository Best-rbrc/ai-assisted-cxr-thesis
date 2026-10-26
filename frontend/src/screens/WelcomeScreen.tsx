import { useState, useEffect } from "react";
import { Check, Clock, Zap, BookOpen, Copy, CheckCircle2, KeyRound } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import SystemHeader from "@/components/SystemHeader";

const ALL_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Azerbaijan",
  "Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi",
  "Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (DRC)","Congo (Republic)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic",
  "Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia",
  "Fiji","Finland","France",
  "Gabon","Gambia","Georgia","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana",
  "Haiti","Honduras","Hungary",
  "Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast",
  "Jamaica","Japan","Jordan",
  "Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan",
  "Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
  "Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
  "Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway",
  "Oman",
  "Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal",
  "Qatar",
  "Romania","Russia","Rwanda",
  "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Syria",
  "Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
  "Vanuatu","Vatican City","Venezuela","Vietnam",
  "Yemen",
  "Zambia","Zimbabwe",
];

const TIME_OPTIONS = [
  { mins: 20, cases: 10, icon: Zap,      label: { en: "Quick",    de: "Kurz"          }, desc: { en: "10 cases · 5 blocks", de: "10 Fälle · 5 Blöcke" } },
  { mins: 30, cases: 15, icon: BookOpen, label: { en: "Standard", de: "Standard"       }, desc: { en: "15 cases · 5 blocks", de: "15 Fälle · 5 Blöcke" } },
  { mins: 40, cases: 20, icon: Clock,    label: { en: "Full",     de: "Vollständig"    }, desc: { en: "20 cases · 5 blocks", de: "20 Fälle · 5 Blöcke" } },
];

const WelcomeScreen = () => {
  const { setScreen, setUserProfile, initializeCases, sessionCode, language, t } = useStudy();
  const [codeCopied, setCodeCopied] = useState(false);

  const copyCode = () => {
    if (!sessionCode) return;
    navigator.clipboard.writeText(sessionCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const [time, setTime] = useState<number | null>(30);
  const [experience, setExperience] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [sex, setSex] = useState("");
  const [country, setCountry] = useState("");
  const [countryOther, setCountryOther] = useState("");

  // Pre-select country from IP geolocation on first load
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(data => {
        const name: string = data.country_name ?? "";
        if (name === "Austria") setCountry(t("country.austria"));
        else if (name === "Germany") setCountry(t("country.germany"));
        else if (name === "Switzerland") setCountry(t("country.switzerland"));
        else if (name) { setCountry(t("country.other")); setCountryOther(name); }
      })
      .catch(() => { /* silently ignore if blocked */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [semester, setSemester] = useState("");
  const [specialty, setSpecialty] = useState<string[]>([]);
  const [xrayExp, setXrayExp] = useState("");
  const [xrayVolume, setXrayVolume] = useState("");
  const [aiGeneral, setAiGeneral] = useState("");
  const [aiMedicine, setAiMedicine] = useState("");
  const [aiCurrentUse, setAiCurrentUse] = useState<string[]>([]);
  const [aiKnowledge, setAiKnowledge] = useState("");
  const [aiCdss, setAiCdss] = useState("");
  const [aiAttitude, setAiAttitude] = useState("");
  const [aiTraining, setAiTraining] = useState("");
  const [consented, setConsented] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const expOptions = [t("exp.none"), t("exp.student"), t("exp.resident"), t("exp.other")];
  const ageOptions = [t("age.under25"), t("age.25-34"), t("age.35-44"), t("age.45-54"), t("age.55plus"), t("age.preferNot")];
  const sexOptions = [t("sex.male"), t("sex.female"), t("sex.other"), t("sex.preferNot")];
  
  const countryOptions = [t("country.austria"), t("country.germany"), t("country.switzerland"), t("country.other")];
  const isOtherCountry = country === t("country.other");
  // Effective country value for semester logic: use the typed country name when "Other" is selected
  const effectiveCountry = isOtherCountry ? t("country.other") : country;

  const semesterOptions = (() => {
    if (experience === t("exp.student")) {
      if (effectiveCountry === t("country.austria")) return [t("sem.at.1abschnitt"), t("sem.at.2abschnitt.early"), t("sem.at.2abschnitt.late"), t("sem.at.3abschnitt")];
      if (effectiveCountry === t("country.germany")) return [t("sem.de.preclinical"), t("sem.de.clinical"), t("sem.de.pj")];
      if (effectiveCountry === t("country.switzerland")) return [t("sem.ch.bachelor"), t("sem.ch.master")];
      if (effectiveCountry === t("country.other")) return [t("sem.other.early"), t("sem.other.late")];
      return [];
    }
    if (experience === t("exp.resident")) return [t("sem.0-2y"), t("sem.3-5y"), t("sem.5y+")];
    return [t("sem.na")];
  })();

  const showSpecialty = experience === t("exp.resident") || experience === t("exp.other");
  const specialtyOptions = [
    { key: "radiology", label: t("spec.radiology") },
    { key: "internal", label: t("spec.internal") },
    { key: "surgery", label: t("spec.surgery") },
    { key: "emergency", label: t("spec.emergency") },
    { key: "pulmonology", label: t("spec.pulmonology") },
    { key: "cardiology", label: t("spec.cardiology") },
    { key: "anesthesia", label: t("spec.anesthesia") },
    { key: "pediatrics", label: t("spec.pediatrics") },
    { key: "orthopedics", label: t("spec.orthopedics") },
    { key: "neurology", label: t("spec.neurology") },
    { key: "oncology", label: t("spec.oncology") },
    { key: "generalPractice", label: t("spec.generalPractice") },
    { key: "intensiveCare", label: t("spec.intensiveCare") },
    { key: "pathology", label: t("spec.pathology") },
    { key: "other", label: t("spec.other") },
  ];

  const toggleSpecialty = (key: string) => {
    setSpecialty(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const xrayOptions = [t("xray.none"), t("xray.few"), t("xray.moderate"), t("xray.experienced")];
  const xrayVolOptions = [t("xrayVol.0"), t("xrayVol.1-5"), t("xrayVol.6-20"), t("xrayVol.21-50"), t("xrayVol.51-200"), t("xrayVol.200+")];

  const aiGeneralOptions = [t("ai.never"), t("ai.rarely"), t("ai.weekly"), t("ai.daily")];
  const aiMedOptions = [t("aiMed.never"), t("aiMed.tried"), t("aiMed.occasionally"), t("aiMed.regularly")];
  const aiKnowledgeOptions = [t("aiKnow.none"), t("aiKnow.basic"), t("aiKnow.good"), t("aiKnow.expert")];
  const aiCdssOptions = [t("cdss.never"), t("cdss.heard"), t("cdss.tried"), t("cdss.regular")];
  const aiAttitudeOptions = [t("aiAtt.verySkeptical"), t("aiAtt.skeptical"), t("aiAtt.neutral"), t("aiAtt.positive"), t("aiAtt.veryPositive")];
  const aiTrainingOptions = [t("aiTrain.none"), t("aiTrain.self"), t("aiTrain.workshop"), t("aiTrain.course")];

  const aiUseOptions = [
    { key: "research", label: t("aiUse.research") },
    { key: "writing", label: t("aiUse.writing") },
    { key: "diagnostics", label: t("aiUse.diagnostics") },
    { key: "learning", label: t("aiUse.learning") },
    { key: "coding", label: t("aiUse.coding") },
    { key: "none", label: t("aiUse.none") },
  ];

  const toggleAiUse = (key: string) => {
    if (key === "none") {
      setAiCurrentUse(["none"]);
    } else {
      setAiCurrentUse(prev => {
        const without = prev.filter(k => k !== "none");
        return without.includes(key) ? without.filter(k => k !== key) : [...without, key];
      });
    }
  };

  // Auto-set N/A for specialty and semester when not applicable
  const effectiveSpecialty = showSpecialty ? specialty : [];
  const effectiveSemester = (() => {
    if (experience === t("exp.none") || experience === t("exp.other")) return t("sem.na");
    return semester;
  })();
  const effectiveXrayVolume = xrayExp === t("xray.none") ? t("xrayVol.0") : xrayVolume;
  // The stored country value: use typed name if "Other" selected, otherwise the chip value
  const effectiveCountryValue = isOtherCountry ? (countryOther || t("country.other")) : country;

  const isComplete = time !== null && experience && ageRange && sex && country
    && (!isOtherCountry || countryOther.trim().length > 0)
    && effectiveSemester && xrayExp
    && (xrayExp === t("xray.none") || effectiveXrayVolume)
    && (showSpecialty ? specialty.length > 0 : true)
    && aiGeneral && aiMedicine && aiCurrentUse.length > 0
    && aiKnowledge && aiCdss && aiAttitude && aiTraining && consented;

  const handleBegin = () => {
    if (!isComplete) {
      setShowErrors(true);
      // Scroll to the first error
      setTimeout(() => {
        document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setUserProfile({
      timeAvailable: time!,
      experienceLevel: experience,
      ageRange,
      sex,
      country: effectiveCountryValue,
      semester: effectiveSemester,
      specialty: effectiveSpecialty,
      xrayExperience: xrayExp,
      xrayVolume: effectiveXrayVolume,
      aiUsageGeneral: aiGeneral,
      aiUsageMedicine: aiMedicine,
      aiCurrentUse,
      aiKnowledge,
      aiCdssExperience: aiCdss,
      aiAttitude,
      aiTraining,
      consented,
    });
    initializeCases(time!);
    setScreen("interface-tutorial");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader breadcrumb={t("welcome.background")} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-6 space-y-6">
          {/* Session code banner */}
          {sessionCode && (
            <div className="glass-panel p-4 border-primary/20 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "en" ? "Your Session Code" : "Dein Sitzungscode"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {language === "en"
                  ? "Please write down this code. You can use it to resume your session if you need to take a break or if anything goes wrong."
                  : "Bitte notiere dir diesen Code. Du kannst ihn verwenden, um deine Sitzung fortzusetzen, falls du eine Pause machen musst oder etwas schiefgeht."}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-mono font-bold text-primary tracking-[0.2em]">{sessionCode}</span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1 px-2.5 h-7 rounded bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {codeCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  {codeCopied ? (language === "en" ? "Copied!" : "Kopiert!") : (language === "en" ? "Copy" : "Kopieren")}
                </button>
              </div>
            </div>
          )}

          {/* Time selection */}
          <Field title={t("welcome.time")}>
            <div className="grid grid-cols-3 gap-2">
              {TIME_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = time === opt.mins;
                return (
                  <button
                    key={opt.mins}
                    onClick={() => setTime(opt.mins)}
                    className={`relative flex flex-col items-center gap-1.5 p-4 rounded transition-all duration-200 border ${
                      selected
                        ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                        : "bg-secondary/60 border-transparent hover:border-border hover:bg-secondary"
                    }`}
                  >
                    <Icon className={`w-5 h-5 transition-colors ${selected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-lg font-semibold font-mono transition-colors ${selected ? "text-primary" : "text-foreground"}`}>
                      {opt.mins}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {language === "en" ? "minutes" : "Minuten"}
                    </span>
                    <span className={`text-[10px] font-medium mt-0.5 ${selected ? "text-primary" : "text-muted-foreground"}`}>
                      {opt.label[language]}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">{opt.desc[language]}</span>
                    {selected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground/60 mt-2 text-center italic">
              {language === "en"
                ? "This is an estimate; actual duration may vary depending on your pace."
                : "Dies ist eine Schätzung; die tatsächliche Dauer kann je nach deinem Tempo variieren."}
            </p>
          </Field>

          {/* Medical Background */}
          <Field title={t("welcome.background")}>
            <div className="space-y-4">
              <OptionRow label={t("welcome.experience")} value={experience} options={expOptions} onChange={v => { setExperience(v); setCountry(""); setCountryOther(""); setSemester(""); setSpecialty([]); }} error={showErrors && !experience} language={language} />
              <OptionRow label={t("welcome.ageRange")} value={ageRange} options={ageOptions} onChange={setAgeRange} error={showErrors && !ageRange} language={language} />
              <OptionRow label={t("welcome.sex")} value={sex} options={sexOptions} onChange={setSex} error={showErrors && !sex} language={language} />
              {experience && (
                <div className="space-y-2">
                  <OptionRow label={t("welcome.country")} value={country} options={countryOptions} onChange={v => { setCountry(v); setCountryOther(""); setSemester(""); }} error={showErrors && !country} language={language} />
                  {isOtherCountry && (
                    <select
                      value={countryOther}
                      onChange={e => setCountryOther(e.target.value)}
                      className={`w-full h-9 rounded bg-secondary text-sm text-secondary-foreground px-3 border focus:outline-none focus:ring-1 focus:ring-primary/50 ${showErrors && !countryOther ? "border-destructive" : "border-border"}`}
                    >
                      <option value="">{language === "en" ? "Select country…" : "Land auswählen…"}</option>
                      {ALL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              )}
              {experience && experience !== t("exp.none") && experience !== t("exp.other") && country && (!isOtherCountry || countryOther) && semesterOptions.length > 0 && (
                <OptionRow
                  label={experience === t("exp.resident") ? t("welcome.yearsExp") : t("welcome.semester")}
                  value={semester}
                  options={semesterOptions}
                  onChange={setSemester}
                  error={showErrors && !semester}
                  language={language}
                />
              )}
              {showSpecialty && (() => {
                const specialtyError = showErrors && specialty.length === 0;
                return (
                  <div className="space-y-2" data-error={specialtyError ? "true" : undefined}>
                    <label className={`text-xs font-medium uppercase tracking-wider ${specialtyError ? "text-destructive" : "text-muted-foreground"}`}>
                      {t("welcome.specialty")}{specialtyError && " *"}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {specialtyOptions.map(opt => (
                        <Chip key={opt.key} selected={specialty.includes(opt.key)} onClick={() => toggleSpecialty(opt.key)} error={specialtyError && !specialty.includes(opt.key)}>
                          {specialty.includes(opt.key) && <Check className="w-3 h-3" />}
                          {opt.label}
                        </Chip>
                      ))}
                    </div>
                    {specialtyError && <p className="text-xs text-destructive">{language === "de" ? "Bitte auswählen." : "Please select an option."}</p>}
                  </div>
                );
              })()}
              <OptionRow label={t("welcome.xrayExp")} value={xrayExp} options={xrayOptions} onChange={v => { setXrayExp(v); if (v === t("xray.none")) setXrayVolume(t("xrayVol.0")); else setXrayVolume(""); }} error={showErrors && !xrayExp} language={language} />
              {xrayExp && xrayExp !== t("xray.none") && (
                <OptionRow label={t("welcome.xrayVolume")} value={xrayVolume} options={xrayVolOptions} onChange={setXrayVolume} error={showErrors && !xrayVolume} language={language} />
              )}
            </div>
          </Field>

          {/* AI Experience - expanded */}
          <Field title="AI Experience">
            <div className="space-y-4">
              <OptionRow label={t("welcome.aiKnowledge")} value={aiKnowledge} options={aiKnowledgeOptions} onChange={setAiKnowledge} error={showErrors && !aiKnowledge} language={language} />
              <OptionRow label={t("welcome.aiGeneral")} value={aiGeneral} options={aiGeneralOptions} onChange={setAiGeneral} error={showErrors && !aiGeneral} language={language} />
              <OptionRow label={t("welcome.aiMedicine")} value={aiMedicine} options={aiMedOptions} onChange={setAiMedicine} error={showErrors && !aiMedicine} language={language} />
              <OptionRow label={t("welcome.cdss")} value={aiCdss} options={aiCdssOptions} onChange={setAiCdss} error={showErrors && !aiCdss} language={language} />
              {(() => {
                const aiUseError = showErrors && aiCurrentUse.length === 0;
                return (
                  <div className="space-y-2" data-error={aiUseError ? "true" : undefined}>
                    <label className={`text-xs font-medium uppercase tracking-wider ${aiUseError ? "text-destructive" : "text-muted-foreground"}`}>
                      {t("welcome.aiCurrentUse")}{aiUseError && " *"}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {aiUseOptions.map(opt => (
                        <Chip key={opt.key} selected={aiCurrentUse.includes(opt.key)} onClick={() => toggleAiUse(opt.key)} error={aiUseError && !aiCurrentUse.includes(opt.key)}>
                          {aiCurrentUse.includes(opt.key) && <Check className="w-3 h-3" />}
                          {opt.label}
                        </Chip>
                      ))}
                    </div>
                    {aiUseError && <p className="text-xs text-destructive">{language === "de" ? "Bitte auswählen." : "Please select an option."}</p>}
                  </div>
                );
              })()}
              <OptionRow label={t("welcome.aiTraining")} value={aiTraining} options={aiTrainingOptions} onChange={setAiTraining} error={showErrors && !aiTraining} language={language} />
              <OptionRow label={t("welcome.aiAttitude")} value={aiAttitude} options={aiAttitudeOptions} onChange={setAiAttitude} error={showErrors && !aiAttitude} language={language} />
            </div>
          </Field>

          {/* Consent */}
          <div
            className={`border-t pt-5 ${showErrors && !consented ? "border-destructive" : "border-border"}`}
            data-error={showErrors && !consented ? "true" : undefined}
          >
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className={`mt-0.5 w-5 h-5 rounded-sm flex items-center justify-center shrink-0 transition-all ${
                consented
                  ? "bg-primary"
                  : showErrors
                    ? "border border-destructive"
                    : "border border-muted-foreground/30 group-hover:border-muted-foreground/50"
              }`}>
                {consented && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
              </div>
              <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} className="sr-only" />
              <span className={`text-sm leading-relaxed ${showErrors && !consented ? "text-destructive" : "text-muted-foreground"}`}>
                {t("welcome.consent")}
              </span>
            </label>
            {showErrors && !consented && (
              <p className="text-xs text-destructive mt-1.5 pl-8">{language === "en" ? "Please accept to continue." : "Bitte akzeptiere, um fortzufahren."}</p>
            )}
          </div>

          <button
            onClick={handleBegin}
            className="w-full h-10 rounded text-sm font-medium transition-all bg-primary text-primary-foreground hover:brightness-110"
          >
            {t("welcome.begin")}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.08em]">{title}</h2>
    <div className="glass-panel p-4">{children}</div>
  </div>
);

const OptionRow = ({ label, value, options, onChange, error, language }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  error?: boolean; language?: string;
}) => (
  <div className="space-y-2" data-error={error ? "true" : undefined}>
    <label className={`text-xs font-medium uppercase tracking-wider ${error ? "text-destructive" : "text-muted-foreground"}`}>
      {label}{error && " *"}
    </label>
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <Chip key={opt} selected={value === opt} onClick={() => onChange(opt)} error={error}>{opt}</Chip>
      ))}
    </div>
    {error && (
      <p className="text-xs text-destructive">{language === "de" ? "Bitte auswählen." : "Please select an option."}</p>
    )}
  </div>
);

const Chip = ({ selected, onClick, children, error }: { selected: boolean; onClick: () => void; children: React.ReactNode; error?: boolean }) => (
  <button
    onClick={onClick}
    className={`px-3 h-8 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
      selected
        ? "bg-primary text-primary-foreground"
        : error
          ? "bg-secondary text-destructive border border-destructive/40 hover:bg-accent"
          : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
    }`}
  >
    {children}
  </button>
);

export default WelcomeScreen;
