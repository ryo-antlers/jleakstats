export default function FantasyLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 16,
    }}>
      <div style={{
        width: 36,
        height: 36,
        border: '3px solid var(--border-color)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <p style={{ fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        Loading
      </p>
    </div>
  )
}
