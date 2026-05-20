import './globals.css'
import { AuthProvider } from '@/components/auth-context'
import Nav from '@/components/Nav'

export const metadata = {
  title: 'Fport1',
  description: 'ModpackLauncher — El launcher de Minecraft definitivo',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <AuthProvider>
          <Nav />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}