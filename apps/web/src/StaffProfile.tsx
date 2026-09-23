import { useEffect, useState } from 'react';
import { getUserFriendlyError, readApiError } from './error-messages.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Profile = { displayName: string; employeeCode: string; email: string; phone: string; status: string };

export function StaffProfile() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch(`${api}/staff/me`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
      setProfile(await response.json());
    }).catch((cause: Error) => setError(cause.message));
  }, []);
  return <section className="panel"><h2>My Profile</h2>{error && <p role="alert" className="error">{error}</p>}{!profile && !error && <p role="status">Loading…</p>}{profile && <dl><dt>Name</dt><dd>{profile.displayName}</dd><dt>Employee code</dt><dd>{profile.employeeCode}</dd><dt>Email</dt><dd>{profile.email}</dd><dt>Phone</dt><dd>{profile.phone}</dd><dt>Status</dt><dd>{profile.status}</dd></dl>}</section>;
}
