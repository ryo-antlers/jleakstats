'use client'
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '80vh',
    }}>
      <SignUp
        appearance={{
          variables: {
            colorBackground: '#111111',
            colorInputBackground: '#1a1a1a',
            colorInputText: '#ffffff',
            colorText: '#ffffff',
            colorTextSecondary: '#888888',
            colorPrimary: '#00ff87',
            colorDanger: '#ef5350',
            borderRadius: '0px',
            fontFamily: 'inherit',
          },
          elements: {
            card: { boxShadow: 'none', border: '1px solid #2a2a2a', backgroundColor: '#111111' },
            headerTitle: { color: '#ffffff', fontSize: '18px', fontWeight: '700', letterSpacing: '0.06em' },
            headerSubtitle: { color: '#666666' },
            formButtonPrimary: { backgroundColor: '#00ff87', color: '#000000', fontWeight: '700', letterSpacing: '0.06em' },
            footerActionLink: { color: '#00ff87' },
            formFieldLabel: { color: '#888888', fontSize: '11px', letterSpacing: '0.1em' },
            dividerLine: { backgroundColor: '#2a2a2a' },
            dividerText: { color: '#444444' },
          },
          layout: { logoPlacement: 'none' },
        }}
      />
    </div>
  )
}
