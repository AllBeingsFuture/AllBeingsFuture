import SessionPanel from '../sessions/SessionPanel'

export default function MainPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border-r border-l border-[#2e2e2e] bg-[#0c0c0c]">
      <SessionPanel />
    </section>
  )
}
