import React, { useState } from 'react';
import { CheckCircle2, Globe, Key, Loader2, Server, ShieldAlert, User, X } from 'lucide-react';
import { api } from '../api';
import { CreateInstanceInput, OdooInstance } from '../types';

interface InstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingInstance?: OdooInstance | null;
}

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#EF4444', // Red
];

export const InstanceModal: React.FC<InstanceModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingInstance,
}) => {
  const [name, setName] = useState(editingInstance?.name || '');
  const [url, setUrl] = useState(editingInstance?.url || '');
  const [db, setDb] = useState(editingInstance?.db || '');
  const [username, setUsername] = useState(editingInstance?.username || '');
  const [apiKey, setApiKey] = useState(editingInstance?.api_key || '');
  const [color, setColor] = useState(editingInstance?.color || PRESET_COLORS[0]);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    version?: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!url || !db || !username || !apiKey) {
      setTestResult({
        success: false,
        message: 'Please fill in all connection fields.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await api.testConnection({
        name: name || 'Test',
        url: url.trim(),
        db: db.trim(),
        username: username.trim(),
        api_key: apiKey.trim(),
        color,
      });

      setTestResult({
        success: res.success,
        message: res.message,
        version: res.odoo_version,
      });
    } catch (e: any) {
      setTestResult({
        success: false,
        message: `Connection test failed: ${e?.toString() || 'Unknown'}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || !db.trim() || !username.trim() || !apiKey.trim()) {
      alert('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    try {
      if (editingInstance) {
        await api.updateInstance({
          id: editingInstance.id,
          name: name.trim(),
          url: url.trim(),
          db: db.trim(),
          username: username.trim(),
          api_key: apiKey.trim(),
          color,
          active: editingInstance.active,
        });
      } else {
        const input: CreateInstanceInput = {
          name: name.trim(),
          url: url.trim(),
          db: db.trim(),
          username: username.trim(),
          api_key: apiKey.trim(),
          color,
        };
        await api.addInstance(input);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(`Failed to save instance: ${err?.toString()}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 px-6 py-4">
          <div className="flex items-center gap-2">
            <div
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {editingInstance ? 'Edit Odoo Instance' : 'Connect Odoo Instance'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Display name */}
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Display name (e.g. Main Company, CRM, Sandbox)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Odoo Company"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-base text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Odoo URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Odoo Instance URL
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mycompany.odoo.com"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 pl-9 pr-3 py-2 text-base text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Database */}
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Database Name
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={db}
                onChange={(e) => setDb(e.target.value)}
                placeholder="database_name"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 pl-9 pr-3 py-2 text-base text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Username / Email */}
            <div>
              <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Username / Email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 pl-9 pr-3 py-2 text-base text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            {/* API Key or Password */}
            <div>
              <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                API Key or Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API key or password"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 pl-9 pr-3 py-2 text-base text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Instance color */}
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              Label Color
            </label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition ${
                    color === c ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Connection test result */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{testResult.message}</p>
                {testResult.version && (
                  <p className="opacity-80 mt-0.5">Odoo Version: {testResult.version}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg flex items-center gap-1.5 transition"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
              Test Connection
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingInstance ? 'Save Changes' : 'Connect and Sync'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
