export const PROBLEM_MATCHES = ['https://leetcode.com/problems/*', 'https://leetcode.com/contest/*/problems/*'];

export function parseProblemUrl(value) {
  try {
    const url = new URL(value, 'https://leetcode.com');
    if (url.origin !== 'https://leetcode.com' || url.username || url.password) return null;
    const slug = '[a-z0-9]+(?:-[a-z0-9]+)*';
    const normal = url.pathname.match(new RegExp(`^/problems/(${slug})(?:/|$)`));
    const contest = url.pathname.match(new RegExp(`^/contest/(${slug})/problems/(${slug})(?:/|$)`));
    if (normal && normal[1].length <= 200) return { problemSlug: normal[1], contestSlug: null, pageType: 'normal' };
    if (contest && contest[1].length <= 200 && contest[2].length <= 200) return { problemSlug: contest[2], contestSlug: contest[1], pageType: 'contest' };
  } catch { /* Invalid or foreign URL. */ }
  return null;
}

export function parseSubmitUrl(value) {
  try {
    const url = new URL(value);
    if (!/^\/(?:problems\/[a-z0-9-]+|contest\/(?:api\/)?[a-z0-9-]+\/problems\/[a-z0-9-]+)\/submit\/?$/.test(url.pathname)) return null;
    return parseProblemUrl(url.href.replace('/contest/api/', '/contest/'));
  } catch { return null; }
}
