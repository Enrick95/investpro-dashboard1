"use client";

export default function InstallCheck() {
  return <section style={{padding:24,minHeight:"150vh"}}>
    <h1>Vérification du guide d’installation</h1>
    <p>Cette page de test utilise le guide et le menu mobile réels, sans compte ni données personnelles.</p>
    <button type="button" onClick={()=>window.dispatchEvent(new Event("investpro:open-install-guide"))} style={{marginTop:20,padding:16,border:"1px solid #e0b64f",borderRadius:12}}>
      InvestPro Mobile · Installer l’application
    </button>
  </section>;
}
