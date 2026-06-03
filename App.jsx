import { useState } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const queryClient = new QueryClient();

function useScrapeData(target) {
  return useQuery({
    queryKey: ['scrape', target],
    enabled: Boolean(target),
    queryFn: async () => {
      const { data } = await axios.get(`${API}/api/data`, { params: { target } });
      return data; // { status: 'ready' | 'pending', items, scrapedAt }
    },
    // Keep polling while the worker is still scraping
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 3000 : false,
  });
}

function Results() {
  const [target, setTarget] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isLoading, isError, error } = useScrapeData(submitted);

  const pending = data?.status === 'pending';

  return (
    <div className="container py-4">
      <h1 className="mb-3">Scraper</h1>

      <div className="input-group mb-4">
        <input
          className="form-control"
          placeholder="https://example.com/rankings"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => setSubmitted(target)}>
          Scrape
        </button>
      </div>

      {isLoading && <Spinner label="Loading…" />}
      {pending && <Spinner label="Scraping in background — refreshing automatically…" />}
      {isError && <div className="alert alert-danger">{String(error)}</div>}

      {data?.items?.length > 0 && (
        <>
          {data.scrapedAt && (
            <p className="text-muted small">
              Cached {new Date(data.scrapedAt).toLocaleString()}
            </p>
          )}
          <table className="table table-striped">
            <thead>
              <tr><th>#</th><th>Name</th><th>Image</th></tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.ranking}</td>
                  <td>{it.name}</td>
                  <td>{it.imagePath && <img src={it.imagePath} alt="" height={32} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div className="d-flex align-items-center gap-2 my-3">
      <div className="spinner-border spinner-border-sm" role="status" />
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Results />
    </QueryClientProvider>
  );
}
