'use client';

import React, { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { SLAClause, VerificationStatus } from '@/types';
import { CheckCircle2, AlertTriangle, Sparkles, UserCheck, Edit3 } from 'lucide-react';

interface ContractClauseVerificationProps {
  contractId: string;
  clauses: SLAClause[];
  onClauseUpdated: (updatedContract?: any) => void;
}

export default function ContractClauseVerification({
  contractId,
  clauses,
  onClauseUpdated
}: ContractClauseVerificationProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<{ [clauseId: string]: string }>({});

  const handleVerifyClause = async (clauseId: string, status: VerificationStatus) => {
    setUpdatingId(clauseId);
    setErrorMsg(null);
    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clauseId,
          status,
          notes: activeNotes[clauseId] || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        setErrorMsg(null);
        onClauseUpdated(data.contract);
      } else {
        setErrorMsg(data.error || 'Failed to update clause verification status.');
      }
    } catch (err: any) {
      console.error('Failed to verify clause:', err);
      setErrorMsg(err.message || 'Network error updating clause status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: VerificationStatus, confidence: number) => {
    switch (status) {
      case 'human_verified':
        return (
          <Badge variant="success" size="sm" dot>
            Human Verified
          </Badge>
        );
      case 'ai_extracted':
        return (
          <Badge variant="indigo" size="sm" dot>
            AI Extracted ({(confidence * 100).toFixed(0)}%)
          </Badge>
        );
      case 'requires_review':
        return (
          <Badge variant="warning" size="sm" dot>
            Requires Legal Review
          </Badge>
        );
      case 'unverified':
        return (
          <Badge variant="danger" size="sm" dot>
            UNVERIFIED (Unsupported)
          </Badge>
        );
    }
  };

  const verifiedCount = clauses.filter(c => c.status === 'human_verified' || (c.status as string) === 'verified').length;
  const verifiedPercentage = clauses.length > 0 ? Math.round((verifiedCount / clauses.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-neutral-primary uppercase tracking-wider">
            Clause-Level Verification Registry
          </h4>
          <p className="text-[11px] text-neutral-secondary">
            Financial & legal accountability: Every extracted commitment must be countersigned.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {clauses.some(c => c.status === 'unverified') && (
            <Badge variant="danger" size="sm">
              Unsupported Clause Detected
            </Badge>
          )}
          <span className="text-xs text-neutral-secondary font-mono">
            {verifiedCount} / {clauses.length} Human Verified ({verifiedPercentage}%)
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-[#FFF5F5] border border-[#FEB2B2] rounded-lg text-xs text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-danger" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="space-y-3">
        {clauses.map((clause) => {
          const isPending = updatingId === clause.id;

          return (
            <div
              key={clause.id}
              className={`p-4 rounded-xl border transition-all ${
                clause.status === 'human_verified'
                  ? 'bg-white border-[#C3EAD9]/80 shadow-xs'
                  : clause.status === 'unverified'
                  ? 'bg-[#FFF5F5] border-[#FEB2B2]'
                  : clause.status === 'requires_review'
                  ? 'bg-[#FFFBF5] border-[#FFD591]'
                  : 'bg-[#F9FAFC] border-neutral-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary px-1.5 py-0.5 bg-primary-light rounded">
                      {clause.section}
                    </span>
                    <span className="text-xs font-semibold text-neutral-primary">
                      {clause.title}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {getStatusBadge(clause.status, clause.confidence)}
                </div>
              </div>

              {/* Clause Source Quotation & AI Interpretation (Visibly Distinguished) */}
              <div className="mt-2.5 space-y-2">
                {clause.exactSourceQuote && (
                  <div className="p-3 bg-[#F8FAFC] border-l-4 border-primary border-y border-r border-[#E2E8F0] rounded-r-lg font-serif text-xs text-[#0F172A] leading-relaxed shadow-xs">
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <span className="text-[10px] font-sans uppercase font-bold text-neutral-secondary tracking-wider">
                        Verbatim Source Quotation (PDF Substring):
                      </span>
                      {clause.isFabricatedOrUnsupported ? (
                        <span className="text-[10px] font-sans font-bold text-danger bg-danger-light px-2 py-0.5 rounded border border-danger/30">
                          Quote Authentication: FAILED (Not Found in PDF)
                        </span>
                      ) : (
                        <span className="text-[10px] font-sans font-semibold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded border border-[#A7F3D0]">
                          Quote Authentication: Verified Substring
                        </span>
                      )}
                    </div>
                    “{clause.exactSourceQuote}”
                  </div>
                )}
                <div className="p-3 bg-[#FAF5FF] border border-[#E9D8FD] rounded-lg text-xs text-[#3B0764] leading-relaxed">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#7C3AED]" />
                    <span className="text-[10px] font-sans uppercase font-bold text-[#6B21A8] tracking-wider">
                      AI Legal Interpretation (Derived from Document):
                    </span>
                  </div>
                  {clause.content}
                </div>
              </div>

              {/* Notes / Fabricated Alert */}
              {clause.notes && (
                <div className="mt-2 p-2 bg-warning-light text-warning-dark text-[11px] rounded border border-warning/20">
                  {clause.notes}
                </div>
              )}

              {/* Verification Info / Action */}
              <div className="mt-3 pt-2.5 border-t border-neutral-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                {clause.verifiedBy ? (
                  <div className="flex items-center gap-1.5 text-neutral-secondary">
                    <UserCheck className="w-3.5 h-3.5 text-success" />
                    <span>
                      Verified by <strong className="text-neutral-primary">{clause.verifiedBy}</strong> on{' '}
                      {new Date(clause.verifiedAt!).toLocaleDateString()}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Unconfirmed AI extraction. Review against original PDF.</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {clause.status !== 'human_verified' && (
                    <Button
                      variant="success"
                      size="sm"
                      loading={isPending}
                      onClick={() => handleVerifyClause(clause.id, 'human_verified')}
                      icon={<CheckCircle2 className="w-3 h-3" />}
                    >
                      Verify Clause
                    </Button>
                  )}

                  {clause.status !== 'requires_review' && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={isPending}
                      onClick={() => handleVerifyClause(clause.id, 'requires_review')}
                    >
                      Flag for Review
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
