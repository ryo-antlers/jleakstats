import FantasyHeader from './FantasyHeader'

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
