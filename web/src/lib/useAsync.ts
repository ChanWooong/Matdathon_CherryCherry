import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (next: T) => void;
}

/**
 * 비동기 로딩 상태를 한 곳에서 관리한다.
 * deps 가 바뀌면 다시 부르고, 늦게 온 응답은 버린다.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const runId = useRef(0);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    fnRef.current()
      .then((res) => { if (id === runId.current) setData(res); })
      .catch((e: unknown) => {
        if (id === runId.current) setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
      })
      .finally(() => { if (id === runId.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload, setData };
}
