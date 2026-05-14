function ErrorPage({ statusCode }: { statusCode?: number }) {
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
      <h1 style={{ fontSize: 48, fontWeight: 900, margin: '0 0 12px' }}>
        {statusCode ?? 'Error'}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: 0 }}>
        {statusCode === 404 ? 'Page not found' : 'An unexpected error occurred'}
      </p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode?: number }; err?: { statusCode?: number } }) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;
