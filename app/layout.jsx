import './globals.css'

export const metadata = {
  title: '💰 Fluxo de Caixa',
  description: 'Projeção diária de caixa',
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
