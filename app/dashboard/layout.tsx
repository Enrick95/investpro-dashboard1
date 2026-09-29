import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ToastHub from '@/components/ToastHub';
import Mt5Notifs from '@/components/Mt5Notifs';
export default function DashboardLayout({children}:{children:React.ReactNode}){return <div className="aura-app"><Sidebar/><div className="aura-main"><div className="aura-topbar"><Header/></div><ToastHub/><Mt5Notifs/><main className="aura-content"><div className="aura-content-inner">{children}</div></main></div></div>;}
