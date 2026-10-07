import Breadcrumb from '@/components/aura/Breadcrumb';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ToastHub from '@/components/ToastHub';
import Mt5Notifs from '@/components/Mt5Notifs';
import InvestProCommandPalette from '@/components/ux/InvestProCommandPalette';
import InvestProGlobalUX from '@/components/ux/InvestProGlobalUX';
import ProductAnalytics from '@/components/analytics/ProductAnalytics';
import FeedbackWidget from '@/components/feedback/FeedbackWidget';
export default function DashboardLayout({children}:{children:React.ReactNode}){return <div className="aura-app"><Sidebar/><div className="aura-main"><div className="aura-topbar"><Breadcrumb/><Header/></div><ToastHub/><Mt5Notifs/><InvestProGlobalUX/><ProductAnalytics/><FeedbackWidget/><InvestProCommandPalette/><main className="aura-content"><div className="aura-content-inner">{children}</div></main></div></div>;}
