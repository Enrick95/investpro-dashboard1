'use client';

import { useLocale } from "@/components/i18n/LocaleProvider";
import { useState } from 'react';
import { Bot, ExternalLink, Globe2, Newspaper, Sparkles } from 'lucide-react';
import { currencies, pairs } from '@/lib/fundamentals/catalog';

export default function FundamentalAnalysis() {
  const { t: translate } = useLocale();

  const [pair, setPair] = useState('CHFJPY');
  const base = pair.slice(0, 3);
  const quote = pair.slice(3);

  return (
    <div className="fa-workspace">
      <section className="fa-hero">
        <div>
          <span className="fa-eyebrow"><Globe2 size={15} /> {" "}{translate("LE CONTEXTE AVANT LE TRADE")}</span>
          <h2>{translate("Une analyse claire.")}<br /><em>{translate("Quand elle sera prête.")}</em></h2>
          <p>{translate("Nous préparons un assistant qui pourra analyser une paire ou un indice, expliquer les facteurs macroéconomiques et appuyer ses observations sur des sources vérifiables.")}</p>
        </div>
        <div className="fa-search">
          <span className="fa-coming-soon"><Sparkles size={15} /> {" "}{translate("Bientôt disponible")}</span>
          <label htmlFor="fa-pair">{translate("Instrument prévu")}</label>
          <select id="fa-pair" value={pair} onChange={(event) => setPair(event.target.value)}>
            {pairs.map((item) => <option key={item} value={item}>{item.slice(0, 3)} / {item.slice(3)}{item === 'XAUUSD' ? translate(" · GOLD") : ''}</option>)}
          </select>
          <button className="fa-primary" type="button" disabled aria-disabled="true"><Bot size={18} /> {" "}{translate("Assistant en préparation")}</button>
          <span className="fa-meta">{translate("Aucune analyse payante n’est lancée pour le moment.")}</span>
        </div>
      </section>

      <section className="fa-card fa-roadmap" aria-label={translate("Fonctions prévues")}>
        <div className="fa-roadmap-heading"><span className="fa-roadmap-icon"><Bot size={21} /></span><div><span className="fa-eyebrow">{translate("ASSISTANT IA DE MARCHÉ")}</span><h3>{translate("Ce qui se prépare")}</h3></div></div>
        <div className="fa-roadmap-grid">
          <div><strong>01</strong><h4>{translate("Choisir un instrument")}</h4><p>{translate("Indiquez une paire de devises ou un indice à étudier.")}</p></div>
          <div><strong>02</strong><h4>{translate("Lire le contexte")}</h4><p>{translate("Retrouvez les publications économiques et les facteurs qui peuvent compter.")}</p></div>
          <div><strong>03</strong><h4>{translate("Comprendre les scénarios")}</h4><p>{translate("Une synthèse sourcée, avec ses incertitudes clairement expliquées.")}</p></div>
        </div>
      </section>

      <div className="fa-currencies">
        {[base, quote].map((code, index) => (
          <section className="fa-card" key={code}>
            <span className="fa-eyebrow">{index === 0 ? translate("01 · DEVISE DE BASE") : translate("02 · DEVISE DE COTATION")}</span>
            <div className="fa-currency-title"><h3>{code}</h3><span>{translate(currencies[code].name)}</span></div>
            <p>{translate(currencies[code].focus)}</p>
            <a href={currencies[code].url} target="_blank" rel="noopener noreferrer">{translate(currencies[code].bank)}<ExternalLink size={15} /></a>
          </section>
        ))}
      </div>

      <div className="fa-footer"><span><Newspaper size={14} /> {" "}{translate("En attendant, consultez les sources officielles des devises.")}</span><a href="https://fr.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">{translate("Calendrier économique")}{" "}<ExternalLink size={14} /></a></div>
    </div>
  );
}
