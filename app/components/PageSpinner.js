// ページ遷移中に出すローディングスピナー
//   /rating/[id]/loading.js や /u/[id]/match/[fixture_id]/loading.js から使う
export default function PageSpinner() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 40, height: 40,
        borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.12)',
        borderTopColor: '#00ff87',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}
