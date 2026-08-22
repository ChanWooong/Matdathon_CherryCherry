import { API_KEY, API_URL } from './config';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function headers(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (API_KEY) headers.set('X-API-Key', API_KEY);
  return headers;
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return `${res.status} ${res.statusText}`;
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    return parsed.detail ?? text;
  } catch {
    return text;
  }
}

/** 공용 JSON 요청. 서버 API 키가 설정된 경우 모든 요청에 포함한다. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: headers(init?.headers),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * SSE(`data: {json}\n\n`) 스트림을 읽어 이벤트마다 콜백을 부른다.
 * fetch 기반이라 POST 바디를 실을 수 있고 AbortSignal 로 중단할 수 있다.
 */
export async function streamEvents(
  path: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: headers({ Accept: 'text/event-stream' }),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new ApiError(res.status, await errorMessage(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      const payload = data.join('\n');
      if (payload) onEvent(event, JSON.parse(payload) as unknown);
      sep = buffer.indexOf('\n\n');
    }
  }
}
