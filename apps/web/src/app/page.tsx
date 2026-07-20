import Link from 'next/link';

// Phase 0 placeholder. Redirects to the (app) shell land in Phase 4.
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Recall</h1>
        <p style={{ color: '#5c5c58', marginTop: 8 }}>
          A WhatsApp-native second brain. The dashboard arrives in Phase 4.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link href="/sign-in" style={{ color: '#1f5fbf' }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
