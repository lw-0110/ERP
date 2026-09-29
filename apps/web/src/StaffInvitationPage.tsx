import { apiFetch } from './api-fetch.js';
import { t, locale } from './i18n.js';
import { type FormEvent, useEffect, useState } from 'react';
import { getUserFriendlyError, readApiError } from './error-messages.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Validation = { valid: true; staffDisplayName: string; email: string; roleName: string; expiresAt: string; existingAccount: boolean };
async function post(path: string, body: unknown) {
  const response = await apiFetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
  return response.json();
}

export function StaffInvitationPage({ token }: { token: string }) {
  const [details, setDetails] = useState<Validation>();
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void post('/staff-invitations/validate', { token }).then(setDetails).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false)); }, [token]);

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!details) return;
    setError(''); setLoading(true);
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    if (!details.existingAccount && password !== data.get('confirmPassword')) { setError('Passwords do not match.'); setLoading(false); return; }
    try {
      if (details.existingAccount) await post('/api/auth/sign-in/email', { email: details.email, password });
      await post('/staff-invitations/redeem', { token, name: data.get('name') || undefined, password: details.existingAccount ? undefined : password });
      setComplete(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Activation failed.'); }
    finally { setLoading(false); }
  }

  if (loading && !details) return <main><h1>{t("Staff account invitation")}</h1><p role="status">{t("Checking invitation…")}</p></main>;
  if (complete) return <main><h1>{t("Staff account activated")}</h1><p>{t("Your account is linked. Sign in or refresh to use your new permissions.")}</p><a href="/">{t("Go to login")}</a></main>;
  return <main><h1>{t("Staff account invitation")}</h1>{error && <p role="alert" className="error">{t(error)}</p>}{details && <section className="panel stack"><p>{t("Activate the account for")} <strong>{details.staffDisplayName}</strong>.</p><p>{t("Role:")} <strong>{details.roleName}</strong></p><p>{t("Expires")} {new Date(details.expiresAt).toLocaleString(locale())}.</p><form className="stack" onSubmit={(event) => { void redeem(event); }}><label>{t("Email")}<input type="email" value={details.email} readOnly /></label>{details.existingAccount ? <p>{t("An account already exists. Enter its password to prove ownership before linking it.")}</p> : <label>{t("Name")}<input name="name" autoComplete="name" required /></label>}<label>{t("Password")}<input name="password" type="password" minLength={8} autoComplete={details.existingAccount ? 'current-password' : 'new-password'} required /></label>{!details.existingAccount && <label>{t("Confirm password")}<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>}<button disabled={loading}>{loading ? t('Activating…') : t('Activate staff account')}</button></form></section>}</main>;
}
