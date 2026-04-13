import type { TeamMember } from '../../../bindings/allbeingsfuture/internal/models/models'

const MEMBER_STATUS_META: Record<string, string> = {
  pending: '\u7B49\u5F85\u4E2D',
  starting: '\u542F\u52A8\u4E2D',
  running: '\u5DE5\u4F5C\u4E2D',
  idle: '\u7A7A\u95F2',
  completed: '\u5DF2\u5B8C\u6210',
  failed: '\u5931\u8D25',
}

interface MemberGroup {
  key: string
  label: string
  color: string
  members: TeamMember[]
}

interface TeamMemberListProps {
  groupedMembers: MemberGroup[]
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
}

export default function TeamMemberList({
  groupedMembers,
  selectedMemberId,
  onSelectMember,
}: TeamMemberListProps) {
  return (
    <div className="space-y-4">
      {groupedMembers.map((group) => (
        <div key={group.key} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
              <div>
                <p className="text-sm font-medium text-white">{group.label}</p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{group.key}</p>
              </div>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
              {group.members.length} {'\u6210\u5458'}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {group.members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectMember(member.id)}
                className={[
                  'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition',
                  selectedMemberId === member.id
                    ? 'border-blue-400/25 bg-blue-500/10 text-white'
                    : 'border-white/10 bg-slate-950/55 text-slate-300 hover:border-white/15 hover:bg-white/[0.04]',
                ].join(' ')}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: member.color || '#60a5fa' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.displayName || member.roleName}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{member.roleName}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {MEMBER_STATUS_META[member.status] || member.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
