import { useState, type FormEvent } from 'react';
import {
  AI_PROVIDERS,
  getProviderDefinition,
  validateAiApiKey,
  type AiProviderId,
  type AiSettings,
} from '../utils/ai';

interface SettingsModalProps {
  settings: AiSettings;
  onSave: (next: AiSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<AiProviderId>(settings.provider);
  const [model, setModel] = useState<string>(settings.model);
  const [apiKey, setApiKey] = useState<string>(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [keyStatusMsg, setKeyStatusMsg] = useState<string>('');

  const providerDef = getProviderDefinition(provider);
  const selectedModel =
    providerDef.models.find((m) => m.id === model) ?? providerDef.models[0];

  const handleCheckKey = async () => {
    setKeyStatus('checking');
    setKeyStatusMsg('Validating API key...');
    const result = await validateAiApiKey({
      provider,
      model: selectedModel.id,
      apiKey,
    });
    setKeyStatus(result.valid ? 'valid' : 'invalid');
    setKeyStatusMsg(result.message);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      provider,
      model: selectedModel.id,
      apiKey: apiKey.trim(),
    });
    onClose();
  };

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Plugin AI Settings"
      >
        <div className="settings-header">
          <h2 className="settings-title">AI Settings</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close settings"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label className="settings-field">
            <span className="settings-label">AI Provider</span>
            <select
              className="settings-select"
              aria-label="AI Provider"
              value={provider}
              onChange={(e) => {
                const nextProvider = e.target.value as AiProviderId;
                setProvider(nextProvider);
                setModel(getProviderDefinition(nextProvider).models[0].id);
                setKeyStatus('idle');
              }}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-label">Model</span>
            <select
              className="settings-select"
              aria-label="Model"
              value={selectedModel.id}
              onChange={(e) => {
                setModel(e.target.value);
                setKeyStatus('idle');
              }}
            >
              {providerDef.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="settings-hint">{selectedModel.hint}</span>
          </label>

          <label className="settings-field">
            <span className="settings-label">API Key</span>
            <div className="settings-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                className="settings-input"
                aria-label="API Key"
                placeholder={providerDef.keyPlaceholder}
                autoComplete="off"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyStatus('idle');
                }}
              />
              <button
                type="button"
                className="matrix-btn"
                onClick={() => setShowKey((prev) => !prev)}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="matrix-btn"
                disabled={!apiKey.trim() || keyStatus === 'checking'}
                onClick={handleCheckKey}
              >
                {keyStatus === 'checking' ? 'Checking...' : 'Test Key'}
              </button>
            </div>
            {keyStatus !== 'idle' && (
              <div
                className={`settings-key-status ${keyStatus}`}
                role="status"
              >
                {keyStatus === 'valid' ? '✓ ' : keyStatus === 'invalid' ? '✕ ' : ''}
                {keyStatusMsg}
              </div>
            )}
            <span className="settings-hint">
              Stored locally in your browser. Never bundled or shared with third parties.
            </span>
          </label>

          <div className="settings-footer">
            <button
              type="button"
              className="matrix-btn"
              onClick={() => {
                setApiKey('');
                setKeyStatus('idle');
              }}
              disabled={!apiKey}
            >
              Clear Key
            </button>
            <div className="settings-footer-right">
              <button type="button" className="matrix-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="matrix-btn matrix-btn-primary">
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
