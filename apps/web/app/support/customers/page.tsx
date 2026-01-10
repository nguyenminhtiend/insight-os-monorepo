'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Plus, MessageSquare, TrendingUp } from 'lucide-react';

interface Customer {
  id: string;
  email: string;
  name: string | null;
  plan: string | null;
  totalTickets: number;
  avgSatisfaction: number | null;
  accountAge: number | null;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tickets, setTickets] = useState<Record<string, Ticket[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      // Fetch tickets to get unique customer IDs
      const ticketsRes = await fetch('http://localhost:3001/support/tickets');
      const ticketsData = await ticketsRes.json();

      if (ticketsData.success && ticketsData.data.tickets) {
        const customerIds = [...new Set(ticketsData.data.tickets.map((t: any) => t.customerId))];

        // Fetch each customer
        const customerPromises = customerIds.map((id: string) =>
          fetch(`http://localhost:3001/support/customers/${id}`)
            .then(res => res.json())
            .then(data => data.success ? data.data : null)
        );

        const customersData = await Promise.all(customerPromises);
        const validCustomers = customersData.filter(Boolean);
        setCustomers(validCustomers);

        // Group tickets by customer
        const ticketsByCustomer: Record<string, Ticket[]> = {};
        ticketsData.data.tickets.forEach((ticket: any) => {
          if (!ticketsByCustomer[ticket.customerId]) {
            ticketsByCustomer[ticket.customerId] = [];
          }
          ticketsByCustomer[ticket.customerId].push(ticket);
        });
        setTickets(ticketsByCustomer);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.name && customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      customer.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPlanBadgeColor = (plan: string | null) => {
    switch (plan) {
      case 'enterprise':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'pro':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'free':
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/support">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">👥 Customers</h1>
                <p className="text-sm text-muted-foreground">Manage customer accounts and history</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{customers.length} customers</Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Customers Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Customers</CardTitle>
            <CardDescription>View customer details and support history</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredCustomers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-center">Tickets</TableHead>
                    <TableHead className="text-center">Satisfaction</TableHead>
                    <TableHead className="text-center">Account Age</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => {
                    const customerTickets = tickets[customer.id] || [];
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{customer.name || 'Unknown'}</div>
                            <div className="text-sm text-muted-foreground">{customer.email}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              ID: {customer.id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getPlanBadgeColor(customer.plan)}>
                            {customer.plan || 'free'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{customerTickets.length}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {customer.avgSatisfaction ? (
                            <div className="flex items-center justify-center gap-1">
                              <TrendingUp className="h-4 w-4 text-green-600" />
                              <span className="font-medium">{customer.avgSatisfaction.toFixed(1)}</span>
                              <span className="text-xs text-muted-foreground">/5</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm">
                            {customer.accountAge ? `${customer.accountAge} days` : 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCustomer(customer)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No customers found</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Details Modal/Card */}
        {selectedCustomer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedCustomer.name || 'Unknown Customer'}</CardTitle>
                    <CardDescription>{selectedCustomer.email}</CardDescription>
                  </div>
                  <Button variant="ghost" onClick={() => setSelectedCustomer(null)}>
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Customer Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Customer ID</p>
                    <p className="font-mono text-sm">{selectedCustomer.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Plan</p>
                    <Badge variant="outline" className={getPlanBadgeColor(selectedCustomer.plan)}>
                      {selectedCustomer.plan || 'free'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Tickets</p>
                    <p className="font-semibold">{tickets[selectedCustomer.id]?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Avg Satisfaction</p>
                    <p className="font-semibold">
                      {selectedCustomer.avgSatisfaction
                        ? `${selectedCustomer.avgSatisfaction.toFixed(1)}/5`
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Recent Tickets */}
                <div>
                  <h3 className="font-semibold mb-3">Recent Tickets</h3>
                  {tickets[selectedCustomer.id]?.length > 0 ? (
                    <div className="space-y-2">
                      {tickets[selectedCustomer.id].slice(0, 5).map((ticket) => (
                        <div key={ticket.id} className="border rounded-lg p-3">
                          <div className="flex items-start justify-between mb-2">
                            <p className="font-medium text-sm">{ticket.subject}</p>
                            <Badge variant="outline" className="capitalize">
                              {ticket.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">
                              {ticket.priority}
                            </Badge>
                            {ticket.category && (
                              <Badge variant="secondary" className="text-xs capitalize">
                                {ticket.category}
                              </Badge>
                            )}
                            <span>
                              {new Date(ticket.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tickets yet</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Link href="/support/chat" className="flex-1">
                    <Button className="w-full">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Start Chat
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={() => setSelectedCustomer(null)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
