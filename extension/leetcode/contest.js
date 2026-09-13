// Timing is fetched in ISOLATED; MAIN-world candidates cannot supply an end time.
export async function fetchContestTiming(slug, fetcher = fetch) {
  const unknown = { slug, endsAt: null };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return unknown;
  try {
    const response = await fetcher(`https://leetcode.com/contest/api/info/${slug}/`, { credentials: 'include' });
    if (!response.ok) return unknown;
    const contest = (await response.json())?.contest;
    if (contest?.title_slug !== slug) return unknown;
    const start = Number(contest.start_time);
    const duration = Number(contest.duration);
    if (!Number.isSafeInteger(start) || start <= 0 || !Number.isSafeInteger(duration) || duration <= 0 || duration > 604800) return unknown;
    const end = new Date((start + duration) * 1000);
    return Number.isFinite(end.getTime()) ? { slug, endsAt: end.toISOString() } : unknown;
  } catch { return unknown; }
}

export function validateContest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['slug', 'endsAt'].includes(key)) || typeof value.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) || value.slug.length > 200) throw new Error('INVALID_CONTEST');
  if (value.endsAt !== null && (typeof value.endsAt !== 'string' || !Number.isFinite(Date.parse(value.endsAt)) || new Date(value.endsAt).toISOString() !== value.endsAt)) throw new Error('INVALID_CONTEST');
  return { slug: value.slug, endsAt: value.endsAt };
}
