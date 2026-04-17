import FantasyHeader from './FantasyHeader'

export const metadata = {
  title: 'ファンタジーサッカー',
  description: 'オリジナルクラブを作ってポイントを競おう',
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
