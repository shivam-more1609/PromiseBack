'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Customer } from '@/types';
import { Users, Search, DollarSign, ShieldCheck, CreditCard, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => {
        if (data.success) setCustomers(data.customers);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter(c => 
    search === '' || 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.domain.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-border pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-primary">
            Protected Enterprise Accounts
          </h1>
          <p className="text-xs text-neutral-secondary mt-1">
            Enterprise customer mapping, contracted SLA covenants, and preferred remedy payment channels.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-neutral-border flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-neutral-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search enterprise accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-[#F8FAFC] border border-neutral-border rounded-lg text-xs text-neutral-primary placeholder:text-neutral-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-xs text-neutral-secondary font-mono">
          {filtered.length} Enterprise Tenants
        </span>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-12 text-center text-xs text-neutral-secondary">
            Loading enterprise directory...
          </div>
        ) : (
          filtered.map((customer) => (
            <Card
              key={customer.id}
              padding="md"
              className="hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-primary">
                      {customer.name}
                    </h3>
                    <span className="text-xs text-neutral-secondary block">
                      {customer.domain}
                    </span>
                  </div>
                  <Badge variant="indigo" size="sm">
                    {customer.plan}
                  </Badge>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-secondary">Monthly Service Spend:</span>
                    <span className="font-mono font-bold text-neutral-primary">
                      ${customer.monthlySpend.toLocaleString()}/mo
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-secondary">Assigned SLA:</span>
                    <span className="font-mono text-primary font-medium">
                      {customer.contractNumber}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-secondary">Remedy Method:</span>
                    <span className="font-semibold text-neutral-primary flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-primary" />
                      {customer.paymentMethod}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-secondary">Primary Region:</span>
                    <span className="font-mono text-neutral-secondary">
                      {customer.region}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-border flex items-center justify-between">
                <span className="text-[11px] text-neutral-secondary font-mono">
                  {customer.paypalEmail}
                </span>
                <Link href={`/entitlements?customer=${customer.name}`}>
                  <Button variant="ghost" size="sm" icon={<ExternalLink className="w-3 h-3" />}>
                    Entitlements
                  </Button>
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
