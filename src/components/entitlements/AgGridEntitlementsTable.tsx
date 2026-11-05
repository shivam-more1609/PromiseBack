'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Entitlement, EntitlementStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  Download,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

// Import AG Grid styles
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

// Dynamically import AgGridReact for client-side rendering
const AgGridReact = dynamic(
  () => import('ag-grid-react').then((m) => m.AgGridReact),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 w-full flex items-center justify-center bg-slate-50 border border-neutral-border rounded-xl animate-pulse text-xs text-neutral-secondary">
        <Clock className="w-5 h-5 mr-2 text-primary animate-spin" />
        <span>Initializing AG Grid Enterprise Engine...</span>
      </div>
    )
  }
);

interface AgGridEntitlementsTableProps {
  entitlements: Entitlement[];
  onSelectEntitlement: (entitlement: Entitlement) => void;
}

export default function AgGridEntitlementsTable({
  entitlements,
  onSelectEntitlement
}: AgGridEntitlementsTableProps) {
  const gridRef = useRef<any>(null);
  const [quickFilterText, setQuickFilterText] = useState('');

  // Status Badge Cell Renderer
  const StatusCellRenderer = (params: any) => {
    const status: EntitlementStatus = params.value;
    switch (status) {
      case 'approved':
        return <Badge variant="success" size="sm" dot>Approved</Badge>;
      case 'pending_approval':
        return <Badge variant="warning" size="sm" dot>Pending Dual-Approval</Badge>;
      case 'requires_review':
        return <Badge variant="danger" size="sm" dot>Requires Review</Badge>;
      case 'compensated':
        return <Badge variant="indigo" size="sm" dot>Compensated</Badge>;
      case 'partially_compensated':
        return <Badge variant="indigo" size="sm" dot>Partially Paid</Badge>;
      case 'not_eligible':
      case 'ineligible':
        return <Badge variant="neutral" size="sm">Not Eligible</Badge>;
      case 'rejected':
        return <Badge variant="outline" size="sm">Rejected</Badge>;
      default:
        return <Badge variant="outline" size="sm">{status}</Badge>;
    }
  };

  // Action Button Cell Renderer
  const ActionCellRenderer = (params: any) => {
    return (
      <button
        onClick={() => onSelectEntitlement(params.data)}
        className="px-2.5 py-1 bg-primary-light hover:bg-[#D5D3FF] text-primary text-[11px] font-bold rounded transition-colors"
      >
        Inspect Case
      </button>
    );
  };

  // Column Definitions
  const columnDefs = useMemo(() => [
    {
      headerName: 'Case ID',
      field: 'caseNumber',
      width: 140,
      pinned: 'left' as const,
      sortable: true,
      filter: 'agTextColumnFilter',
      cellClass: 'font-mono font-bold text-neutral-primary'
    },
    {
      headerName: 'Customer',
      field: 'customerName',
      width: 200,
      sortable: true,
      filter: 'agTextColumnFilter',
      cellClass: 'font-semibold text-neutral-primary'
    },
    {
      headerName: 'SLA Contract',
      field: 'contractNumber',
      width: 150,
      sortable: true,
      filter: 'agTextColumnFilter',
      cellClass: 'font-mono text-neutral-secondary'
    },
    {
      headerName: 'Incident Ref',
      field: 'incidentNumber',
      width: 130,
      sortable: true,
      filter: 'agTextColumnFilter',
      cellClass: 'font-mono text-neutral-secondary'
    },
    {
      headerName: 'Target Uptime',
      valueGetter: (p: any) => `${p.data?.calculation?.contractedUptime || 99.95}%`,
      width: 120,
      sortable: true,
      cellClass: 'font-mono text-neutral-secondary text-right'
    },
    {
      headerName: 'Measured Availability',
      valueGetter: (p: any) => `${p.data?.calculation?.measuredUptime?.toFixed(3) || p.data?.uptimeActual || '99.912'}%`,
      width: 150,
      sortable: true,
      cellClass: 'font-mono font-bold text-danger text-right'
    },
    {
      headerName: 'Outage Deficit',
      valueGetter: (p: any) => `${p.data?.calculation?.outageMinutes || 38} mins`,
      width: 120,
      sortable: true,
      cellClass: 'font-mono text-neutral-primary text-right'
    },
    {
      headerName: 'Eligible Remedy',
      field: 'eligibleCredit',
      width: 140,
      sortable: true,
      valueFormatter: (p: any) => `$${Number(p.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      cellClass: 'font-mono font-bold text-neutral-primary text-right'
    },
    {
      headerName: 'Audit Status',
      field: 'status',
      width: 170,
      sortable: true,
      filter: 'agSetColumnFilter',
      cellRenderer: StatusCellRenderer
    },
    {
      headerName: 'Workbench',
      field: 'id',
      width: 120,
      pinned: 'right' as const,
      cellRenderer: ActionCellRenderer,
      sortable: false,
      filter: false
    }
  ], []);

  // CSV Export Handler
  const handleExportCsv = useCallback(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `PromiseBack_SLA_Entitlements_${new Date().toISOString().split('T')[0]}.csv`
      });
    }
  }, []);

  return (
    <div className="space-y-3">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-neutral-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Quick search across all AG Grid columns..."
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-secondary font-mono">
            {entitlements.length} Rows Loaded
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-success" />}
          >
            Export to CSV
          </Button>
        </div>
      </div>

      {/* AG Grid Container */}
      <div className="ag-theme-quartz w-full h-[540px] rounded-xl overflow-hidden border border-neutral-border shadow-subtle">
        {React.createElement(AgGridReact as any, {
          ref: gridRef,
          rowData: entitlements,
          columnDefs: columnDefs,
          defaultColDef: {
            resizable: true,
            sortable: true,
            filter: true
          },
          quickFilterText: quickFilterText,
          pagination: true,
          paginationPageSize: 15,
          paginationPageSizeSelector: [10, 15, 25, 50],
          rowHeight: 46,
          headerHeight: 42,
          animateRows: true
        })}
      </div>
    </div>
  );
}
