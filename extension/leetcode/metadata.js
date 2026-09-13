import { extractDomMetadata } from './selectors.js';

const query = `query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId questionId title titleSlug topicTags { name } companyTagStats } }`;
const fallbackQuery = `query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId questionId title titleSlug topicTags { name } } }`;

function companyNames(value) {
  if (!value) return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  const names = [];
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    const name = item.name ?? item.companyName ?? item.company?.name;
    if (typeof name === 'string') names.push(name);
    for (const key of ['companies', 'companyTags', 'data']) if (item[key]) visit(item[key]);
  };
  visit(parsed);
  return names;
}

async function requestQuestion(slug, graphqlQuery, fetcher) {
  const response = await fetcher('https://leetcode.com/graphql/', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName: 'questionData', query: graphqlQuery, variables: { titleSlug: slug } }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.data?.question ?? null;
}

export async function fetchProblemMetadata(slug, { fetcher = fetch, document = globalThis.document, contestSlug = null } = {}) {
  let question;
  try { question = await requestQuestion(slug, query, fetcher); } catch { question = null; }
  if (!question) {
    try { question = await requestQuestion(slug, fallbackQuery, fetcher); } catch { question = null; }
  }
  if (typeof contestSlug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(contestSlug) && contestSlug.length <= 200 && !question) {
    try {
      const response = await fetcher(`https://leetcode.com/contest/api/info/${contestSlug}/`, { credentials: 'include' });
      const payload = response.ok ? await response.json() : null;
      const item = payload?.contest?.title_slug === contestSlug && Array.isArray(payload.questions) ? payload.questions.find((entry) => entry.title_slug === slug) : null;
      if (item) question = { questionFrontendId: /^\d+$/.test(String(item.display_id ?? '')) ? item.display_id : item.question_id, title: item.title, titleSlug: item.title_slug };
    } catch { /* Missing contest metadata fails validation, never publishes incomplete data. */ }
  }
  const dom = document ? extractDomMetadata(document, slug) : {};
  return {
    problemNumber: question?.questionFrontendId ?? question?.questionId ?? dom.problemNumber,
    problemTitle: question?.title ?? dom.problemTitle,
    problemSlug: question?.titleSlug ?? slug,
    topics: question?.topicTags?.map((tag) => tag?.name).filter(Boolean) ?? dom.topics ?? [],
    companies: companyNames(question?.companyTagStats).length ? companyNames(question.companyTagStats) : dom.companies ?? [],
  };
}

export function createMetadataProvider(options) {
  const cache = new Map();
  return {
    get(slug, contestSlug = null) {
      const key = `${contestSlug ?? ''}:${slug}`;
      if (!cache.has(key)) cache.set(key, fetchProblemMetadata(slug, { ...options, contestSlug }));
      return cache.get(key);
    },
    navigation() { cache.clear(); },
  };
}
