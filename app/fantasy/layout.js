import FantasyHeader from './FantasyHeader'

export const metadata = {
  title: 'Fantasy J.League',
  description: 'クラブを作って選手を集めて試合を観る',
}

export default function FantasyLayout({ children }) {
  return (
    <>
      <FantasyHeader />
      <div style={{ paddingTop: 56 }}>
        {children}
      </div>
    </>
  )
}
