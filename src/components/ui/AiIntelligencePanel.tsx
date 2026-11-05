import React from 'react';
import { Sparkles, CheckCircle2, Calculator, ArrowUpRight, ShieldAlert, FileText } from 'lucide-react';
import Badge from './Badge';

interface PathEvidence {
  source: string;
  location: string;
  item: string;
}

interface AiAnalysisData {
  title: string;
  overallConfidence: string;
  facts: string[];
  calculations: string[];
  recommendations: string[];
  pathEvidence?: PathEvidence[];
}

interface AiIntelligencePanelProps {
  analysis: AiAnalysisData;
  loading?: boolean;
  className?: string;
}

export default function AiIntelligencePanel({
  analysis,
  loading = false,
  className
}: AiIntelligencePanelProps) {
  if (loading) {
    return (
      <div className="bg-white border border-neutral-border rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-100 rounded w-full"></div>
          <div className="h-3 bg-slate-100 rounded w-4/5"></div>
          <div className="h-3 bg-slate-100 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#FAFBFD] border border-[#D5D3FF] rounded-xl overflow-hidden shadow-subtle ${className || ''}`}>
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#EEEDFF] via-[#F6F8FC] to-white px-5 py-3.5 border-b border-[#E0DEFF] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-neutral-primary uppercase tracking-wider">
              {analysis.title}
            </h4>
            <p className="text-[11px] text-neutral-secondary">
              Deterministic Contract & Telemetry Intelligence
            </p>
          </div>
        </div>
        <Badge variant="indigo" size="sm" dot>
          AI Confidence: {analysis.overallConfidence}
        </Badge>
      </div>

      <div className="p-5 space-y-4">
        {/* Section 1: Facts */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-primary mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span>CONTRACTUAL & TELEMETRY FACTS</span>
          </div>
          <ul className="space-y-1.5 pl-5 list-disc text-xs text-neutral-secondary marker:text-neutral-muted">
            {analysis.facts.map((fact, idx) => (
              <li key={idx} className="leading-relaxed text-[#334155]">{fact}</li>
            ))}
          </ul>
        </div>

        {/* Section 2: Calculations */}
        <div className="bg-white border border-[#E8ECF2] rounded-lg p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-primary mb-2">
            <Calculator className="w-3.5 h-3.5 text-primary" />
            <span>CALCULATION LOGIC & FORMULA</span>
          </div>
          <div className="space-y-1.5">
            {analysis.calculations.map((calc, idx) => (
              <div key={idx} className="text-xs font-mono bg-[#F8FAFC] px-2.5 py-1.5 rounded border border-[#E2E8F0] text-[#1E293B]">
                {calc}
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Recommendations */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-primary mb-2">
            <ShieldAlert className="w-3.5 h-3.5 text-warning" />
            <span>ACTIONABLE RECOMMENDATIONS</span>
          </div>
          <div className="space-y-2">
            {analysis.recommendations.map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-[#1E293B] bg-[#FFFBF0] border border-[#FFE7BA] p-2.5 rounded-lg">
                <span className="w-4 h-4 rounded-full bg-[#D99124] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{rec}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Visible Path to Evidence */}
        {analysis.pathEvidence && analysis.pathEvidence.length > 0 && (
          <div className="pt-3 border-t border-neutral-border">
            <div className="text-[11px] font-semibold text-neutral-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span>Visible Path to Supporting Information</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {analysis.pathEvidence.map((ev, idx) => (
                <div key={idx} className="bg-white border border-neutral-border rounded p-2 text-[11px] flex items-center justify-between">
                  <div className="truncate">
                    <span className="font-semibold text-neutral-primary">{ev.source}</span>
                    <span className="text-neutral-secondary block text-[10px] truncate">{ev.location} • {ev.item}</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-neutral-muted shrink-0 ml-1" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
