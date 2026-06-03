import { useState } from 'react';
import Scraper from './components/Scraper.jsx';
import AgentDashboard from './components/AgentDashboard.jsx';

const TABS = ['Scraper', 'Agent'];

export default function App() {
  const [tab, setTab] = useState('Scraper');

  return (
    <div className="container py-4" style={{ maxWidth: 800 }}>
      <div className="d-flex align-items-baseline gap-3 mb-4">
        <h1 className="h4 mb-0">MERN Scraper</h1>
        <ul className="nav nav-pills">
          {TABS.map((t) => (
            <li key={t} className="nav-item">
              <button
                className={`nav-link py-1 px-3 ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {tab === 'Scraper' && <Scraper />}
      {tab === 'Agent' && <AgentDashboard />}
    </div>
  );
}
