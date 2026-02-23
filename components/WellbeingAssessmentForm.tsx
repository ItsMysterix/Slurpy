'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const SCALE_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
];

interface WellbeingFormProps {
  onComplete?: (data: any) => void;
}

export function WellbeingAssessmentForm({ onComplete }: WellbeingFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phq2_q1, setPhq2Q1] = useState<number | null>(null);
  const [phq2_q2, setPhq2Q2] = useState<number | null>(null);
  const [gad2_q1, setGad2Q1] = useState<number | null>(null);
  const [gad2_q2, setGad2Q2] = useState<number | null>(null);

  const allAnswered = phq2_q1 !== null && phq2_q2 !== null && gad2_q1 !== null && gad2_q2 !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) return;

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      // Extract CSRF token from cookie for double-submit protection
      const csrfMatch = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
      const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (csrfToken) {
        headers['x-csrf'] = csrfToken;
      }

      const res = await fetch('/api/wellbeing/surveys', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phq2_q1,
          phq2_q2,
          gad2_q1,
          gad2_q2,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubmitted(true);
        if (data.warning) {
          setWarning(data.warning);
        }
        if (onComplete) onComplete(data);
        setTimeout(() => setShowForm(false), 3000);
      } else {
        const result = await res.json();
        setError(result.error || 'Failed to save assessment');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!showForm) {
    return (
      <div className="mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
          className="text-xs"
        >
          Share Wellness Check (Optional)
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <Card className="mb-4 bg-green-50 border-green-200">
        <CardContent className="pt-6 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div className="text-sm">
            <p className="font-medium text-green-900">Assessment saved!</p>
            {warning && (
              <p className="text-xs text-green-800 mt-1">{warning}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Wellness Check (Optional)</CardTitle>
        <CardDescription className="text-xs">
          Help us understand how you're feeling. This is optional and confidential.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PHQ-2 */}
          <div className="space-y-3 pb-4 border-b">
            <p className="font-medium text-sm">Depression (PHQ-2)</p>

            <div>
              <label className="text-xs mb-2 block">
                Over the past two weeks, how often have you had little interest or pleasure in doing
                things?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPhq2Q1(opt.value)}
                    className={`p-2 text-xs rounded border transition-colors ${
                      phq2_q1 === opt.value
                        ? 'bg-blue-100 border-blue-500 text-blue-900'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs mb-2 block">
                Over the past two weeks, how often have you felt down, depressed, or hopeless?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPhq2Q2(opt.value)}
                    className={`p-2 text-xs rounded border transition-colors ${
                      phq2_q2 === opt.value
                        ? 'bg-blue-100 border-blue-500 text-blue-900'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* GAD-2 */}
          <div className="space-y-3">
            <p className="font-medium text-sm">Anxiety (GAD-2)</p>

            <div>
              <label className="text-xs mb-2 block">
                Over the past two weeks, how often have you felt nervous, anxious, or on edge?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGad2Q1(opt.value)}
                    className={`p-2 text-xs rounded border transition-colors ${
                      gad2_q1 === opt.value
                        ? 'bg-amber-100 border-amber-500 text-amber-900'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs mb-2 block">
                Over the past two weeks, how often have you been unable to stop or control worrying?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGad2Q2(opt.value)}
                    className={`p-2 text-xs rounded border transition-colors ${
                      gad2_q2 === opt.value
                        ? 'bg-amber-100 border-amber-500 text-amber-900'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={!allAnswered || loading}
              className="text-xs"
              size="sm"
            >
              {loading ? 'Saving...' : 'Save Assessment'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
              className="text-xs"
            >
              Skip
            </Button>
          </div>

          <p className="text-xs text-gray-500">
            This app is NOT a replacement for professional mental health care. If you're in crisis,
            contact emergency services.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
