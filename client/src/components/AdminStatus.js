import React, { useEffect, useState, useCallback } from 'react';

// Dev-only admin/status panel. Calls /api/status (or falls back to API_URL) and shows a small box.
export default function AdminStatus({ apiUrl }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError(null);

        const paths = ['/api/status', (apiUrl || '').replace(/\/$/, '') + '/api/status'];

        for (const p of paths) {
            if (!p) continue;
            try {
                const res = await fetch(p, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                setData(json);
                setLoading(false);
                return;
            } catch (err) {
                // try next
            }
        }

        setError('Failed to fetch /api/status');
        setLoading(false);
    }, [apiUrl]);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        fetchStatus();
        const id = setInterval(fetchStatus, 10000);
        return () => clearInterval(id);
    }, [fetchStatus]);

    if (process.env.NODE_ENV !== 'development') return null;

    const boxStyle = {
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        color: 'white',
        padding: '8px 10px',
        borderRadius: 8,
        fontSize: 12,
        maxWidth: 320,
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
    };

    return (
        <div style={boxStyle}>
            <div style={{ fontWeight: '600', marginBottom: 6 }}>Sensus (dev) status</div>
            {loading && <div>Loading…</div>}
            {error && <div style={{ color: '#ff8080' }}>{error}</div>}
            {data && (
                <div style={{ lineHeight: '1.25' }}>
                    <div><strong>status:</strong> {data.status}</div>
                    {data.startup && (
                        <div style={{ marginTop: 6 }}>
                            <div><strong>host:</strong> {data.startup.host}</div>
                            <div><strong>port:</strong> {data.startup.port}</div>
                            <div><strong>ts:</strong> {data.startup.timestamp}</div>
                            {'geminiKeyPresent' in data.startup && (
                                <div><strong>geminiKeyPresent:</strong> {String(data.startup.geminiKeyPresent)}</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
