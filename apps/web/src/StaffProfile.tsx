import { apiFetch } from './api-fetch.js';
import { t, translateStatus } from './i18n.js';
import { useEffect, useState } from 'react';
import { getUserFriendlyError, readApiError } from './error-messages.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Profile = { displayName: string; employeeCode: string; email: string; phone: string; status: string };

export function StaffProfile() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState('');
  useEffect(() => {
    void apiFetch(`${api}/staff/me`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
      setProfile(await response.json());
    }).catch((cause: Error) => setError(cause.message));
  }, []);
  return <section className="panel"><h2>{t("My Profile")}</h2>{error && <p role="alert" className="error">{t(error)}</p>}{!profile && !error && <p role="status">{t("Loading…")}</p>}{profile && <dl><dt>{t("Name")}</dt><dd>{profile.displayName}</dd><dt>{t("Employee code")}</dt><dd>{profile.employeeCode}</dd><dt>{t("Email")}</dt><dd>{profile.email}</dd><dt>{t("Phone")}</dt><dd>{profile.phone}</dd><dt>{t("Status")}</dt><dd>{translateStatus(profile.status)}</dd></dl>}</section>;
}
