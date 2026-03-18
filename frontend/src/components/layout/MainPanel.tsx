import SessionPanel from '../sessions/SessionPanel'

export default function MainPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d1117]/95 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <SessionPanel />
    </section>
  )
}
