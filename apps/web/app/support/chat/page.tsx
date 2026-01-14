'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Send,
  Loader2,
  Bot,
  User,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Customer {
  id: string;
  email: string;
  name: string;
  plan: string;
}

export default function SupportChatPage() {
  const [activeTab, setActiveTab] = useState<'demo' | 'custom'>('demo');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [customerId, setCustomerId] = useState('demo_customer');
  const [customerInfo, setCustomerInfo] = useState<Customer | null>(null);
  const [result, setResult] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Create demo customer if not exists
    createDemoCustomer();
  }, []);

  const createDemoCustomer = async () => {
    try {
      const response = await fetch('http://localhost:3001/support/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'demo_customer',
          email: 'demo@example.com',
          name: 'Demo User',
          plan: 'pro'
        })
      });
      const data = await response.json();
      if (data.success) {
        setCustomerInfo(data.data);
      }
    } catch (error) {
      console.error('Failed to create demo customer:', error);
    }
  };

  const quickQueries = [
    { text: 'I forgot my password, how do I reset it?', category: 'account' },
    { text: 'When is my next payment and how much will it be?', category: 'billing' },
    { text: 'I was accidentally charged $25. Can I get a refund?', category: 'billing' },
    { text: 'What are the API rate limits on my plan?', category: 'technical' },
    { text: 'I need a refund of $200', category: 'billing' },
    { text: 'This is taking too long! I want to speak to a manager!', category: 'escalation' }
  ];

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setAgentStatus('Processing...');
    setResult(null);

    try {
      const response = await fetch('http://localhost:3001/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          message: textToSend,
          // Use existing conversationId if available, otherwise let server generate one
          ...(conversationId && { conversationId })
        })
      });

      const data = await response.json();

      if (data.success) {
        // Save conversationId from first response for subsequent messages
        if (!conversationId && data.data.conversationId) {
          setConversationId(data.data.conversationId);
          console.log('Started new conversation:', data.data.conversationId);
        }

        const assistantMessage: Message = {
          role: 'assistant',
          content: data.data.response,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setResult(data.data);
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Send message error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setAgentStatus('');
    }
  };

  const handleQuickQuery = (query: string) => {
    sendMessage(query);
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationId(null);
    setResult(null);
    setAgentStatus('');
    console.log('Conversation cleared - starting fresh');
  };

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
                <h1 className="text-2xl font-bold">💬 Support Chat</h1>
                <p className="text-sm text-muted-foreground">
                  AI-powered customer support
                  {conversationId && (
                    <span className="ml-2 text-xs text-blue-600">• Active conversation</span>
                  )}
                </p>
              </div>
            </div>
            {customerInfo && (
              <div className="flex items-center gap-4">
                {messages.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearConversation}
                    disabled={loading}
                  >
                    Clear Chat
                  </Button>
                )}
                <div className="text-right">
                  <div className="text-sm font-medium">{customerInfo.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {customerInfo.email} • {customerInfo.plan} plan
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chat Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chat Card */}
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle>Chat with Support Agent</CardTitle>
                <CardDescription>
                  Ask any question about your account, billing, or technical issues
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col overflow-hidden">
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bot className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">Hi! How can I help you today?</p>
                      <p className="text-sm">
                        Try one of the quick queries below or type your own question
                      </p>
                    </div>
                  )}

                  {messages.map((message, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div className="flex gap-3 max-w-[80%]">
                        {message.role === 'assistant' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <Bot className="h-4 w-4 text-blue-600" />
                          </div>
                        )}
                        <div
                          className={`rounded-lg px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <span className="text-xs opacity-70 mt-2 block">
                            {message.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        {message.role === 'user' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-green-600" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {agentStatus && (
                    <div className="flex justify-center">
                      <Badge variant="secondary" className="animate-pulse">
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        {agentStatus}
                      </Badge>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t pt-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your message..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      disabled={loading}
                      className="min-h-[60px] flex-1"
                    />
                    <Button
                      onClick={() => sendMessage()}
                      disabled={loading || !input.trim()}
                      size="icon"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Result Info */}
            {result && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Interaction Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Agents Used</p>
                      <div className="flex flex-wrap gap-1">
                        {result.agentsUsed.map((agent: string, idx: number) => (
                          <Badge key={idx} variant="secondary">
                            {agent}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Category</p>
                      <Badge variant="outline" className="capitalize">
                        {result.category || 'general'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Status</p>
                      {result.resolved ? (
                        <Badge
                          variant="outline"
                          className="bg-green-500/10 text-green-600 border-green-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Resolved
                        </Badge>
                      ) : result.requiresHuman ? (
                        <Badge
                          variant="outline"
                          className="bg-orange-500/10 text-orange-600 border-orange-500/20"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Escalated
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-blue-500/10 text-blue-600 border-blue-500/20"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Human Required</p>
                      <Badge variant={result.requiresHuman ? 'destructive' : 'secondary'}>
                        {result.requiresHuman ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Queries */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Queries</CardTitle>
                <CardDescription>Try these example questions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickQueries.map((query, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="w-full text-left h-auto whitespace-normal justify-start"
                    onClick={() => handleQuickQuery(query.text)}
                    disabled={loading}
                  >
                    <div className="flex-1 text-sm">{query.text}</div>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Agent Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Agent System</CardTitle>
                <CardDescription>Multi-agent support routing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium mb-2">Available Agents:</div>
                  <div className="space-y-2">
                    {[
                      { name: 'Triage', desc: 'Routes to specialists' },
                      { name: 'Technical', desc: 'Product & API help' },
                      { name: 'Billing', desc: 'Payments & refunds' },
                      { name: 'Account', desc: 'Login & settings' },
                      { name: 'Escalation', desc: 'Human handoff' }
                    ].map((agent, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Bot className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div>
                          <div className="font-medium text-sm">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Features */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>RAG knowledge base search</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Auto-approve small refunds</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>HITL for large amounts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Customer context aware</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Escalation detection</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
