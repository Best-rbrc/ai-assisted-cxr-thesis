import { Check } from "lucide-react";

interface StudyCheckboxProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}

const StudyCheckbox = ({ checked, onChange, label, description }: StudyCheckboxProps) => (
  <button
    type="button"
    onClick={onChange}
    className={`w-full flex items-center gap-3 px-3 py-3 rounded text-left transition-all duration-150 ${
      checked
        ? "bg-primary/10 border border-primary/25 ring-1 ring-primary/10"
        : "bg-secondary/60 border border-transparent hover:border-border hover:bg-secondary"
    }`}
  >
    <div
      className={`w-4 h-4 rounded-sm flex items-center justify-center shrink-0 transition-all ${
        checked ? "bg-primary" : "border border-muted-foreground/30"
      }`}
    >
      {checked && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
    </div>
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground leading-tight">{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>}
    </div>
  </button>
);

export default StudyCheckbox;
