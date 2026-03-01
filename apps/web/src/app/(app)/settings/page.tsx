'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [configUnlocked, setConfigUnlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [modelFetchMethod, setModelFetchMethod] = useState<'default' | 'litellm'>('default');
  const [litellmBaseUrl, setLitellmBaseUrl] = useState('');
  const [litellmModel, setLitellmModel] = useState('gpt-4');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        setConfigUnlocked(d.configUnlocked);
        setPinRequired(d.pinRequired);
        setModelFetchMethod(d.modelFetchMethod || 'default');
        setLitellmBaseUrl(d.litellmBaseUrl || '');
        setLitellmModel(d.litellmModel || 'gpt-4');
      })
      .finally(() => setLoading(false));
  }, []);

  async function verifyPin() {
    setPinError('');
    const res = await fetch('/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      setConfigUnlocked(true);
      setPin('');
    } else {
      setPinError('Invalid PIN');
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelFetchMethod,
          litellmBaseUrl: litellmBaseUrl || undefined,
          litellmModel: litellmModel || undefined,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse h-32">Loading...</div>;

  if (pinRequired && !configUnlocked) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <p className="text-slate-400 mb-4">
          Configuration is protected. Enter your PIN to unlock.
        </p>
        <div className="flex gap-2 max-w-xs">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg"
            onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
          />
          <button
            onClick={verifyPin}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
          >
            Unlock
          </button>
        </div>
        {pinError && <p className="text-red-400 text-sm mt-2">{pinError}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6 max-w-xl">
        <div>
          <h2 className="text-lg font-medium mb-3">Model Fetch Method</h2>
          <p className="text-slate-400 text-sm mb-3">
            Choose how to fetch AI model responses. LiteLLM allows using a local or proxy endpoint.
          </p>
          <select
            value={modelFetchMethod}
            onChange={(e) => setModelFetchMethod(e.target.value as 'default' | 'litellm')}
            className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg"
          >
            <option value="default">Default (OpenAI-compatible direct)</option>
            <option value="litellm">LiteLLM proxy</option>
          </select>
        </div>

        {modelFetchMethod === 'litellm' && (
          <div className="space-y-3 pl-4 border-l-2 border-cyan-500/30">
            <div>
              <label className="block text-sm text-slate-300 mb-1">LiteLLM Base URL</label>
              <input
                type="url"
                value={litellmBaseUrl}
                onChange={(e) => setLitellmBaseUrl(e.target.value)}
                placeholder="http://localhost:4000"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Model</label>
              <input
                type="text"
                value={litellmModel}
                onChange={(e) => setLitellmModel(e.target.value)}
                placeholder="gpt-4, ollama/llama2, etc."
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg"
              />
            </div>
          </div>
        )}

        {pinRequired && (
          <p className="text-slate-500 text-sm">
            Configuration protected by PIN. Set CONFIG_PIN in .env to require PIN for settings.
          </p>
        )}
      </div>

      <div className="mt-6 flex gap-4">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <Link href="/dashboard" className="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600">
          Back
        </Link>
      </div>
    </div>
  );
}
