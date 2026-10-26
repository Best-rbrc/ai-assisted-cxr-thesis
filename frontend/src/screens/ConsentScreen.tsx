import { useState } from "react";
import { ShieldCheck, ChevronRight, FileText, Lock, AlertCircle } from "lucide-react";
import { useStudy } from "@/context/useStudy";
import SystemHeader from "@/components/SystemHeader";

const ConsentScreen = () => {
  const { setScreen, language, t } = useStudy();
  const [checks, setChecks] = useState([false, false, false, false]);

  const allChecked = checks.every(Boolean);

  const toggle = (idx: number) =>
    setChecks(prev => prev.map((v, i) => (i === idx ? !v : v)));

  const items = language === "en"
    ? [
        "I have read and understood the study information above.",
        "I understand that my participation is voluntary and I can withdraw at any time without consequences.",
        "I consent to the anonymous collection and scientific use of my responses.",
        "I understand that my data will be stored anonymously and cannot be linked to my identity.",
      ]
    : [
        "Ich habe die obigen Studieninformationen gelesen und verstanden.",
        "Ich verstehe, dass meine Teilnahme freiwillig ist und ich jederzeit ohne Konsequenzen abbrechen kann.",
        "Ich stimme der anonymen Erhebung und wissenschaftlichen Nutzung meiner Antworten zu.",
        "Ich verstehe, dass meine Daten anonym gespeichert werden und nicht mit meiner Identität verknüpft werden können.",
      ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHeader breadcrumb={language === "en" ? "Informed Consent" : "Einwilligungserklärung"} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-6 space-y-5 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {language === "en" ? "Informed Consent" : "Einwilligungserklärung"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {language === "en" ? "Please read carefully before proceeding" : "Bitte sorgfältig lesen, bevor Sie fortfahren"}
              </p>
            </div>
          </div>

          {/* Study info */}
          <div className="glass-panel p-4 sm:p-5 space-y-4 text-sm text-muted-foreground leading-relaxed">
            <Section
              icon={<FileText className="w-4 h-4 text-primary" />}
              title={language === "en" ? "Purpose & Procedure" : "Zweck & Ablauf"}
            >
              {language === "en"
                ? "This study investigates how AI-generated predictions and visual explanations (heatmaps) influence diagnostic decisions when reading chest X-rays. You will review a series of X-ray images, provide your clinical assessment, and in some cases see AI model predictions before finalizing your answer. In some conditions, you will see heatmaps highlighting where the AI model focuses its attention; these show where the model looks, not what it predicts. The study takes approximately 10-30 minutes depending on your selected time budget."
                : "Diese Studie untersucht, wie KI-generierte Vorhersagen und visuelle Erklärungen (Heatmaps) diagnostische Entscheidungen bei der Befundung von Röntgen-Thorax-Aufnahmen beeinflussen. Sie werden eine Reihe von Röntgenbildern beurteilen, Ihre klinische Einschätzung abgeben und in einigen Fällen KI-Modellvorhersagen sehen, bevor Sie Ihre Antwort abschließen. In einigen Bedingungen sehen Sie Heatmaps, die zeigen, worauf das KI-Modell seine Aufmerksamkeit richtet; diese zeigen, wo das Modell hinschaut, nicht was es vorhersagt. Die Studie dauert je nach gewähltem Zeitbudget ca. 10-30 Minuten."}
            </Section>

            <Section
              icon={<Lock className="w-4 h-4 text-primary" />}
              title={language === "en" ? "Data Handling (GDPR)" : "Datenschutz (DSGVO)"}
            >
              {language === "en"
                ? "All data is collected anonymously. We record your responses, timing data, and self-reported experience level. No personally identifiable information (name, IP address, email) is collected during the study. Your session is identified only by a random code. Data is stored on encrypted servers within the EU and used exclusively for scientific research purposes."
                : "Alle Daten werden anonym erhoben. Wir erfassen Ihre Antworten, Zeitdaten und selbst eingeschätzte Erfahrungsstufe. Während der Studie werden keine personenbezogenen Daten (Name, IP-Adresse, E-Mail) erhoben. Ihre Sitzung wird nur durch einen zufälligen Code identifiziert. Die Daten werden auf verschlüsselten Servern innerhalb der EU gespeichert und ausschließlich für wissenschaftliche Forschungszwecke verwendet."}
            </Section>

            <Section
              icon={<ShieldCheck className="w-4 h-4 text-primary" />}
              title={language === "en" ? "Your Rights" : "Ihre Rechte"}
            >
              {language === "en"
                ? "Participation is entirely voluntary. You may withdraw at any time without giving a reason and without any negative consequences. Since data is collected anonymously, deletion of individual responses after submission is technically not possible."
                : "Die Teilnahme ist vollständig freiwillig. Sie können jederzeit ohne Angabe von Gründen und ohne negative Konsequenzen abbrechen. Da die Daten anonym erhoben werden, ist eine Löschung einzelner Antworten nach der Übermittlung technisch nicht möglich."}
            </Section>

            <Section
              icon={<AlertCircle className="w-4 h-4 text-primary" />}
              title={language === "en" ? "Research Context" : "Forschungskontext"}
            >
              {language === "en"
                ? "This study is conducted as part of a bachelor's thesis at the University of St. Gallen. For questions or concerns, please contact: benjamin.stieger@student.unisg.ch"
                : "Diese Studie wird im Rahmen einer Bachelorarbeit an der Universität St. Gallen durchgeführt. Bei Fragen oder Bedenken wenden Sie sich bitte an: benjamin.stieger@student.unisg.ch"}
            </Section>
          </div>

          {/* Consent checkboxes */}
          <div className="glass-panel p-4 sm:p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {language === "en" ? "Please confirm each statement" : "Bitte bestätigen Sie jede Aussage"}
            </p>
            {items.map((text, idx) => (
              <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-sm flex items-center justify-center shrink-0 transition-all ${
                    checks[idx]
                      ? "bg-primary"
                      : "border border-muted-foreground/30 group-hover:border-muted-foreground/50"
                  }`}
                >
                  {checks[idx] && (
                    <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={checks[idx]} onChange={() => toggle(idx)} className="sr-only" />
                <span className="text-sm text-muted-foreground leading-relaxed">{text}</span>
              </label>
            ))}
          </div>

          <button
            onClick={() => setScreen("welcome")}
            disabled={!allChecked}
            className="w-full h-10 rounded text-sm font-medium transition-all bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {language === "en" ? "I Agree · Continue" : "Ich stimme zu · Weiter"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    <p className="pl-6">{children}</p>
  </div>
);

export default ConsentScreen;
