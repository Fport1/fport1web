'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { EnvelopeIcon, UserCircleIcon, HomeIcon } from '@heroicons/react/24/outline'

function Row({ href, label, Icon, isActive }) {
  return (
    <Link href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors cursor-pointer ${
        isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/6 hover:text-white'
      }`}>
      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-white/50'}`} />
      <span className="font-medium text-sm">{label}</span>
    </Link>
  )
}

export default function PerfilNav({ className = '' }) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const active = href => href === '/perfil' ? pathname === '/perfil' : pathname.startsWith(href)

  return (
    <aside className={`w-full ${className}`}>
      <div className="rounded-2xl border border-white/10 p-2 bg-black/40 backdrop-blur">
        <div className="space-y-0.5">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/40 select-none">Navegación</div>
          <Row href="/perfil"    label="Perfil"   Icon={UserCircleIcon} isActive={active('/perfil')} />
          <Row href="/mensajes"  label="Mensajes" Icon={EnvelopeIcon}   isActive={active('/mensajes')} />
          <div className="h-px bg-white/8 my-1" />
          <button type="button" onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:bg-white/6 hover:text-white transition-colors cursor-pointer text-left">
            <HomeIcon className="h-4 w-4 shrink-0 text-white/50" />
            <span className="font-medium text-sm">Inicio</span>
          </button>
          <button type="button" onClick={async () => { await signOut(); router.push('/') }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left">
            <span className="h-4 w-4 shrink-0" />
            <span className="font-medium text-sm">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
