import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  Calculator,
  ArrowUpRight,
  ShieldAlert,
  FileText,
  AlertTriangle,
  Cpu,
  ShieldCheck,
  HelpCircle,
  Clock
} from 'lucide-react';
import Badge from './Badge';

interface PathEvidence {
  source: string;
  location: string;
  item: string;
}

export interface AiAnalysisData {
  title: string;
  overallConfidence: string;
  numericalConfidence?: number;
  facts: string[];
  calculations: string[];
  recommendations: string[];
  pathEvidence?: PathEvidence[];
  aiProvider?: string;
  modelName?: string;
  isLiveAiConfigured?: boolean;
  verdict?: string;
  completenessScore?: number;
  ambiguitiesDetected?: string[];
  missingEvidenceGaps?: string[];
  timestampConflicts?: Array<{
    issue: string;
    fieldA: string;
    fieldB: string;
    detail: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  quoteValidation?: {
    totalChecked: number;
    validQuotes: number;
    rejectedQuotes: number;
  };
  recoveryQualificationRationale?: string;
  recoveryCaseSummary?: string;
  mathematicalAuthorityNotice?: string;
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
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-slate-200 rounded w-1/3"></div>
          <div className="h-5 bg-slate-200 rounded w-24"></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-100 rounded w-full"></div>
          <div className="h-3 bg-slate-100 rounded w-4/5"></div>
          <div className="h-3 bg-slate-100 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const isLive = analysis.isLiveAiConfigured ?? false;
  const provider = analysis.aiProvider || (isLive ? 'Google Gemini' : 'Deterministic Engine');
  const model = analysis.modelName || (isLive ? 'gemini-3.5-flash' : 'rule-engine-v2');

  return (
    <div className={`bg-[#FAFBFD] border border-[#D5D3FF] rounded-xl overflow-hidden shadow-subtle ${className || ''}`}>
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#EEEDFF] via-[#F6F8FC] to-white px-5 py-3.5 border-b border-[#E0DEFF] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs ${isLive ? 'bg-primary' : 'bg-slate-700'}`}>
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-neutral-primary uppercase tracking-wider">
                {analysis.title}
              </h4>
              <Badge variant={isLive ? 'indigo' : 'neutral'} size="sm">
                {isLive ? `Live AI: ${model}` : `Deterministic Fallback`}
              </Badge>
            </div>
            <p className="text-[11px] text-neutral-secondary">
              {isLive ? `${provider} Structured Inference` : 'High-Precision Deterministic Semantic Parser'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {typeof analysis.completenessScore === 'number' && (
            <Badge
              variant={analysis.completenessScore >= 80 ? 'success' : analysis.completenessScore >= 50 ? 'warning' : 'danger'}
              size="sm"
            >
              Evidence: {analysis.completenessScore}%
            </Badge>
          )}
          <Badge variant="indigo" size="sm" dot>
            AI Confidence: {analysis.overallConfidence}
          </Badge>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Timestamp Conflicts Alert */}
        {analysis.timestampConflicts && analysis.timestampConflicts.length > 0 && (
          <div className="bg-[#FFF5E5] border border-[#FFE7BA] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D99124]">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span>FORENSIC TELEMETRY TIMESTAMP CONFLICT DETECTED ({analysis.timestampConflicts.length})</span>
            </div>
            {analysis.timestampConflicts.map((c, idx) => (
              <p key={idx} className="text-xs text-[#9254DE] font-mono pl-5">
                • {c.issue}: {c.detail}
              </p>
            ))}
          </div>
        )}

        {/* Ambiguities or Missing Evidence Alert */}
        {analysis.ambiguitiesDetected && analysis.ambiguitiesDetected.length > 0 && (
          <div className="bg-[#FFFBF0] border border-[#FFE7BA] rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D99124]">
              <HelpCircle className="w-4 h-4 text-warning" />
              <span>CONTRACTUAL AMBIGUITY DETECTED</span>
            </div>
            {analysis.ambiguitiesDetected.map((amb, idx) => (
              <p key={idx} className="text-xs text-[#595959] pl-5">
                • {amb}
              </p>
            ))}
          </div>
        )}

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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-primary">
              <Calculator className="w-3.5 h-3.5 text-primary" />
              <span>DETERMINISTIC CALCULATION & CLAUSE FORMULA</span>
            </div>
            <span className="text-[10px] text-neutral-secondary font-mono">
              Engine: slaEngine.ts
            </span>
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
            <span>ACTIONABLE AI RECOMMENDATIONS</span>
          </div>
          <div className="space-y-2">
            {analysis.recommendations.map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-[#1E293B] bg-[#FFFBF0] border border-[#FFE7BA] p-2.5 rounded-lg">
                <span className="w-4 h-4 rounded-full bg-[#D99124] text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{rec}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Quotation Validation Summary (if available) */}
        {analysis.quoteValidation && (
          <div className="bg-white border border-[#E8ECF2] rounded-lg p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span className="font-semibold text-neutral-primary">Verbatim Quote Verification:</span>
              <span className="text-neutral-secondary">
                {analysis.quoteValidation.validQuotes} / {analysis.quoteValidation.totalChecked} quotes verified in original text
              </span>
            </div>
            {analysis.quoteValidation.rejectedQuotes > 0 ? (
              <Badge variant="danger" size="sm">
                {analysis.quoteValidation.rejectedQuotes} Unsupported Quotes
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                100% Authenticated
              </Badge>
            )}
          </div>
        )}

        {/* Section 5: Visible Path to Evidence */}
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

        {/* Bottom Authority Disclaimer */}
        <div className="pt-2 text-[10px] text-neutral-secondary italic border-t border-slate-100 flex items-center gap-1">
          <Cpu className="w-3 h-3 text-slate-400 shrink-0" />
          <span>
            {analysis.mathematicalAuthorityNotice ||
              'Deterministic SLA engine (slaEngine.ts) remains strictly authoritative. AI provides interpretation and audit guidance.'}
          </span>
        </div>
      </div>
    </div>
  );
}
