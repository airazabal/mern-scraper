import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

function useScrapeData(target) {
  return useQuery({
    queryKey: ['scrape', target],
    enabled: Boolean(target),
    queryFn: async () => {
      const { data } = await axios.get('/api/data', { params: { target } });
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 3000 : false,
  });
}

function Spinner({ label }) {
  return (
    <div className="d-flex align-items-center gap-2 my-3">
      <div className="spinner-border spinner-border-sm" role="status" />
      <span>{label}</span>
    </div>
  );
}

export default function Scraper() {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState('');
  const { data, isLoading, isError, error } = useScrapeData(target);

  const pending = data?.status === 'pending';

  return (
    <div>
      <div className="input-group mb-4">
        <input
          className="form-control"
          placeholder="https://example.com/rankings"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setTarget(input)}
        />
        <button className="btn btn-primary" onClick={() => setTarget(input)}>
          Scrape
        </button>
      </div>

      {isLoading && <Spinner label="Loading…" />}
      {pending && <Spinner label="Worker is scraping — auto-refreshing…" />}
      {isError && <div className="alert alert-danger">{String(error)}</div>}

      {data?.items?.length > 0 && (
        <>
          <p className="text-muted small">
            {data.status === 'ready'
              ? `Cached ${new Date(data.scrapedAt).toLocaleString()}`
              : 'Showing stale data while refreshing…'}
          </p>
          <table className="table table-striped table-sm">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.ranking}</td>
                  <td>{it.name}</td>
                  <td>
                    {it.imagePath && (
                      <img src={it.imagePath} alt="" height={32} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {data && !pending && data.items?.length === 0 && (
        <div className="alert alert-warning">
          No structured items found. The parser selectors may need adjusting for
          this site (see <code>server/scraper/parser.js</code>).
        </div>
      )}
    </div>
  );
}
