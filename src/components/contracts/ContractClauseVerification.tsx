'use client';

import React, { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { SLAClause, VerificationStatus } from '@/types';
import { CheckCircle2, AlertTriangle, Sparkles, UserCheck, Edit3 } from 'lucide-react';

interface ContractClauseVerificationProps {
  contractId: string;
  clauses: SLAClause[];
  onClauseUpdated: () => void;
}

export default function ContractClauseVerification({
  contractId,
  clauses,
  onClauseUpdated
}: ContractClauseVerificationProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<{ [clauseId: string]: string }>({});

  const handleVerifyClause = async (clauseId: string, status: VerificationStatus) => {
    setUpdatingId(clauseId);
    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clauseId,
          status,
          verifiedBy: 'Elena Rostova (Compliance Lead)',
          notes: activeNotes[clauseId] || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        onClauseUpdated();
      }
    } catch (err) {
      console.error('Failed to verify clause:', err);
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
    }
  };

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
        <span className="text-xs text-neutral-secondary font-mono">
          {clauses.filter(c => c.status === 'human_verified').length} / {clauses.length} Verified
        </span>
      </div>

      <div className="space-y-3">
        {clauses.map((clause) => {
          const isPending = updatingId === clause.id;

          return (
            <div
              key={clause.id}
              className={`p-4 rounded-xl border transition-all ${
                clause.status === 'human_verified'
                  ? 'bg-white border-[#C3EAD9]/80 shadow-xs'
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

              {/* Clause Legal Text */}
              <div className="mt-2.5 p-3 bg-white border border-[#E2E8F0] rounded-lg font-serif text-xs text-[#1E293B] leading-relaxed">
                “{clause.content}”
              </div>

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
