import Link from 'next/link';

export default function NotFound() {
  return (
    <div
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
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          background: 'rgba(26,107,60,0.12)',
          border: '1px solid rgba(26,107,60,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          fontSize: 32,
        }}
      >
        404
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px' }}>Page Not Found</h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '0 0 32px', maxWidth: 320 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          background: 'linear-gradient(135deg, #1A6B3C 0%, #22913f 100%)',
          color: 'white',
          padding: '12px 28px',
          borderRadius: 12,
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
