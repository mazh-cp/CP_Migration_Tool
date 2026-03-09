'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, UserPlus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

interface User {
  id: string;
  username: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  sourceType: string;
}

interface ProjectMember {
  id: string;
  userId: string;
  username: string;
  role: string;
}

export default function SettingsPage() {
  const [configUnlocked, setConfigUnlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [modelFetchMethod, setModelFetchMethod] = useState<'default' | 'litellm'>('default');
  const [litellmBaseUrl, setLitellmBaseUrl] = useState('');
  const [litellmModel, setLitellmModel] = useState('gpt-4');
  const [litellmApiKey, setLitellmApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMembers, setProjectMembers] = useState<Record<string, ProjectMember[]>>({});
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addUserError, setAddUserError] = useState('');
  const [addMemberProject, setAddMemberProject] = useState('');
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        setConfigUnlocked(d.configUnlocked);
        setPinRequired(d.pinRequired);
        setModelFetchMethod(d.modelFetchMethod || 'default');
        setLitellmBaseUrl(d.litellmBaseUrl || '');
        setLitellmModel(d.litellmModel || 'gpt-4');
        setApiKeyConfigured(d.apiKeyConfigured ?? false);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : Promise.resolve({ isAdmin: false })))
      .then((d: { isAdmin?: boolean }) => setIsAdmin(d.isAdmin ?? false))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]));
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [isAdmin]);

  async function loadProjectMembers(projectId: string) {
    const res = await fetch(`/api/projects/${projectId}/members`);
    if (res.ok) {
      const members = await res.json();
      setProjectMembers((prev) => ({ ...prev, [projectId]: members }));
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddUserError('');
    if (!newUsername.trim() || !newPassword) {
      setAddUserError('Username and password required');
      return;
    }
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername.trim(), password: newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers((prev) => [...prev, data]);
      setNewUsername('');
      setNewPassword('');
    } else {
      setAddUserError(data.error || 'Failed to add user');
    }
  }

  async function handleAddMember(projectId: string) {
    if (!addMemberUserId) return;
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: addMemberUserId, role: addMemberRole }),
    });
    if (res.ok) {
      loadProjectMembers(projectId);
      setAddMemberProject('');
      setAddMemberUserId('');
    }
  }

  async function handleRemoveMember(projectId: string, memberId: string) {
    const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: 'DELETE' });
    if (res.ok) loadProjectMembers(projectId);
  }

  function toggleProject(projectId: string) {
    if (expandedProject === projectId) {
      setExpandedProject(null);
    } else {
      setExpandedProject(projectId);
      if (!projectMembers[projectId]) loadProjectMembers(projectId);
    }
  }

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
      const payload: Record<string, string | undefined> = {
        modelFetchMethod,
        litellmBaseUrl: litellmBaseUrl || undefined,
        litellmModel: litellmModel || undefined,
      };
      if (litellmApiKey.trim()) {
        payload.litellmApiKey = litellmApiKey.trim();
      }
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLitellmApiKey('');
        const data = await fetch('/api/config').then((r) => r.json());
        setApiKeyConfigured(data.apiKeyConfigured ?? false);
      }
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
            <div>
              <label className="block text-sm text-slate-300 mb-1">API Key</label>
              <input
                type="password"
                value={litellmApiKey}
                onChange={(e) => setLitellmApiKey(e.target.value)}
                placeholder={apiKeyConfigured ? 'Enter to replace (stored server-side)' : 'Enter API key for LiteLLM'}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg"
                autoComplete="off"
              />
              {apiKeyConfigured && (
                <p className="text-xs text-slate-500 mt-1">API key is stored on the server and never sent to the client.</p>
              )}
            </div>
          </div>
        )}

        {pinRequired && (
          <p className="text-slate-500 text-sm">
            Configuration protected by PIN. Set CONFIG_PIN in .env to require PIN for settings.
          </p>
        )}

        <div className="pt-8 border-t border-slate-700">
          <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Users & Project Access (RBAC)
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Add users and assign them to projects with roles. Only the admin (AUTH_USERNAME) can manage users and project access.
          </p>

          {!isAdmin && (
            <p className="text-amber-400/80 text-sm py-2">You must be logged in as admin to manage users and project access.</p>
          )}

          <div className="space-y-6">
            {isAdmin && <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Add User</h3>
              <form onSubmit={handleAddUser} className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="username"
                    className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="min 6 chars"
                    className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                  />
                </div>
                <button type="submit" className="flex items-center gap-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm">
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              </form>
              {addUserError && <p className="text-red-400 text-sm mt-1">{addUserError}</p>}
            </div>}

            {isAdmin && <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Users</h3>
              <div className="flex flex-wrap gap-2">
                {users.length === 0 ? (
                  <p className="text-slate-500 text-sm">No users yet. Add users above.</p>
                ) : (
                  users.map((u) => (
                    <span key={u.id} className="px-3 py-1 bg-slate-800 rounded-lg text-sm">
                      {u.username}
                    </span>
                  ))
                )}
              </div>
            </div>}

            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Project Members</h3>
              <p className="text-slate-500 text-xs mb-2">Roles: owner | admin (full access) | editor (edit) | viewer (read-only)</p>
              <div className="space-y-2">
                {projects.map((p) => (
                  <div key={p.id} className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleProject(p.id)}
                      className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 text-left"
                    >
                      {expandedProject === p.id ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-medium">{p.name}</span>
                      <span className="text-slate-500 text-sm">({p.sourceType})</span>
                    </button>
                    {expandedProject === p.id && (
                      <div className="p-4 border-t border-slate-700 space-y-3">
                        {isAdmin && <div className="flex flex-wrap gap-2 items-center">
                          <select
                            value={addMemberProject === p.id ? addMemberUserId : ''}
                            onChange={(e) => {
                              setAddMemberProject(p.id);
                              setAddMemberUserId(e.target.value);
                            }}
                            className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                          >
                            <option value="">Select user...</option>
                            {users
                              .filter((u) => !(projectMembers[p.id] ?? []).some((m) => m.userId === u.id))
                              .map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.username}
                                </option>
                              ))}
                          </select>
                          <select
                            value={addMemberRole}
                            onChange={(e) => setAddMemberRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                            className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm"
                          >
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => handleAddMember(p.id)}
                            disabled={addMemberProject !== p.id || !addMemberUserId}
                            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm"
                          >
                            Add
                          </button>
                        </div>}
                        <div className="space-y-1">
                          {(projectMembers[p.id] ?? []).map((m) => (
                            <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                              <span className="text-sm">{m.username}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 bg-slate-700 rounded">{m.role}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleRemoveMember(p.id, m.id)}
                                    className="text-red-400 hover:text-red-300 p-1"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {projects.length === 0 && <p className="text-slate-500 text-sm">No projects. Create a project first.</p>}
              </div>
            </div>
          </div>
        </div>
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
