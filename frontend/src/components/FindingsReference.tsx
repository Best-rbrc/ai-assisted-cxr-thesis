import { useState } from "react";
import { X, Brain } from "lucide-react";

import cardiomegalyImg from "@/assets/findings/cardiomegaly.jpg";
import edemaImg from "@/assets/findings/edema.jpg";
import consolidationImg from "@/assets/findings/consolidation.jpg";
import atelectasisImg from "@/assets/findings/atelectasis.jpg";
import pleuralEffusionImg from "@/assets/findings/pleural_effusion.png";
import pneumothoraxImg from "@/assets/findings/pneumothorax.jpg";

interface FindingsReferenceProps {
  language: "en" | "de";
  onClose: () => void;
}

const FINDINGS = [
  { id: "cardiomegaly", color: "hsl(0, 70%, 60%)", img: cardiomegalyImg },
  { id: "edema", color: "hsl(200, 70%, 60%)", img: edemaImg },
  { id: "consolidation", color: "hsl(30, 70%, 60%)", img: consolidationImg },
  { id: "atelectasis", color: "hsl(270, 70%, 60%)", img: atelectasisImg },
  { id: "pleural_effusion", color: "hsl(160, 70%, 60%)", img: pleuralEffusionImg },
  { id: "pneumothorax", color: "hsl(50, 70%, 60%)", img: pneumothoraxImg },
];

const labels: Record<string, { en: string; de: string }> = {
  "cardiomegaly": { en: "Cardiomegaly", de: "Kardiomegalie" },
  "cardiomegaly.desc": { en: "Enlarged heart silhouette", de: "Vergrößerte Herzsilhouette" },
  "cardiomegaly.detail": { en: "The cardiac silhouette occupies more than 50% of the thoracic width on a PA view. Often associated with heart failure, pericardial effusion, or cardiomyopathy.", de: "Die Herzsilhouette nimmt mehr als 50% der Thoraxbreite in der PA-Aufnahme ein. Steht häufig im Zusammenhang mit Herzinsuffizienz, Perikarderguss oder Kardiomyopathie." },
  "edema": { en: "Pulmonary Edema", de: "Lungenödem" },
  "edema.desc": { en: "Fluid in the lungs", de: "Flüssigkeit in der Lunge" },
  "edema.detail": { en: "Fluid accumulation in the lung tissue. Look for cephalization of vessels, peribronchial cuffing, Kerley B lines, and bilateral ground-glass opacities.", de: "Flüssigkeitsansammlung im Lungengewebe. Achte auf Gefäßumverteilung, peribronchiale Verdickung, Kerley-B-Linien und bilaterale Milchglastrübungen." },
  "consolidation": { en: "Consolidation", de: "Konsolidierung" },
  "consolidation.desc": { en: "Dense opacity in lung tissue", de: "Dichte Verschattung im Lungengewebe" },
  "consolidation.detail": { en: "Air spaces filled with fluid, pus, or cells appearing as dense white areas. May include air bronchograms. Common in pneumonia and acute respiratory distress.", de: "Lufträume gefüllt mit Flüssigkeit, Eiter oder Zellen als dichte weiße Bereiche. Kann Luftbronchogramme enthalten. Häufig bei Pneumonie und akutem Atemnotsyndrom." },
  "atelectasis": { en: "Atelectasis", de: "Atelektase" },
  "atelectasis.desc": { en: "Partial lung collapse", de: "Teilweiser Lungenkollaps" },
  "atelectasis.detail": { en: "Collapse or incomplete expansion of lung tissue. Signs include volume loss, shift of fissures, elevation of hemidiaphragm, and mediastinal shift toward the affected side.", de: "Kollaps oder unvollständige Ausdehnung von Lungengewebe. Zeichen umfassen Volumenverlust, Fissurverschiebung, Zwerchfellhochstand und Mediastinalverschiebung zur betroffenen Seite." },
  "pleural_effusion": { en: "Pleural Effusion", de: "Pleuraerguss" },
  "pleural_effusion.desc": { en: "Fluid around the lungs", de: "Flüssigkeit um die Lunge" },
  "pleural_effusion.detail": { en: "Fluid between the visceral and parietal pleura. Appears as blunting of costophrenic angles (small effusion) or a meniscus sign with white-out of the lower hemithorax (large effusion).", de: "Flüssigkeit zwischen viszeraler und parietaler Pleura. Zeigt sich als Verschattung der kostodiaphragmalen Winkel (kleiner Erguss) oder als Meniskuszeichen mit Verschattung des unteren Hemithorax (großer Erguss)." },
  "pneumothorax": { en: "Pneumothorax", de: "Pneumothorax" },
  "pneumothorax.desc": { en: "Air in the pleural space", de: "Luft im Pleuraspalt" },
  "pneumothorax.detail": { en: "Air between the lung and chest wall. Look for a thin visceral pleural line with absent lung markings beyond it, usually best seen at the apex. Can range from a subtle apical sliver to complete lung collapse.", de: "Luft zwischen Lunge und Brustwand. Achte auf eine dünne viszerale Pleuralinie ohne Lungenzeichnung dahinter, meist apikal am besten sichtbar. Kann von einem dezenten apikalen Streifen bis zum kompletten Lungenkollaps reichen." },
  title: { en: "Findings Reference", de: "Befund-Referenz" },
  placeholder: { en: "Example X-ray will be shown here", de: "Beispiel-Röntgenbild wird hier angezeigt" },
};

const t = (key: string, lang: "en" | "de") => labels[key]?.[lang] ?? key;

const FindingsReference = ({ language, onClose }: FindingsReferenceProps) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel p-5 sm:p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">{t("title", language)}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-2">
          {FINDINGS.map(f => (
            <button
              key={f.id}
              onClick={() => setExpanded(expanded === f.id ? null : f.id)}
              className="w-full text-left glass-panel p-3 hover:bg-secondary/50 transition-colors rounded"
            >
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: f.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t(f.id, language)}</p>
                  <p className="text-xs text-muted-foreground">{t(`${f.id}.desc`, language)}</p>
                  
                  {expanded === f.id && (
                    <div className="mt-3 space-y-2 animate-fade-in">
                      <p className="text-xs text-muted-foreground leading-relaxed">{t(`${f.id}.detail`, language)}</p>
                      <div className="rounded overflow-hidden border border-border">
                        <img src={f.img} alt={t(f.id, language)} className="w-full h-auto" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FindingsReference;
