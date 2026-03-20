import { User, Shield, LogOut } from 'lucide-react'

export default function AccountTab() {
  return (
    <div className="space-y-6">
      {/* Not logged in state */}
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-dark-bg rounded-full flex items-center justify-center border border-dark-border">
          <User size={28} className="text-gray-500" />
        </div>
        <h4 className="text-lg font-medium mb-2">尚未登录</h4>
        <p className="text-sm text-gray-400 mb-6">登录后可同步设置、获取高级功能和在线支持。</p>

        <button
          disabled
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
        >
          登录 / 注册（即将推出）
        </button>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Shield, title: '云端同步', desc: '设置和配置跨设备同步' },
          { icon: User, title: '团队协作', desc: '多人共享工作区和 Agent 编排' },
          { icon: LogOut, title: '优先支持', desc: '获得技术支持和优先反馈响应' },
        ].map(item => (
          <div key={item.title} className="p-3 bg-dark-bg border border-dark-border rounded-lg text-center">
            <item.icon size={20} className="mx-auto mb-2 text-gray-500" />
            <p className="text-xs font-medium mb-1">{item.title}</p>
            <p className="text-[10px] text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 text-center">
        账号功能正在开发中，当前所有功能均可离线使用，无需登录。
      </p>
    </div>
  )
}
