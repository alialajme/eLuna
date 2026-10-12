import { API_BASE } from './api'; // existing helper that resolves localhost:3000 / 10.0.2.2:3000

export type CaseCategory = { id: string; name: string; slug: string };
export type CaseSummary = { id: string; caseNumber: string; subject: string; status: string; category: string; createdAt: string };
export type CaseDetail = { id: string; caseNumber: string; subject: string; status: string; category: string; messages: { id: string; authorRole: string; body: string; createdAt: string }[] };

export async function listCases(): Promise<CaseSummary[]> {
  const r = await fetch(`${API_BASE}/api/mobile/cases`);
  return r.ok ? ((await r.json() as { cases?: CaseSummary[] }).cases ?? []) : [];
}

export async function getCase(id: string): Promise<CaseDetail | null> {
  const r = await fetch(`${API_BASE}/api/mobile/cases/${id}`);
  return r.ok ? await r.json() as CaseDetail : null;
}

export async function createCase(input: { type: string; categoryId: string; subject: string; description: string; contactName?: string; contactPhone?: string }): Promise<{ id: string; caseNumber: string } | null> {
  const r = await fetch(`${API_BASE}/api/mobile/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.ok ? await r.json() as { id: string; caseNumber: string } : null;
}

export async function replyToCase(id: string, body: string): Promise<boolean> {
  const r = await fetch(`${API_BASE}/api/mobile/cases/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return r.ok;
}

export async function fetchCaseCategories(): Promise<CaseCategory[]> {
  const r = await fetch(`${API_BASE}/api/mobile/cases/categories`);
  return r.ok ? ((await r.json() as { categories?: CaseCategory[] }).categories ?? []) : [];
}
