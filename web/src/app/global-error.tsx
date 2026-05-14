'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html>
      <body
        style={{
          minHeight: '100vh',
          background: '#0c1a0f',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '24px',
          margin: 0,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: 'rgba(200,50,50,0.12)',
            border: '1px solid rgba(200,50,50,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            fontSize: 32,
          }}
        >
          500
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px' }}>Something went wrong</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '0 0 32px', maxWidth: 320 }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            background: 'linear-gradient(135deg, #1A6B3C 0%, #22913f 100%)',
            color: 'white',
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
