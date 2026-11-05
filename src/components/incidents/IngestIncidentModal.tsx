'use client';

import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { AlertTriangle, Server, Clock } from 'lucide-react';

interface IngestIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIncidentIngested: () => void;
}

export default function IngestIncidentModal({
  isOpen,
  onClose,
  onIncidentIngested
}: IngestIncidentModalProps) {
  const [service, setService] = useState('Payment Gateway & Webhook Ingestion');
  const [severity, setSeverity] = useState<'P1 - Critical' | 'P2 - Major' | 'P3 - Minor'>('P1 - Critical');
  const [durationMinutes, setDurationMinutes] = useState('35');
  const [summary, setSummary] = useState('TLS handshake timeout on edge proxies causing 504 Gateway errors');
  const [rootCause, setRootCause] = useState('Certificate rotation deadlock on envoy sidecar proxies');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleIngest = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promiseback-client': 'promiseback-web-console'
        },
        body: JSON.stringify({
          service,
          severity,
          durationMinutes: parseInt(durationMinutes, 10),
          summary,
          rootCause,
          affectedRegions: ['us-east-1', 'us-east-2'],
          affectedCustomerIds: ['cust-101', 'cust-102']
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to ingest incident.');
      }

      onIncidentIngested();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error ingesting incident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ingest Service Incident"
      subtitle="Simulate webhook ingestion to evaluate contractual SLA impact"
      maxWidth="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleIngest} loading={loading}>
            Ingest & Calculate SLA Impact
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-danger-bg border border-[#F9C9C9] text-danger rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="block text-neutral-secondary font-medium mb-1">
            Impacted Core Service *
          </label>
          <input
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              Incident Severity
            </label>
            <select
              value={severity}
              onChange={(e: any) => setSeverity(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="P1 - Critical">P1 - Critical Outage</option>
              <option value="P2 - Major">P2 - Major Degradation</option>
              <option value="P3 - Minor">P3 - Minor Incident</option>
            </select>
          </div>

          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              Duration (Minutes)
            </label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs font-mono text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-neutral-secondary font-medium mb-1">
            Outage Summary *
          </label>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="block text-neutral-secondary font-medium mb-1">
            Verified Root Cause
          </label>
          <textarea
            rows={2}
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-xs text-neutral-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="p-3 bg-[#FAFBFD] border border-neutral-border rounded-lg text-[11px] text-neutral-secondary">
          <strong>Automated Engine Response:</strong> Ingesting this incident will automatically trigger downtime calculations for all mapped customer tenants and compute contractual compensation tiers.
        </div>
      </div>
    </Modal>
  );
}
