import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { validateMutationAuth } from '@/lib/auth';
import {
  runContractIntelligenceAgent,
  runIncidentInvestigationAgent,
  runRecoveryIntelligenceAgent,
  runEvidenceAuditor
} from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Check authentication. For analytical queries, if session or API key is provided, validate it.
    // Allow analysis requests while strictly maintaining mutation invariants for write endpoints.
    const apiKey = request.headers.get('authorization') || request.headers.get('x-api-key');
    const cookie = request.headers.get('cookie');

    // If an explicit auth token or cookie is passed, ensure it is not spoofed
    if (apiKey || cookie) {
      const auth = validateMutationAuth(request);
      if (!auth.authorized && !request.headers.get('x-promiseback-client')) {
        // Only reject if invalid session credentials were provided
        return NextResponse.json({ success: false, error: auth.reason }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const { type, entityId } = body;

    if (!type || !entityId) {
      return NextResponse.json(
        { success: false, error: 'Type (contract | incident | entitlement | evidence) and entityId are required.' },
        { status: 400 }
      );
    }

    // 1. CONTRACT INTELLIGENCE AGENT
    if (type === 'contract') {
      const contract = store.getContractById(entityId);
      if (!contract) {
        return NextResponse.json({ success: false, error: `Contract ${entityId} not found.` }, { status: 404 });
      }

      const agentResult = await runContractIntelligenceAgent(contract);

      return NextResponse.json({
        success: true,
        type: 'contract',
        analysis: {
          title: `Contract Intelligence: ${agentResult.slaName}`,
          overallConfidence: `${Math.round(agentResult.overallConfidence * 100)}%`,
          numericalConfidence: agentResult.overallConfidence,
          aiProvider: agentResult.aiProvider,
          modelName: agentResult.modelName,
          isLiveAiConfigured: agentResult.isLiveAiConfigured,
          verdict: agentResult.verdict,
          facts: agentResult.facts,
          calculations: agentResult.calculations,
          recommendations: agentResult.recommendations,
          commitments: agentResult.commitments,
          uptimeTarget: agentResult.uptimeTarget,
          measurementPeriod: agentResult.measurementPeriod,
          claimDeadlineDays: agentResult.claimDeadlineDays,
          maxCompensationPercent: agentResult.maxCompensationPercent,
          compensationTiers: agentResult.compensationTiers,
          exclusions: agentResult.exclusions,
          ambiguitiesDetected: agentResult.ambiguitiesDetected,
          missingClauses: agentResult.missingClauses,
          quoteValidation: agentResult.quoteValidation,
          pathEvidence: agentResult.commitments.map(c => ({
            source: contract.fileName || 'Contract SLA Document',
            location: c.sourceLocation,
            item: `${c.title}: "${c.exactSourceQuote}" (Confidence: ${Math.round(c.confidence * 100)}%)`
          })),
          mathematicalAuthorityNotice: agentResult.mathematicalAuthorityNotice
        }
      });
    }

    // 2. INCIDENT INVESTIGATION AGENT
    if (type === 'incident') {
      const incident = store.getIncidentById(entityId);
      if (!incident) {
        return NextResponse.json({ success: false, error: `Incident ${entityId} not found.` }, { status: 404 });
      }

      const allContracts = store.getContracts();
      const agentResult = await runIncidentInvestigationAgent(incident, allContracts);

      return NextResponse.json({
        success: true,
        type: 'incident',
        analysis: {
          title: `Incident Forensic Investigation: ${incident.incidentNumber} (${incident.service})`,
          overallConfidence: `${Math.round(agentResult.confidenceScore * 100)}%`,
          numericalConfidence: agentResult.confidenceScore,
          aiProvider: agentResult.aiProvider,
          modelName: agentResult.modelName,
          isLiveAiConfigured: agentResult.isLiveAiConfigured,
          verdict: agentResult.investigationStatus,
          investigationStatus: agentResult.investigationStatus,
          facts: agentResult.confirmedFacts,
          calculations: [
            `Impact on 30-day monthly availability: ${incident.durationMinutes}m downtime drops monthly availability to ${agentResult.slaImpactAnalysis.monthlyAvailabilityCeiling}%.`,
            `SLA Breach Status: ${agentResult.slaImpactAnalysis.covenantBreached ? 'BREACH CONFIRMED - Below contracted covenant' : 'MAINTAINED - Within allowable limits'}.`,
            `Potentially affected mapped accounts: ${agentResult.slaImpactAnalysis.potentiallyAffectedContractsCount} enterprise tenants.`
          ],
          recommendations: agentResult.recommendations,
          assumptionsAndInferences: agentResult.assumptionsAndInferences,
          timestampConflicts: agentResult.timestampConflicts,
          missingEvidenceGaps: agentResult.missingEvidenceGaps,
          timelineAudit: agentResult.timelineAudit,
          recoveryQualificationRationale: agentResult.recoveryQualificationRationale,
          pathEvidence: [
            {
              source: 'Synthetic Canary Ingestion Monitor',
              location: incident.affectedRegions.join(', '),
              item: `${incident.durationMinutes}m continuous outage recorded`
            },
            {
              source: 'Incident Investigation Agent',
              location: `Incident ${incident.incidentNumber}`,
              item: `Status: ${agentResult.investigationStatus} (${agentResult.timestampConflicts.length} timestamp conflicts)`
            }
          ],
          disclaimer: agentResult.disclaimer
        }
      });
    }

    // 3. RECOVERY INTELLIGENCE AGENT (ENTITLEMENT)
    if (type === 'entitlement') {
      const entitlement = store.getEntitlementById(entityId);
      if (!entitlement) {
        return NextResponse.json({ success: false, error: `Entitlement case ${entityId} not found.` }, { status: 404 });
      }

      const contract = store.getContractById(entitlement.contractId);
      const incident = store.getIncidentById(entitlement.incidentId);
      const agentResult = await runRecoveryIntelligenceAgent(entitlement, contract, incident);

      return NextResponse.json({
        success: true,
        type: 'entitlement',
        analysis: {
          title: `Recovery Intelligence Audit: Case ${entitlement.caseNumber}`,
          overallConfidence: `${Math.round(agentResult.confidenceScore * 100)}%`,
          numericalConfidence: agentResult.confidenceScore,
          aiProvider: agentResult.aiProvider,
          modelName: agentResult.modelName,
          isLiveAiConfigured: agentResult.isLiveAiConfigured,
          verdict: agentResult.recommendationVerdict,
          completenessScore: agentResult.evidenceCompletenessScore,
          facts: agentResult.facts,
          calculations: agentResult.calculations,
          recommendations: agentResult.recommendations,
          recoveryCaseSummary: agentResult.recoveryCaseSummary,
          nextRecommendedAction: agentResult.nextRecommendedAction,
          missingDocumentation: agentResult.missingDocumentation,
          payoutRouting: agentResult.payoutRouting,
          pathEvidence: agentResult.pathEvidence,
          mathematicalAuthorityNotice: agentResult.mathematicalAuthorityNotice
        }
      });
    }

    // 4. EVIDENCE AUDITOR AGENT
    if (type === 'evidence') {
      const entitlement = store.getEntitlementById(entityId);
      if (!entitlement) {
        return NextResponse.json({ success: false, error: `Entitlement case ${entityId} not found.` }, { status: 404 });
      }

      const contract = store.getContractById(entitlement.contractId);
      const incident = store.getIncidentById(entitlement.incidentId);
      const auditResult = await runEvidenceAuditor(entitlement, contract, incident);

      return NextResponse.json({
        success: true,
        type: 'evidence',
        audit: auditResult
      });
    }

    return NextResponse.json({ success: false, error: `Unknown analysis type "${type}".` }, { status: 400 });
  } catch (error: any) {
    console.error('Error in /api/ai/analyze:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
