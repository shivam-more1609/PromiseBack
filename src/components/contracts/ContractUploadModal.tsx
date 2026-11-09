'use client';

import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';

interface ContractUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContractUploaded: () => void;
}

export default function ContractUploadModal({
  isOpen,
  onClose,
  onContractUploaded,
}: ContractUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [slaName, setSlaName] = useState('Enterprise Tier 1 Gold SLA');
  const [uptimeTarget, setUptimeTarget] = useState('99.95');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.endsWith('.pdf')) {
        setError('Only PDF contractual documents are accepted for AI clause ingestion.');
        return;
      }
      setError('');
      setFile(selected);
      if (!customerName) {
        setCustomerName(selected.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }
    }
  };

  const handleUploadAndExtract = async () => {
    if (!customerName) {
      setError('Please specify Customer or Enterprise account name.');
      return;
    }

    setUploading(true);
    setError('');
    setStatusMessage('Uploading PDF document...');
    setUploadProgress(25);

    try {
      setUploadProgress(30);
      setStatusMessage('Uploading and parsing PDF binary stream...');

      let response: Response;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('customerName', customerName);

        response = await fetch('/api/contracts', {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
      } else {
        response = await fetch('/api/contracts', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            customerName,
            slaName,
            uptimeTarget: parseFloat(uptimeTarget) || 99.95,
            fileName: `${customerName.replace(/\s+/g, '_')}_Master_SLA.pdf`,
            fileSize: '1.8 MB',
            uploaderName: 'Compliance Officer (Elena Rostova)'
          })
        });
      }

      setUploadProgress(75);
      setStatusMessage('Extracting contractual covenants & SLA penalty tiers...');

      let data: any;
      const resContentType = response.headers.get('content-type') || '';
      if (resContentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        throw new Error(
          `Server returned HTTP ${response.status}: ${response.statusText || 'Non-JSON response'}`
        );
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to parse and ingest contract.');
      }

      setUploadProgress(100);
      setStatusMessage('Real PDF Clause Extraction Complete! Pending Human Verification.');

      await new Promise(r => setTimeout(r, 500));
      onContractUploaded();
      onClose();
      // Reset form
      setFile(null);
      setCustomerName('');
      setUploading(false);
      setUploadProgress(0);
    } catch (err: any) {
      setError(err.message || 'Error occurred during contract extraction.');
      setUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !uploading && onClose()}
      title="Upload SLA Contract Document"
      subtitle="Ingest PDF agreements for AI clause parsing and human verification"
      maxWidth="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUploadAndExtract}
            loading={uploading}
            disabled={!customerName}
          >
            {uploading ? 'Processing Agreement...' : 'Extract & Ingest Contract'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-[#FDECEC] border border-[#F9C9C9] rounded-lg text-danger flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Drag and Drop Box */}
        <div className="border-2 border-dashed border-[#CBD5E1] hover:border-primary rounded-xl p-6 text-center bg-[#FAFBFD] transition-colors relative">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={uploading}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-primary-light text-primary flex items-center justify-center mb-2">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="font-semibold text-neutral-primary text-sm">
              {file ? file.name : 'Drag & drop contract PDF here, or click to browse'}
            </p>
            <p className="text-neutral-secondary text-[11px] mt-1">
              Supports standard SaaS Service Level Agreements, Master Service Agreements (up to 25MB)
            </p>
            {file && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-neutral-border rounded-full text-neutral-primary font-mono text-[11px]">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>{(file.size / (1024 * 1024)).toFixed(2)} MB • PDF Document</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar during ingestion */}
        {uploading && (
          <div className="space-y-2 bg-[#F1F4F9] p-3 rounded-lg border border-neutral-border">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-neutral-primary flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                {statusMessage}
              </span>
              <span className="font-mono text-neutral-secondary">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Contract Meta Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              Enterprise Customer Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Acme FinTech Corp"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-neutral-primary text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              SLA Tier Classification
            </label>
            <input
              type="text"
              placeholder="e.g. Mission-Critical Gold SLA"
              value={slaName}
              onChange={(e) => setSlaName(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-neutral-primary text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              Contracted Uptime Target (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={uptimeTarget}
              onChange={(e) => setUptimeTarget(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-neutral-primary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-neutral-secondary font-medium mb-1">
              Measurement Schedule
            </label>
            <select
              disabled={uploading}
              className="w-full px-3 py-2 bg-white border border-neutral-border rounded-lg text-neutral-primary text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="Monthly">Monthly Calendar Interval</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Annual">Annual</option>
            </select>
          </div>
        </div>

        <div className="p-3 bg-[#EEEDFF] border border-[#D5D3FF] rounded-lg text-[11px] text-[#3730A3] leading-relaxed">
          <strong>Dual-Layer Legal Verification:</strong> In accordance with financial compliance, AI-extracted terms remain in a <em>Requires Review</em> state until explicitly countersigned by human compliance personnel.
        </div>
      </div>
    </Modal>
  );
}
